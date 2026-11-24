import { oauthHeader, type Consumer, type TokenPair } from '../auth/oauth';
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

/** How requests are signed: a personal token, or an account connected with OAuth. */
export type DiscogsAuth =
  | { kind: 'token'; token: string }
  | { kind: 'oauth'; consumer: Consumer; access: TokenPair };

export function authorizationHeader(auth: DiscogsAuth): string {
  return auth.kind === 'token' ? `Discogs token=${auth.token}` : oauthHeader(auth.consumer, auth.access);
}

/** Real Discogs client: token or OAuth auth, rate limiting, GET caching, 429 retry. */
export class DiscogsClient implements DiscogsApi {
  readonly isMock = false;
  private limiter = new RateLimiter();
  private cache = new TtlCache<unknown>();

  /**
   * `fetch` is the network function to use. The default is the platform's own; the phone and
   * desktop apps pass a native one, because Discogs only lets browsers read, not write.
   */
  constructor(private opts: { userAgent: string; auth?: DiscogsAuth; fetch?: typeof fetch }) {}

  private get http(): typeof fetch {
    return this.opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  /** Fetch an image (Discogs covers), for reading its colors. */
  async image(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
    try {
      const res = await this.http(url, { headers: { 'User-Agent': this.opts.userAgent } });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return null;
      return { body: await res.arrayBuffer(), type };
    } catch {
      return null;
    }
  }

  /** Switch accounts. Cached responses belong to the previous account, so drop them. */
  setAuth(auth: DiscogsAuth | undefined) {
    this.opts.auth = auth;
    this.cache.clear();
  }

  /** Who these credentials belong to (doesn't change the client's own credentials). */
  async identify(auth: DiscogsAuth): Promise<string> {
    await this.limiter.acquire();
    const res = await this.http(`${BASE}/oauth/identity`, {
      headers: { 'User-Agent': this.opts.userAgent, Authorization: authorizationHeader(auth) },
    });
    this.limiter.update(res.headers.get('X-Discogs-Ratelimit-Remaining'));
    if (!res.ok) throw new DiscogsError(res.status, `Discogs ${res.status} on GET /oauth/identity`);
    return ((await res.json()) as { username: string }).username;
  }

  requestsInWindow() {
    return this.limiter.used;
  }

  private async request<T>(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    query: Record<string, string | number | undefined> = {},
    ttlMs = 0,
    body?: unknown,
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
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      // Re-sign each attempt: OAuth headers carry a one-time nonce and timestamp.
      if (this.opts.auth) headers.Authorization = authorizationHeader(this.opts.auth);
      const res = await this.http(key, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
      const data = (res.status === 204 ? undefined : await res.json()) as T;
      if (method === 'GET' && ttlMs > 0) this.cache.set(key, data, ttlMs);
      return data;
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
  async addToCollection(username: string, releaseId: number) {
    await this.request('POST', `/users/${encodeURIComponent(username)}/collection/folders/1/releases/${releaseId}`);
    this.invalidateUser(username);
  }
  collectionFields(username: string) {
    return this.request<Awaited<ReturnType<DiscogsApi['collectionFields']>>>(
      'GET', `/users/${encodeURIComponent(username)}/collection/fields`, {}, HOUR,
    );
  }
  async removeWant(username: string, releaseId: number) {
    await this.request('DELETE', `/users/${encodeURIComponent(username)}/wants/${releaseId}`);
    this.invalidateUser(username);
  }
  async setRating(username: string, folderId: number, releaseId: number, instanceId: number, rating: number) {
    await this.request('POST',
      `/users/${encodeURIComponent(username)}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}`,
      {}, 0, { rating });
    this.invalidateUser(username);
  }
  release(releaseId: number) {
    return this.request<Awaited<ReturnType<DiscogsApi['release']>>>('GET', `/releases/${releaseId}`, {}, 24 * HOUR);
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
