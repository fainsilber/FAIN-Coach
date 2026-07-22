import {
  LlmError,
  type LlmChatOptions,
  type LlmClient,
  type LlmMessage,
} from './LlmClient';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const DEFAULT_FAST_MODEL = 'meta-llama/llama-3.3-70b-instruct';

/**
 * The PRD assumed a "reasoning tier" for plans. A/B testing (2026-07-22)
 * showed an instruct model produces an equally sound plan — better taper,
 * correct per-type paces — in 67s versus DeepSeek R1's 267s, once the prompt
 * states the taper and pace rules explicitly. Speed matters here: minutes-long
 * generations are what fail on mobile connections. R1 remains one tap away in
 * Settings for anyone who wants its richer workout descriptions.
 */
export const DEFAULT_PLAN_MODEL = 'meta-llama/llama-3.3-70b-instruct';

// Observed in live testing: ~1 in 3 requests failed with a connection error
// before any bytes arrived, then succeeded immediately on retry. Only the
// connection phase is retried — once tokens stream, a retry would duplicate
// output, so mid-stream failures still surface to the user.
const MAX_CONNECT_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient gateway failures worth retrying; 4xx never is. */
function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

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
    options: LlmChatOptions = {},
  ): Promise<string> {
    const idleMs = options.idleTimeoutMs ?? 90_000;
    const controller = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), idleMs);
    };

    try {
      let res: Response | undefined;
      let lastError: LlmError | undefined;

      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        armIdleTimer();
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
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) {
            throw new LlmError(
              'network',
              'The model stopped responding. Try again, or switch models in Settings.',
            );
          }
          lastError = new LlmError('network', 'Could not reach OpenRouter.');
          res = undefined;
        }

        if (res && !res.ok) {
          const error = errorFromStatus(res.status, (await res.text()).slice(0, 300));
          if (!isRetryableStatus(res.status)) throw error; // auth, rate limit, bad request
          lastError = error;
          res = undefined;
        }

        if (res) break;
        if (attempt < MAX_CONNECT_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt);
      }

      if (!res) {
        throw lastError ?? new LlmError('network', 'Could not reach OpenRouter.');
      }
      if (!res.body) {
        throw new LlmError('bad-response', 'OpenRouter returned no body.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        armIdleTimer();
        try {
          chunk = await reader.read();
        } catch {
          throw new LlmError(
            'network',
            'The model stopped responding mid-stream. Try again, or switch models in Settings.',
          );
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

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
          let delta: { content?: string; reasoning?: string } | undefined;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; reasoning?: string } }>;
            };
            delta = parsed.choices?.[0]?.delta;
          } catch {
            continue; // partial/malformed frame — skip
          }
          if (delta?.reasoning) options.onReasoning?.(delta.reasoning);
          if (delta?.content) {
            full += delta.content;
            onToken?.(delta.content);
          }
        }
      }
      return full;
    } finally {
      clearTimeout(idleTimer);
    }
  }
}
