import { costOf } from '../../shared/ai-models';
import { AiError, type Usage } from '../../core/ai/llm';
import { checkContent, isTaskId, type TaskContent, type TaskId } from '../../core/ai/tasks';
import type { Allowance, Verdict } from './meter';

/**
 * The AI server's requests:
 *   POST /v1/ask        { task, content, use }  -> { output, usage, allowance }
 *   GET  /v1/allowance                          -> { used, limit, resetsOn }
 * Each install sends its id in X-Install-Id. Only the app's own tasks run (core/ai/tasks.ts),
 * always on Claude Haiku 5.5, within the limits in wrangler.toml.
 */

export const MODEL = 'claude-haiku-5-5' as const;

export interface Deps {
  enabled: boolean;
  meter: {
    reserve(install: string, use: string, ip: string): Promise<Verdict>;
    refund(install: string, use: string): Promise<void>;
    spend(usd: number): Promise<void>;
    allowance(install: string): Promise<Allowance>;
  };
  run(task: TaskId, content: TaskContent): Promise<{ output: unknown; usage: Usage }>;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-install-id',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

const INSTALL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Requests bigger than this are refused before they're read. */
const MAX_BODY = 9_000_000;

function monthName(resetsOn: string) {
  return new Date(`${resetsOn}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/') return json({ service: 'Crate Companion AI', ok: true });

  const install = req.headers.get('x-install-id') ?? '';
  if (!INSTALL.test(install)) return fail(400, 'Missing or bad install id.');

  if (url.pathname === '/v1/allowance' && req.method === 'GET') return json(await deps.meter.allowance(install));
  if (url.pathname !== '/v1/ask' || req.method !== 'POST') return fail(404, 'Not found.');

  if (!deps.enabled) return fail(503, "The app's AI is turned off for now. You can still use AI with your own Anthropic key in Settings.");
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return fail(413, 'Request too large.');
  let body: { task?: unknown; content?: unknown; use?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return fail(400, 'Bad request.'); }
  if (!isTaskId(body.task)) return fail(400, 'Unknown task.');
  const bad = checkContent(body.task, body.content);
  if (bad) return fail(400, bad);
  const use = typeof body.use === 'string' ? body.use.slice(0, 64) : '';
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';

  const v = await deps.meter.reserve(install, use, ip);
  if (!v.ok) {
    const resets = monthName(v.allowance.resetsOn);
    if (v.reason === 'cap') return fail(429, `You've used this month's ${v.allowance.limit} included AI uses. They start again on ${resets}. You can keep going with your own Anthropic key in Settings.`, { allowance: v.allowance, reason: 'cap' });
    if (v.reason === 'ip') return fail(429, 'Too many AI requests from this network today. Try again tomorrow.', { allowance: v.allowance, reason: 'ip' });
    return fail(503, `The app's included AI is paused until ${resets}. You can keep going with your own Anthropic key in Settings.`, { allowance: v.allowance, reason: 'budget' });
  }

  try {
    const { output, usage } = await deps.run(body.task, body.content as TaskContent);
    await deps.meter.spend(costOf(usage.model, usage.tokens));
    return json({ output, usage, allowance: v.allowance });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, 'The AI service had a problem. Try again.');
    if (err.usage) await deps.meter.spend(costOf(err.usage.model, err.usage.tokens));
    else await deps.meter.refund(install, use);
    // Problems with the app's own key are the app's problem, not the user's.
    const status = err.status === 400 && /API key|account/.test(err.message) ? 503 : err.status;
    const message = status === 503 && err.status === 400 ? "The app's AI isn't available right now. Try again later." : err.message;
    return fail(status, message, { allowance: v.allowance });
  }
}
