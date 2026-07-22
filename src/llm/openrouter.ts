import { LlmError, type LlmClient, type LlmMessage } from './LlmClient';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Model tiers (PRD §3): fast tier for post-run chat, reasoning tier for plans.
export const DEFAULT_FAST_MODEL = 'meta-llama/llama-3.3-70b-instruct';
export const DEFAULT_REASONING_MODEL = 'deepseek/deepseek-r1';

function errorFromStatus(status: number, detail: string): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError('invalid-key', 'OpenRouter rejected the API key.');
  }
  if (status === 402) {
    return new LlmError('invalid-key', 'OpenRouter account has no credits.');
  }
  if (status === 429) {
    return new LlmError('rate-limit', 'Rate limited by OpenRouter.');
  }
  return new LlmError('server', `OpenRouter error ${status}: ${detail}`);
}

/** OpenRouter implementation of LlmClient with SSE streaming. */
export class OpenRouterClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  async chat(
    messages: LlmMessage[],
    model: string,
    onToken?: (token: string) => void,
  ): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Attribution headers recommended by OpenRouter
          'HTTP-Referer': 'https://github.com/fainsilber/FAIN-Coach',
          'X-Title': 'FAIN Coach',
        },
        body: JSON.stringify({ model, messages, stream: true }),
      });
    } catch {
      throw new LlmError('network', 'Could not reach OpenRouter.');
    }

    if (!res.ok) {
      throw errorFromStatus(res.status, (await res.text()).slice(0, 300));
    }
    if (!res.body) {
      throw new LlmError('bad-response', 'OpenRouter returned no body.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        // SSE comments (": OPENROUTER PROCESSING" keep-alives) and blanks
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          return full;
        }
        let token: string | undefined;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          token = parsed.choices?.[0]?.delta?.content;
        } catch {
          continue; // partial/malformed frame — skip
        }
        if (token) {
          full += token;
          onToken?.(token);
        }
      }
    }
    return full;
  }
}
