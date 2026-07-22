// Curated model catalog for the Settings pickers.
//
// Open-weights models are the primary group (PRD §1 differentiator: "no
// proprietary walled gardens"); commercial models are a clearly-marked
// opt-in group. Any OpenRouter model id can be typed via "Custom…", so this
// list is a convenience, not a restriction — browse https://openrouter.ai/models
// for the current catalog and pricing.

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export interface ModelGroup {
  label: string;
  options: ModelOption[];
}

/** Post-run coaching chat: needs speed and reliable 3-section formatting. */
export const CHAT_MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Open weights',
    options: [
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        label: 'Llama 3.3 70B',
        note: 'balanced default',
      },
      {
        id: 'qwen/qwen-2.5-72b-instruct',
        label: 'Qwen 2.5 72B',
        note: 'comparable, cheap',
      },
      {
        id: 'deepseek/deepseek-chat',
        label: 'DeepSeek V3',
        note: 'strong, very cheap',
      },
    ],
  },
  {
    label: 'Commercial (higher cost)',
    options: [
      {
        id: 'anthropic/claude-haiku-4.5',
        label: 'Claude Haiku 4.5',
        note: 'fast, precise formatting',
      },
      {
        id: 'google/gemini-2.0-flash-001',
        label: 'Gemini 2.0 Flash',
        note: 'very fast',
      },
    ],
  },
];

/**
 * Plan generation: needs reliable structured JSON over a long horizon.
 * Reasoning models score highest but are dramatically slower — which is
 * fragile on mobile connections. Instruct models are ~20x faster and are
 * backed by our strict schema validation + automatic retry.
 */
export const PLAN_MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Open weights — reasoning (slow, thorough)',
    options: [
      {
        id: 'deepseek/deepseek-r1',
        label: 'DeepSeek R1',
        note: 'highest quality, minutes not seconds',
      },
      { id: 'qwen/qwq-32b', label: 'QwQ 32B', note: 'reasoning, faster than R1' },
    ],
  },
  {
    label: 'Open weights — instruct (fast)',
    options: [
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        label: 'Llama 3.3 70B',
        note: 'seconds, best for mobile',
      },
      { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', note: 'seconds' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', note: 'seconds' },
    ],
  },
  {
    label: 'Commercial (higher cost)',
    options: [
      {
        id: 'anthropic/claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        note: 'excellent structured JSON',
      },
      {
        id: 'google/gemini-2.0-flash-001',
        label: 'Gemini 2.0 Flash',
        note: 'fast',
      },
    ],
  },
];

export function isKnownModel(groups: ModelGroup[], id: string): boolean {
  return groups.some((g) => g.options.some((o) => o.id === id));
}
