import type { CollectionFolder, CollectionItem, MarketplaceStats, UserProfile, WantItem } from '../../shared/discogs-types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export interface Status { mock: boolean; configured: boolean; username: string | null; requestsInWindow: number }
export interface Job<T> {
  id: string; status: 'running' | 'done' | 'error';
  progress: { done: number; total: number; message: string };
  result?: T; error?: string;
}

export const api = {
  status: () => call<Status>('/status'),
  me: () => call<{ profile: UserProfile; value: { minimum: string; median: string; maximum: string } | null }>('/me'),
  folders: () => call<{ folders: CollectionFolder[] }>('/folders'),
  collection: (folder: number) => call<{ items: CollectionItem[] }>(`/collection?folder=${folder}`),
  wants: () => call<{ items: WantItem[] }>('/wants'),
  addWant: (ids: { releaseId?: number; masterId?: number }) =>
    call<{ ok: true; releaseId: number }>('/wants', { method: 'POST', body: JSON.stringify(ids) }),
  removeWant: (releaseId: number) => call<{ ok: true }>(`/wants/${releaseId}`, { method: 'DELETE' }),
  stats: (releaseId: number) => call<MarketplaceStats>(`/stats/${releaseId}`),
  startJob: (kind: 'match' | 'recommend', body: unknown = {}) =>
    call<{ id: string }>(`/jobs/${kind}`, { method: 'POST', body: JSON.stringify(body) }),
  job: <T,>(id: string) => call<Job<T>>(`/jobs/${id}`),
};
