import { useCallback, useSyncExternalStore } from 'react';
import { api, native, type Job } from './api';
import { load, remove, save } from './storage';

type Kind = 'match' | 'recommend';
interface Entry {
  /** The job being polled, if one is running. */
  activeId: string | null;
  job: Job<unknown> | null;
  error: string | null;
  /** When the result on screen was made (it may be from an earlier visit). */
  finishedAt: number | null;
}

/**
 * Background jobs live here, outside any page, so a scan keeps going (and its result is
 * kept) when you switch to another page. The last result is also saved on the device, so
 * it's still there next time you open the app.
 */
const KINDS: Kind[] = ['match', 'recommend'];
const savedKey = (k: Kind) => `last-${k}`;

function fromSaved(kind: Kind): Entry {
  const s = load<{ result?: unknown; at?: number }>(savedKey(kind), {});
  if (s.result === undefined) return { activeId: null, job: null, error: null, finishedAt: null };
  return {
    activeId: null, error: null, finishedAt: s.at ?? null,
    job: { id: 'saved', status: 'done', progress: { done: 1, total: 1, message: '' }, result: s.result },
  };
}

const state = Object.fromEntries(KINDS.map((k) => [k, fromSaved(k)])) as Record<Kind, Entry>;
const listeners = new Set<() => void>();
function set(kind: Kind, patch: Partial<Entry>) {
  state[kind] = { ...state[kind], ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Anyone running? Keep the phone's screen on so Android doesn't pause the app. */
function syncKeepAwake() {
  native?.keepAwake?.(KINDS.some((k) => state[k].activeId !== null));
}

async function poll(kind: Kind, id: string) {
  if (state[kind].activeId !== id) return; // replaced by a newer run
  try {
    const j = await api.job<unknown>(id);
    if (state[kind].activeId !== id) return;
    if (j.status === 'running') {
      set(kind, { job: j });
      window.setTimeout(() => void poll(kind, id), 1000);
      return;
    }
    const at = Date.now();
    set(kind, { job: j, activeId: null, finishedAt: at, error: j.error ?? null });
    if (j.status === 'done') save(savedKey(kind), { result: j.result, at });
  } catch (e) {
    if (state[kind].activeId !== id) return;
    set(kind, { activeId: null, error: (e as Error).message });
  }
  syncKeepAwake();
}

async function start(kind: Kind, body?: unknown) {
  set(kind, { activeId: 'starting', error: null });
  syncKeepAwake();
  try {
    const { id } = await api.startJob(kind, body);
    set(kind, { activeId: id });
    void poll(kind, id);
  } catch (e) {
    set(kind, { activeId: null, error: (e as Error).message });
    syncKeepAwake();
  }
}

/** Forget saved results (signing out, or switching between demo data and a real account). */
export function forgetJobResults() {
  for (const k of KINDS) { remove(savedKey(k)); set(k, { activeId: null, job: null, error: null, finishedAt: null }); }
  syncKeepAwake();
}

/** A background job and its latest result, shared by every visit to the page. */
export function useJob<T>(kind: Kind) {
  const entry = useSyncExternalStore(subscribe, () => state[kind]);
  const run = useCallback((body?: unknown) => start(kind, body), [kind]);
  const job = entry.job as Job<T> | null;
  const running = entry.activeId !== null;
  return {
    job,
    /** The latest finished result, kept while a new run is going. */
    result: job?.status === 'done' ? job.result : undefined,
    finishedAt: entry.finishedAt,
    error: entry.error,
    running,
    progress: running && job?.status === 'running' ? job.progress : running ? { done: 0, total: 0, message: 'Starting…' } : null,
    start: run,
  };
}
