/**
 * Long-running work (scanning seller inventories, building recommendations)
 * can take minutes under the 60 req/min limit, so it runs as a background job
 * the UI polls for progress.
 */
export interface Job<T = unknown> {
  id: string;
  kind: string;
  status: 'running' | 'done' | 'error';
  progress: { done: number; total: number; message: string };
  result?: T;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export type ProgressFn = (done: number, total: number, message: string) => void;

const jobs = new Map<string, Job>();

export function startJob<T>(kind: string, work: (progress: ProgressFn) => Promise<T>): Job<T> {
  const job: Job<T> = {
    id: globalThis.crypto.randomUUID(),
    kind,
    status: 'running',
    progress: { done: 0, total: 0, message: 'Starting…' },
    startedAt: Date.now(),
  };
  jobs.set(job.id, job as Job);
  work((done, total, message) => (job.progress = { done, total, message }))
    .then((r) => Object.assign(job, { status: 'done', result: r, finishedAt: Date.now() }))
    .catch((e: unknown) =>
      Object.assign(job, { status: 'error', error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() }),
    );
  // Forget finished jobs after an hour.
  for (const [id, j] of jobs) if (j.finishedAt && Date.now() - j.finishedAt > 3_600_000) jobs.delete(id);
  return job;
}

export const getJob = (id: string) => jobs.get(id);
