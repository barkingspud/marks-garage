import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Job } from './api';

/** Start a server job and poll it until it finishes. */
export function useJob<T>(kind: 'match' | 'recommend') {
  const [job, setJob] = useState<Job<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const poll = useCallback(async (id: string) => {
    try {
      const j = await api.job<T>(id);
      setJob(j);
      if (j.status === 'running') timer.current = window.setTimeout(() => poll(id), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const start = useCallback(async (body?: unknown) => {
    setError(null);
    setJob(null);
    try {
      const { id } = await api.startJob(kind, body);
      poll(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [kind, poll]);

  return { job, error: error ?? job?.error ?? null, running: job?.status === 'running', start };
}
