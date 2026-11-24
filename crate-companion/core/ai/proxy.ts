import { AiError, type AiBackend, type Allowance, type Answer, type Usage } from './llm';
import { TASKS, type TaskId, type TaskOutput } from './tasks';

/** Album notes kept on the AI server, shared by everyone who opens the same pressing. */
export interface SharedNotes {
  /** Notes someone already wrote for this pressing, or null. Free. */
  sharedNotes(releaseId: number): Promise<TaskOutput<'notes'> | null>;
  /** The pressing's shared notes, written now (one use) if no one has yet. */
  writeNotes(releaseId: number, content: string, use?: string): Promise<{ output: TaskOutput<'notes'>; allowance?: Allowance }>;
}

/**
 * The app's included AI: tasks run on the Crate Companion AI server (ai-server/), which holds
 * the app's Anthropic key and gives each install a monthly allowance. No key needed.
 */
export function proxyBackend(baseUrl: string, installId: string, f: typeof fetch = (...a) => fetch(...a)): AiBackend & SharedNotes & {
  allowance(): Promise<Allowance>;
} {
  const url = baseUrl.replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', 'x-install-id': installId };

  async function call(path: string, init?: RequestInit) {
    let res: Response;
    try {
      res = await f(`${url}${path}`, { ...init, headers });
    } catch {
      throw new AiError(502, "Couldn't reach the AI. Check your connection and try again.");
    }
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new AiError(res.status, typeof body.error === 'string' ? body.error : `The AI service had a problem (${res.status}). Try again.`);
    return body;
  }

  return {
    async check() { /* nothing to check: there's no key */ },
    async allowance() {
      return await call('/v1/allowance') as unknown as Allowance;
    },
    async sharedNotes(releaseId) {
      let body;
      try { body = await call(`/v1/notes/${releaseId}`); } catch (e) {
        if (e instanceof AiError && e.status === 404) return null;
        throw e;
      }
      const parsed = TASKS.notes.schema.safeParse(body.output);
      return parsed.success ? parsed.data : null;
    },
    async writeNotes(releaseId, content, use) {
      const body = await call(`/v1/notes/${releaseId}`, { method: 'POST', body: JSON.stringify({ content, use }) });
      const parsed = TASKS.notes.schema.safeParse(body.output);
      if (!parsed.success) throw new AiError(502, "The AI's answer couldn't be read. Try again.");
      return { output: parsed.data, allowance: body.allowance as Allowance | undefined };
    },
    async ask<K extends TaskId>(o: { task: K; content: unknown }, _model: unknown, use?: string): Promise<Answer<K>> {
      const body = await call('/v1/ask', { method: 'POST', body: JSON.stringify({ task: o.task, content: o.content, use }) });
      const parsed = TASKS[o.task].schema.safeParse(body.output);
      if (!parsed.success) throw new AiError(502, "The AI's answer couldn't be read. Try again.");
      return { output: parsed.data as Answer<K>['output'], usage: body.usage as Usage | undefined, allowance: body.allowance as Allowance | undefined };
    },
  };
}
