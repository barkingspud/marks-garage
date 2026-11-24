import type { MatchResult, RecommendResult } from '../shared/api-types';
import type { CollectionField, CollectionFolder, CollectionItem, Listing, MarketplaceStats, ReleaseDetails, SearchResult, UserProfile, WantItem } from '../shared/discogs-types';
import { DEFAULT_CRITERIA, type MatchCriteria } from '../shared/matching';
import type { AiRecommendResult, AiStatus, AlbumNotes, IdentifyResult, ListingReview, TonightResult } from '../shared/ai-types';
import { albumNotes, identify, playTonight, recommendFor, reviewListings, type Photo } from './ai/features';
import { AI_MODEL, AiError, anthropicBackend, type AiBackend } from './ai/llm';
import { DiscogsConnection, type ConnectionStatus } from './auth/connection';
import type { Consumer } from './auth/oauth';
import { MemoryStore, type KeyValueStore } from './auth/store';
import type { DiscogsApi } from './discogs/api';
import { DiscogsClient, DiscogsError } from './discogs/client';
import { MockDiscogs } from './discogs/mock';
import { TtlCache } from './lib/cache';
import { getJob, startJob, type Job } from './lib/jobs';
import { buildRecommendations, fetchCollection, fetchWants, runSellerMatch } from './services';

/** An error with an HTTP-style status, so the server can pass it on and the app can show it. */
export class CrateError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface Status {
  mock: boolean; configured: boolean; username: string | null; requestsInWindow: number;
  auth: ConnectionStatus | null;
}

export interface CoreOptions {
  /** Demo data instead of Discogs. */
  mock?: boolean;
  userAgent: string;
  /** Network function; the phone and desktop apps pass a native one (see DiscogsClient). */
  fetch?: typeof fetch;
  /** Where the sign-in is kept. */
  store: KeyValueStore;
  /** The app's registration with Discogs, for "Connect with Discogs". */
  consumer?: Consumer;
  personalToken?: string;
  personalUsername?: string;
  /** Makes the AI from an API key; tests pass a fake. */
  aiBackend?: (apiKey: string) => AiBackend;
}

const AI_KEY = 'anthropic-api-key';

/**
 * Everything Crate Companion does, in one place: the server exposes it over HTTP for the
 * web version, and the installed apps call it directly, so they need no server.
 */
export class CrateCore {
  private mockUser?: string;
  private images = new TtlCache<{ body: ArrayBuffer; type: string }>(400);
  private notes = new TtlCache<AlbumNotes>(200);
  private aiCache?: { key: string; backend: AiBackend };

  private constructor(
    readonly api: DiscogsApi,
    readonly connection?: DiscogsConnection,
    private store: KeyValueStore = new MemoryStore(),
    private makeAi: (apiKey: string) => AiBackend = anthropicBackend,
  ) {}

  static async create(o: CoreOptions): Promise<CrateCore> {
    if (o.mock) return new CrateCore(new MockDiscogs(), undefined, o.store, o.aiBackend);
    const client = new DiscogsClient({ userAgent: o.userAgent, fetch: o.fetch });
    const connection = await DiscogsConnection.create({
      consumer: o.consumer, personalToken: o.personalToken, personalUsername: o.personalUsername,
      userAgent: o.userAgent, store: o.store, fetch: o.fetch,
      apply: (auth) => client.setAuth(auth),
      identify: (auth) => client.identify(auth),
    });
    return new CrateCore(client, connection, o.store, o.aiBackend);
  }

  /** For tests and the server: wrap an existing Discogs client (e.g. the mock). */
  static fromApi(api: DiscogsApi, connection?: DiscogsConnection, store?: KeyValueStore, aiBackend?: (apiKey: string) => AiBackend) {
    return new CrateCore(api, connection, store, aiBackend);
  }

  private async me(): Promise<string> {
    if (this.api.isMock) return (this.mockUser ??= (await this.api.identity()).username);
    if (!this.connection?.connected) throw new CrateError(401, 'Not connected to Discogs. Use "Connect with Discogs" on the start page.');
    return this.connection.currentUsername(async () => (await this.api.identity()).username);
  }

  async status(): Promise<Status> {
    let user: string | null = null;
    try { user = await this.me(); } catch { /* not connected */ }
    return {
      mock: this.api.isMock, configured: this.api.isMock || !!this.connection?.connected, username: user,
      requestsInWindow: this.api.requestsInWindow(), auth: this.connection?.status() ?? null,
    };
  }

  async profile(): Promise<{ profile: UserProfile; value: { minimum: string; median: string; maximum: string } | null }> {
    const u = await this.me();
    const [profile, value] = await Promise.all([this.api.profile(u), this.api.collectionValue(u).catch(() => null)]);
    return { profile, value };
  }

