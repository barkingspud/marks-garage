import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { AiModelId, TokenCounts } from '../../shared/ai-models';

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

export interface AskOptions<T extends z.ZodType> {
  system: string;
  content: Content;
  /** The shape the answer must have; the API guarantees it (structured outputs). */
  schema: T;
  /** How hard the model thinks. Low for quick lookups, medium (the model's default) otherwise. */
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

/** One question to the AI, answered in the given shape. What the features call; tests fake it. */
export type Ask = <T extends z.ZodType>(o: AskOptions<T>) => Promise<z.infer<T>>;

/** What a request used: the model that answered (it can differ after a fallback) and its tokens. */
export interface Usage {
  model: string;
  tokens: TokenCounts;
}

export interface AiBackend {
  ask<T extends z.ZodType>(o: AskOptions<T>, model: AiModelId): Promise<{ output: z.infer<T>; usage?: Usage }>;
  /** Checks the key works and can use the model (a free request). */
  check(model: AiModelId): Promise<void>;
}

/** Opus and Sonnet can hand a request a safety check declined to another model; Haiku can't. */
const HAS_FALLBACK: Record<AiModelId, boolean> = {
  'claude-opus-5-5': true,
  'claude-sonnet-5-5': true,
  'claude-haiku-5-5': false,
};

/** An error the app can show as-is. `status` follows HTTP so the server can pass it on. */
export class AiError extends Error {
  /** A request that was answered but not usable still costs money; this is what it used. */
  constructor(public status: number, message: string, public usage?: Usage) { super(message); }
}

function explain(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError(400, 'Your Anthropic API key was rejected. Check it in Settings.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError(400, `Your Anthropic account can't use this yet: ${e.message}`);
  if (e instanceof Anthropic.RateLimitError) return new AiError(429, 'The AI is busy (rate limit). Wait a minute and try again.');
  if (e instanceof Anthropic.BadRequestError) return new AiError(400, `The AI couldn't take this request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError(502, "Couldn't reach the AI. Check your connection and try again.");
  if (e instanceof Anthropic.APIError) return new AiError(502, `The AI service had a problem (${e.status ?? 'no status'}). Try again.`);
  return new AiError(500, e instanceof Error ? e.message : String(e));
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
    async ask<T extends z.ZodType>(o: AskOptions<T>, model: AiModelId) {
      let res;
      try {
        res = await client.beta.messages.parse({
          model,
          max_tokens: o.maxTokens ?? 16000,
          // If a safety check declines the request, let the API retry it on another model.
          ...(HAS_FALLBACK[model] ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          output_config: { effort: o.effort ?? 'medium', format: betaZodOutputFormat(o.schema) },
          system: o.system,
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
      return { output: res.parsed_output as z.infer<T>, usage };
    },
  };
}
