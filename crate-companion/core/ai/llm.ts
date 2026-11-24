import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { AiModelId, TokenCounts } from '../../shared/ai-models';
import { TASKS, type TaskContent, type TaskId, type TaskOutput } from './tasks';

export interface AskOptions<K extends TaskId> {
  task: K;
  content: TaskContent;
}

/** One AI task, answered in its fixed shape. What the features call; tests fake it. */
export type Ask = <K extends TaskId>(o: AskOptions<K>) => Promise<TaskOutput<K>>;

/** What a request used: the model that answered (it can differ after a fallback) and its tokens. */
export interface Usage {
  model: string;
  tokens: TokenCounts;
}

/** What's left of the app's included AI this month, when the AI server answered. */
export interface Allowance {
  used: number;
  limit: number;
  /** The first day of next month, when it starts over ("2026-12-01"). */
  resetsOn: string;
}

export interface Answer<K extends TaskId> {
  output: TaskOutput<K>;
  usage?: Usage;
  allowance?: Allowance;
}

export interface AiBackend {
  /** `use` names the feature use a request belongs to (one photo identify is two requests). */
  ask<K extends TaskId>(o: AskOptions<K>, model: AiModelId, use?: string): Promise<Answer<K>>;
  /** Checks the key works and can use the model (a free request). */
  check(model: AiModelId): Promise<void>;
}

/** An error the app can show as-is. `status` follows HTTP so the server can pass it on. */
export class AiError extends Error {
  /** A request that was answered but not usable still costs money; this is what it used. */
  constructor(public status: number, message: string, public usage?: Usage) { super(message); }
}

export function explain(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError(400, 'Your Anthropic API key was rejected. Check it in Settings.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError(400, `Your Anthropic account can't use this yet: ${e.message}`);
  if (e instanceof Anthropic.RateLimitError) return new AiError(429, 'The AI is busy (rate limit). Wait a minute and try again.');
  if (e instanceof Anthropic.BadRequestError) return new AiError(400, `The AI couldn't take this request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError(502, "Couldn't reach the AI. Check your connection and try again.");
  if (e instanceof Anthropic.APIError) return new AiError(502, `The AI service had a problem (${e.status ?? 'no status'}). Try again.`);
  return new AiError(500, e instanceof Error ? e.message : String(e));
}

/** Opus and Sonnet can hand a request a safety check declined to another model; Haiku can't. */
const HAS_FALLBACK: Record<AiModelId, boolean> = {
  'claude-opus-5-5': true,
  'claude-sonnet-5-5': true,
  'claude-haiku-5-5': false,
};

/**
 * Runs one task on Claude. Used by the app with the user's own key and by the AI server with
 * the app's key, so both send exactly the same request.
 */
export async function runTask<K extends TaskId>(client: Anthropic, model: AiModelId, o: AskOptions<K>, maxTokens = 16000): Promise<{ output: TaskOutput<K>; usage: Usage }> {
  const t = TASKS[o.task];
  let res;
  try {
    res = await client.beta.messages.parse({
      model,
      max_tokens: maxTokens,
      // If a safety check declines the request, let the API retry it on another model.
      ...(HAS_FALLBACK[model] ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { effort: t.effort, format: betaZodOutputFormat(t.schema) },
      system: t.system,
      messages: [{ role: 'user', content: o.content }],
    });
  } catch (e) {
    throw explain(e);
  }
  const u = res.usage;
  const usage: Usage = {
    model: res.model || model,
    tokens: {
      input: u?.input_tokens ?? 0,
      output: u?.output_tokens ?? 0,
      cacheRead: u?.cache_read_input_tokens ?? 0,
      cacheWrite: u?.cache_creation_input_tokens ?? 0,
    },
  };
  if (res.stop_reason === 'refusal') throw new AiError(422, 'The AI declined to answer this one. Try wording it differently.', usage);
  if (res.stop_reason === 'max_tokens') throw new AiError(502, 'The AI ran out of room before finishing. Try a narrower request.', usage);
  if (res.parsed_output == null) throw new AiError(502, "The AI's answer couldn't be read. Try again.", usage);
  return { output: res.parsed_output as TaskOutput<K>, usage };
}

/**
 * Claude through the official SDK, with the user's own API key. The installed apps call the
 * API straight from the device (the API allows this when the client opts in), so there's no
 * server in between and the key never leaves the device except to go to Anthropic.
 */
export function anthropicBackend(apiKey: string): AiBackend {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 3 * 60_000 });
  return {
    async check(model) {
      try { await client.models.retrieve(model); } catch (e) { throw explain(e); }
    },
    ask: (o, model) => runTask(client, model, o),
  };
}
