import { TtlCache } from '../lib/cache';
import { RateLimiter } from '../lib/rate-limiter';
import type { DiscogsApi, SearchParams } from './api';

const BASE = 'https://api.discogs.com';
const MIN = 60_000;
const HOUR = 60 * MIN;

export class DiscogsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Real Discogs client: personal-token auth, rate limiting, GET caching, 429 retry. */
export class DiscogsClient implements DiscogsApi {
  readonly isMock = false;
  private limiter = new RateLimiter();
  private cache = new TtlCache<unknown>();

  constructor(private opts: { token?: string; userAgent: string }) {}

  requestsInWindow() {
    return this.limiter.used;
  }

  private async request<T>(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    query: Record<string, string | number | undefined> = {},
    ttlMs = 0,
  ): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const key = url.toString();

    if (method === 'GET' && ttlMs > 0) {
      const hit = this.cache.get(key);
      if (hit !== undefined) return hit as T;
    }

    const headers: Record<string, string> = {
      'User-Agent': this.opts.userAgent,
      Accept: 'application/vnd.discogs.v2.discogs+json',
    };
    if (this.opts.token) headers.Authorization = `Discogs token=${this.opts.token}`;

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      const res = await fetch(key, { method, headers });
      this.limiter.update(res.headers.get('X-Discogs-Ratelimit-Remaining'));

      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        let msg = res.statusText;
        try {
          msg = ((await res.json()) as { message?: string }).message ?? msg;
        } catch { /* non-JSON error body */ }
        throw new DiscogsError(res.status, `Discogs ${res.status} on ${method} ${path}: ${msg}`);
      }
      const body = (res.status === 204 ? undefined : await res.json()) as T;
      if (method === 'GET' && ttlMs > 0) this.cache.set(key, body, ttlMs);
      return body;
    }
  }

  private invalidateUser(username: string) {
    this.cache.deletePrefix(`${BASE}/users/${encodeURIComponent(username)}`);
  }

  identity() {
    return this.request<Awaited<ReturnType<DiscogsApi['identity']>>>('GET', '/oauth/identity', {}, HOUR);
  }
  profile(username: string) {
    return this.request<Awaited<ReturnType<DiscogsApi['profile']>>>('GET', `/users/${encodeURIComponent(username)}`, {}, HOUR);
  }
  folders(username: string) {
    return this.request<Awaited<ReturnType<DiscogsApi['folders']>>>('GET', `/users/${encodeURIComponent(username)}/collection/folders`, {}, 5 * MIN);
  }
  collectionPage(username: string, folderId: number, page: number, perPage = 100) {
    return this.request<Awaited<ReturnType<DiscogsApi['collectionPage']>>>(
      'GET', `/users/${encodeURIComponent(username)}/collection/folders/${folderId}/releases`,
      { page, per_page: perPage, sort: 'added', sort_order: 'desc' }, 5 * MIN,
    );
  }
  collectionValue(username: string) {
    return this.request<Awaited<ReturnType<DiscogsApi['collectionValue']>>>('GET', `/users/${encodeURIComponent(username)}/collection/value`, {}, HOUR);
  }
  wantsPage(username: string, page: number, perPage = 100) {
    return this.request<Awaited<ReturnType<DiscogsApi['wantsPage']>>>(
      'GET', `/users/${encodeURIComponent(username)}/wants`, { page, per_page: perPage }, 5 * MIN,
    );
  }
  async addWant(username: string, releaseId: number) {
    await this.request('PUT', `/users/${encodeURIComponent(username)}/wants/${releaseId}`);
    this.invalidateUser(username);
  }
  async removeWant(username: string, releaseId: number) {
    await this.request('DELETE', `/users/${encodeURIComponent(username)}/wants/${releaseId}`);
    this.invalidateUser(username);
  }
  marketplaceStats(releaseId: number, currency?: string) {
    return this.request<Awaited<ReturnType<DiscogsApi['marketplaceStats']>>>(
      'GET', `/marketplace/stats/${releaseId}`, { curr_abbr: currency }, 30 * MIN,
    );
  }
  inventoryPage(username: string, page: number, perPage = 100) {
    return this.request<Awaited<ReturnType<DiscogsApi['inventoryPage']>>>(
      'GET', `/users/${encodeURIComponent(username)}/inventory`,
      { page, per_page: perPage, status: 'For Sale', sort: 'listed', sort_order: 'desc' }, 2 * HOUR,
    );
  }
  artistReleases(artistId: number, page = 1, perPage = 100) {
    return this.request<Awaited<ReturnType<DiscogsApi['artistReleases']>>>(
      'GET', `/artists/${artistId}/releases`, { page, per_page: perPage, sort: 'year', sort_order: 'asc' }, 24 * HOUR,
    );
  }
  labelReleases(labelId: number, page = 1, perPage = 100) {
    return this.request<Awaited<ReturnType<DiscogsApi['labelReleases']>>>(
      'GET', `/labels/${labelId}/releases`, { page, per_page: perPage }, 24 * HOUR,
    );
  }
  master(masterId: number) {
    return this.request<Awaited<ReturnType<DiscogsApi['master']>>>('GET', `/masters/${masterId}`, {}, 24 * HOUR);
  }
  search(params: SearchParams) {
    return this.request<Awaited<ReturnType<DiscogsApi['search']>>>(
      'GET', '/database/search', { ...params } as Record<string, string | number | undefined>, 24 * HOUR,
    );
  }
}
