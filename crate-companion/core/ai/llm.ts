import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

/** The model every AI feature uses. */
export const AI_MODEL = 'claude-opus-5-5';

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

/** One question to the AI, answered in the given shape. Injected so tests can fake it. */
export type Ask = <T extends z.ZodType>(o: AskOptions<T>) => Promise<z.infer<T>>;

export interface AiBackend {
  ask: Ask;
  /** Checks the key works (a free request). */
  check(): Promise<void>;
}

/** An error the app can show as-is. `status` follows HTTP so the server can pass it on. */
export class AiError extends Error {
  constructor(public status: number, message: string) { super(message); }
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
    async check() {
      try { await client.models.retrieve(AI_MODEL); } catch (e) { throw explain(e); }
    },
    ask: async <T extends z.ZodType>(o: AskOptions<T>) => {
      let res;
      try {
        res = await client.beta.messages.parse({
          model: AI_MODEL,
          max_tokens: o.maxTokens ?? 16000,
          // If a safety check declines the request, let the API retry it on another model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: o.effort ?? 'medium', format: betaZodOutputFormat(o.schema) },
          system: o.system,
          messages: [{ role: 'user', content: o.content }],
        });
      } catch (e) {
        throw explain(e);
      }
      if (res.stop_reason === 'refusal') throw new AiError(422, 'The AI declined to answer this one. Try wording it differently.');
      if (res.stop_reason === 'max_tokens') throw new AiError(502, 'The AI ran out of room before finishing. Try a narrower request.');
      if (res.parsed_output == null) throw new AiError(502, "The AI's answer couldn't be read. Try again.");
      return res.parsed_output as z.infer<T>;
    },
  };
}
