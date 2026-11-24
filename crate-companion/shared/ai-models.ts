/** The Claude models the app can use, with Anthropic's prices (U.S. dollars per million tokens). */

export type AiModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5';

export interface AiPrice {
  input: number;
  output: number;
  cacheRead: number;
}

export interface AiModelInfo {
  id: AiModelId;
  name: string;
  blurb: string;
  /** A rough cost of one use of an AI feature, for the picker. */
  perUse: string;
  price: AiPrice;
  /** Some models charge more for long prompts: this price applies above `over` input tokens. */
  long?: { over: number; price: AiPrice };
}

export const AI_MODELS: AiModelInfo[] = [
  {
    id: 'claude-haiku-5-5', name: 'Haiku 5.5', blurb: 'Fastest and cheapest.', perUse: 'under 1¢ a use',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01 },
    long: { over: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05 } },
  },
  {
    id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', blurb: 'A balance of quality and cost.', perUse: 'about 3 to 10¢ a use',
    price: { input: 2, output: 10, cacheRead: 0.1 },
  },
  {
    id: 'claude-opus-5-5', name: 'Opus 5.5', blurb: 'The most capable, and the most expensive.', perUse: 'about 5 to 20¢ a use',
    price: { input: 4, output: 20, cacheRead: 0.2 },
  },
];

export const DEFAULT_AI_MODEL: AiModelId = 'claude-haiku-5-5';

export function modelInfo(id: string): AiModelInfo | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

export function isAiModel(id: unknown): id is AiModelId {
  return typeof id === 'string' && !!modelInfo(id);
}

/** Tokens one request used, as the API reports them. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What a request cost in U.S. dollars, from Anthropic's list prices. Cache writes are 1.25 times input. */
export function costOf(modelId: string, t: TokenCounts): number {
  const m = modelInfo(modelId);
  if (!m) return 0;
  const prompt = t.input + t.cacheRead + t.cacheWrite;
  const p = m.long && prompt > m.long.over ? m.long.price : m.price;
  return (t.input * p.input + t.cacheWrite * p.input * 1.25 + t.cacheRead * p.cacheRead + t.output * p.output) / 1_000_000;
}
