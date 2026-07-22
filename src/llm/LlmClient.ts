// LLM transport abstraction (dev plan §4). MVP: direct OpenRouter fetch with a
// local BYO key. A future proxy backend is a second implementation — no UI changes.

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  /**
   * Send a chat completion request.
   * @param onToken streaming callback — invoked per token/chunk when supported.
   * @returns the full assistant response text.
   */
  chat(
    messages: LlmMessage[],
    model: string,
    onToken?: (token: string) => void,
  ): Promise<string>;
}
