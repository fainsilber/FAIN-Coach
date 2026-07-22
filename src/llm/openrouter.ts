import type { LlmClient, LlmMessage } from './LlmClient';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Model tiers (PRD §3): fast tier for post-run chat, reasoning tier for plans.
export const DEFAULT_FAST_MODEL = 'meta-llama/llama-3.3-70b-instruct';
export const DEFAULT_REASONING_MODEL = 'deepseek/deepseek-r1';

/**
 * Sprint 3 target — OpenRouter implementation of LlmClient with SSE streaming.
 * Error handling required: invalid key, rate limits, offline state.
 */
export class OpenRouterClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  async chat(
    _messages: LlmMessage[],
    _model: string,
    _onToken?: (token: string) => void,
  ): Promise<string> {
    void this.apiKey;
    throw new Error('Not implemented — Sprint 3');
  }
}