  async folders(): Promise<{ folders: CollectionFolder[] }> { return this.api.folders(await this.me()); }
  async collection(folder = 0): Promise<{ items: CollectionItem[] }> { return { items: await fetchCollection(this.api, await this.me(), folder) }; }
  async wants(): Promise<{ items: WantItem[] }> { return { items: await fetchWants(this.api, await this.me()) }; }
  async fields(): Promise<{ fields: CollectionField[] }> { return this.api.collectionFields(await this.me()); }
  async stats(releaseId: number, currency?: string): Promise<MarketplaceStats> { return this.api.marketplaceStats(releaseId, currency); }

  /** Add by release id, or by master id (resolved to its main release). */
  async addWant(ids: { releaseId?: number; masterId?: number }): Promise<{ ok: true; releaseId: number }> {
    let releaseId = ids.releaseId;
    if (!releaseId && ids.masterId) releaseId = (await this.api.master(ids.masterId)).main_release;
    if (!releaseId) throw new CrateError(400, 'releaseId or masterId required');
    await this.api.addWant(await this.me(), releaseId);
    return { ok: true, releaseId };
  }

  async removeWant(releaseId: number): Promise<{ ok: true }> {
    await this.api.removeWant(await this.me(), releaseId);
    return { ok: true };
  }

  /** Track listing, credits, runout numbers and notes for one pressing. */
  async release(releaseId: number): Promise<ReleaseDetails> {
    if (!releaseId) throw new CrateError(400, 'releaseId required');
    return this.api.release(releaseId);
  }

  /** Rate a record you own: 1 to 5 stars, or 0 to clear. */
  async rate(p: { releaseId: number; instanceId: number; folderId: number; rating: number }): Promise<{ ok: true }> {
    const { releaseId, instanceId, folderId, rating } = p;
    if (!releaseId || !instanceId) throw new CrateError(400, 'releaseId and instanceId required');
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new CrateError(400, 'Rating must be 0 to 5 stars');
    // Discogs needs the record's real folder; "All" (0) isn't one, so fall back to Uncategorized.
    await this.api.setRating(await this.me(), folderId || 1, releaseId, instanceId, rating);
    return { ok: true };
  }

  /** "I bought it" from Record Check: add to the collection, and drop it from the wantlist. */
  async addToCollection(releaseId: number, removeFromWants = false): Promise<{ ok: true }> {
    if (!releaseId) throw new CrateError(400, 'releaseId required');
    const u = await this.me();
    await this.api.addToCollection(u, releaseId);
    if (removeFromWants) await this.api.removeWant(u, releaseId).catch(() => undefined);
    return { ok: true };
  }

  /** Record Check: find the exact pressing by text, catalog number or barcode. */
  async searchReleases(p: { q?: string; barcode?: string; catno?: string }): Promise<{ total: number; results: SearchResult[] }> {
    const q = p.q?.trim();
    const barcode = p.barcode?.replace(/\D/g, '');
    const catno = p.catno?.trim();
    if (!q && !barcode && !catno) throw new CrateError(400, 'Type an artist, title, catalog number or barcode.');
    await this.me();
    const r = await this.api.search({ q: barcode ? undefined : q, barcode: barcode || undefined, catno: catno || undefined, type: 'release', per_page: 25 });
    return { total: r.pagination.items, results: r.results };
  }

  /** A Discogs cover's bytes, cached for a day. Discogs images only. */
  async image(u: string): Promise<{ body: ArrayBuffer; type: string }> {
    let url: URL;
    try { url = new URL(u); } catch { throw new CrateError(400, 'Bad image URL'); }
    if (url.protocol !== 'https:' || url.hostname !== 'i.discogs.com') throw new CrateError(400, 'Only Discogs images');
    const hit = this.images.get(url.toString());
    const img = hit ?? await this.api.image(url.toString());
    if (!img) throw new CrateError(404, 'Image unavailable');
    if (!hit) this.images.set(url.toString(), img, 24 * 60 * 60_000);
    return img;
  }

  async startMatch(body: { sellers?: string[]; criteria?: Partial<MatchCriteria>; maxPagesPerSeller?: number }): Promise<{ id: string }> {
    if (!body.sellers?.length) throw new CrateError(400, 'Add at least one seller');
    const u = await this.me();
    const job = startJob<MatchResult>('match', (progress) => runSellerMatch(this.api, u, {
      sellers: body.sellers!.slice(0, 20),
      criteria: { ...DEFAULT_CRITERIA, ...body.criteria },
      maxPagesPerSeller: Math.min(Math.max(1, body.maxPagesPerSeller ?? 10), 100),
    }, progress));
    return { id: job.id };
  }

  async startRecommend(): Promise<{ id: string }> {
    const u = await this.me();
    const job = startJob<RecommendResult>('recommend', (progress) => buildRecommendations(this.api, u, { artists: 6, labels: 3, styles: 4 }, progress));
    return { id: job.id };
  }

  job<T>(id: string): Job<T> {
    const job = getJob(id);
    if (!job) throw new CrateError(404, 'Job not found');
    return job as Job<T>;
  }

  // ------------------------------------------------ AI (the user's own Anthropic API key)

  async aiStatus(): Promise<AiStatus> {
    return { configured: !!(await this.store.get(AI_KEY)), model: AI_MODEL };
  }

  /** Save an Anthropic API key after checking it works. */
  async aiSetKey(key: string): Promise<AiStatus> {
    const k = key.trim();
    if (!/^sk-ant-/.test(k)) throw new CrateError(400, 'That doesn\'t look like an Anthropic API key. It starts with sk-ant-.');
    await this.makeAi(k).check();
    await this.store.set(AI_KEY, k);
    this.aiCache = undefined;
    return this.aiStatus();
  }

  async aiRemoveKey(): Promise<AiStatus> {
    await this.store.remove(AI_KEY);
    this.aiCache = undefined;
    return this.aiStatus();
  }

  private async ai(): Promise<AiBackend> {
    const key = await this.store.get(AI_KEY);
    if (!key) throw new AiError(400, 'Add your Anthropic API key in Settings to use the AI features.');
    if (this.aiCache?.key !== key) this.aiCache = { key, backend: this.makeAi(key) };
    return this.aiCache.backend;
  }

  /** Identify a pressing from up to 4 photos (cover, label, barcode, runout). Runs as a job. */
  async aiIdentify(body: { photos?: Photo[] }): Promise<{ id: string }> {
    const photos = (body.photos ?? []).filter((p) => p?.data && /^image\/(jpeg|png|webp)$/.test(p.mediaType));
    if (!photos.length) throw new CrateError(400, 'Add a photo first.');
    const { ask } = await this.ai();
    await this.me();
    const job = startJob<IdentifyResult>('ai-identify', (progress) => identify(ask, this.api, photos, progress));
    return { id: job.id };
  }

  /** Recommendations for a request in plain English, checked against Discogs. Runs as a job. */
  async aiRecommend(body: { request?: string }): Promise<{ id: string }> {
    const request = body.request?.trim().slice(0, 500);
    if (!request) throw new CrateError(400, 'Say what you\'re in the mood for.');
    const { ask } = await this.ai();
    const u = await this.me();
    const job = startJob<AiRecommendResult>('ai-recommend', async (progress) => {
      progress(0, 1, 'Reading your collection…');
      const [collection, wants] = await Promise.all([fetchCollection(this.api, u), fetchWants(this.api, u)]);
      return recommendFor(ask, this.api, request, collection, wants, progress);
    });
    return { id: job.id };
  }

  /** The AI's take on seller listings: verdicts plus anything the sellers' notes warn about. */
  async aiReviewListings(body: { listings?: Listing[] }): Promise<ListingReview> {
    const listings = (body.listings ?? []).filter((l) => l && typeof l.id === 'number');
    if (!listings.length) throw new CrateError(400, 'No listings to review.');
    return reviewListings((await this.ai()).ask, listings);
  }

  /** Short notes on an album and this pressing. Kept for a day. */
  async aiNotes(releaseId: number): Promise<AlbumNotes> {
    if (!releaseId) throw new CrateError(400, 'releaseId required');
    const hit = this.notes.get(String(releaseId));
    if (hit) return hit;
    const { ask } = await this.ai();
    const n = await albumNotes(ask, await this.api.release(releaseId));
    this.notes.set(String(releaseId), n, 24 * 60 * 60_000);
    return n;
  }

  /** A few albums from your own shelves for right now. */
  async aiTonight(body: { mood?: string }): Promise<TonightResult> {
    const { ask } = await this.ai();
    const u = await this.me();
    return playTonight(ask, body.mood?.trim().slice(0, 300) ?? '', await fetchCollection(this.api, u));
  }

  // ------------------------------------------------ Connect with Discogs

  private conn(): DiscogsConnection {
    if (!this.connection) throw new CrateError(400, 'Not available in demo mode.');
    return this.connection;
  }
  /** Returns the discogs.com URL to send the user to; Discogs comes back to `callbackUrl`. */
  connectBegin(callbackUrl: string) { return this.conn().begin(callbackUrl); }
  connectFinish(requestToken: string, verifier: string) { return this.conn().finish(requestToken, verifier); }
  async useToken(token: string): Promise<ConnectionStatus> { await this.conn().useTokenFromUser(token); return this.conn().status(); }
  async disconnect(): Promise<ConnectionStatus> { await this.conn().disconnect(); return this.conn().status(); }
}

/** Turn anything thrown into a status code and message. */
export function errorStatus(e: unknown): { status: number; message: string } {
  if (e instanceof CrateError || e instanceof AiError) return { status: e.status, message: e.message };
  if (e instanceof DiscogsError) return { status: e.status === 401 || e.status === 404 || e.status === 429 ? e.status : 502, message: e.message };
  return { status: 500, message: e instanceof Error ? e.message : String(e) };
}

export type { Job };
