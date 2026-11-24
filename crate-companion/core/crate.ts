import type { MatchResult, RecommendResult } from '../shared/api-types';
import type { CollectionField, CollectionFolder, CollectionItem, Listing, MarketplaceStats, ReleaseDetails, SearchResult, UserProfile, WantItem } from '../shared/discogs-types';
import { DEFAULT_CRITERIA, type MatchCriteria } from '../shared/matching';
import type { AiFeature, AiRecommendResult, AiStatus, AiUsageEntry, AiUsageGroup, AiUsageReport, AlbumNotes, IdentifyResult, ListingReview, TonightResult } from '../shared/ai-types';
import { costOf, DEFAULT_AI_MODEL, isAiModel, type AiModelId } from '../shared/ai-models';
import { albumNotes, identify, playTonight, recommendFor, reviewListings, type Photo } from './ai/features';
import { AiError, anthropicBackend, type AiBackend, type Allowance, type Ask, type Usage } from './ai/llm';
import { proxyBackend } from './ai/proxy';
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
  /** The Crate Companion AI server, for AI without a key of your own (see ai-server/). */
  aiServer?: string;
  /** Makes the included AI for an install; tests pass a fake. Defaults to the AI server. */
  includedAi?: (installId: string) => IncludedAi;
}

/** The app's included AI: answers tasks, and says how much of the month's allowance is left. */
export type IncludedAi = AiBackend & { allowance(): Promise<Allowance> };

const AI_KEY = 'anthropic-api-key';
const AI_MODEL_KEY = 'ai-model';
const AI_USAGE_KEY = 'ai-usage';
const AI_INSTALL_KEY = 'ai-install-id';
const AI_ALLOWANCE_KEY = 'ai-allowance';
/** The included AI always runs on Haiku. */
const INCLUDED_MODEL: AiModelId = 'claude-haiku-5-5';
/** How many uses the cost log keeps. */
const USAGE_KEEP = 1000;

/**
 * Everything Crate Companion does, in one place: the server exposes it over HTTP for the
 * web version, and the installed apps call it directly, so they need no server.
 */
export class CrateCore {
  private mockUser?: string;
  private images = new TtlCache<{ body: ArrayBuffer; type: string }>(400);
  private notes = new TtlCache<AlbumNotes>(200);
  private aiCache?: { key: string; backend: AiBackend };
  /** Cost-log writes, one at a time so they don't overwrite each other. */
  private usageWrites: Promise<void> = Promise.resolve();

  private constructor(
    readonly api: DiscogsApi,
    readonly connection?: DiscogsConnection,
    private store: KeyValueStore = new MemoryStore(),
    private makeAi: (apiKey: string) => AiBackend = anthropicBackend,
    private makeIncluded?: (installId: string) => IncludedAi,
  ) {}

  private static included(o: Pick<CoreOptions, 'aiServer' | 'includedAi'>) {
    return o.includedAi ?? (o.aiServer ? (id: string) => proxyBackend(o.aiServer!, id) : undefined);
  }

  static async create(o: CoreOptions): Promise<CrateCore> {
    if (o.mock) return new CrateCore(new MockDiscogs(), undefined, o.store, o.aiBackend, CrateCore.included(o));
    const client = new DiscogsClient({ userAgent: o.userAgent, fetch: o.fetch });
    const connection = await DiscogsConnection.create({
      consumer: o.consumer, personalToken: o.personalToken, personalUsername: o.personalUsername,
      userAgent: o.userAgent, store: o.store, fetch: o.fetch,
      apply: (auth) => client.setAuth(auth),
      identify: (auth) => client.identify(auth),
    });
    return new CrateCore(client, connection, o.store, o.aiBackend, CrateCore.included(o));
  }

  /** For tests and the server: wrap an existing Discogs client (e.g. the mock). */
  static fromApi(
    api: DiscogsApi, connection?: DiscogsConnection, store?: KeyValueStore, aiBackend?: (apiKey: string) => AiBackend,
    ai: Pick<CoreOptions, 'aiServer' | 'includedAi'> = {},
  ) {
    return new CrateCore(api, connection, store, aiBackend, CrateCore.included(ai));
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

  // ------------------------------------------------ AI: included (the AI server) or the user's own key

  async aiStatus(): Promise<AiStatus> {
    const ownKey = !!(await this.store.get(AI_KEY));
    const included = !!this.makeIncluded;
    return {
      configured: ownKey || included,
      source: ownKey ? 'own' : included ? 'included' : null,
      ownKey,
      included,
      model: ownKey ? await this.aiModel() : INCLUDED_MODEL,
      allowance: included ? await this.savedAllowance() : undefined,
    };
  }

  /** How much of the month's included AI is left, asked fresh from the AI server. */
  async aiAllowance(): Promise<Allowance | null> {
    if (!this.makeIncluded) return null;
    const a = await (await this.includedAi()).allowance();
    await this.saveAllowance(a);
    return a;
  }

  private async savedAllowance(): Promise<Allowance | undefined> {
    try {
      const a = JSON.parse((await this.store.get(AI_ALLOWANCE_KEY)) ?? 'null') as Allowance | null;
      // Last month's count doesn't apply any more.
      if (!a || a.resetsOn <= new Date().toISOString().slice(0, 10)) return undefined;
      return a;
    } catch { return undefined; }
  }

  private async saveAllowance(a: Allowance) {
    await this.store.set(AI_ALLOWANCE_KEY, JSON.stringify(a));
  }

  private includedCache?: IncludedAi;
  private async includedAi(): Promise<IncludedAi> {
    if (this.includedCache) return this.includedCache;
    let id = await this.store.get(AI_INSTALL_KEY);
    if (!id) { id = crypto.randomUUID(); await this.store.set(AI_INSTALL_KEY, id); }
    return (this.includedCache = this.makeIncluded!(id));
  }

  private async aiModel(): Promise<AiModelId> {
    const m = await this.store.get(AI_MODEL_KEY);
    return isAiModel(m) ? m : DEFAULT_AI_MODEL;
  }

  /** Choose the model the AI features use. */
  async aiSetModel(model: string): Promise<AiStatus> {
    if (!isAiModel(model)) throw new CrateError(400, 'Unknown model.');
    await this.store.set(AI_MODEL_KEY, model);
    this.notes.clear();
    return this.aiStatus();
  }

  /** What the AI has cost on this device, from the cost log. */
  async aiUsage(now = new Date()): Promise<AiUsageReport> {
    const log = await this.usageLog();
    const month = now.toISOString().slice(0, 7);
    const sum = (es: AiUsageEntry[]) => ({ uses: es.length, cost: es.reduce((t, e) => t + e.cost, 0) });
    const groups = new Map<string, AiUsageGroup>();
    for (const e of log) {
      const k = `${e.feature}|${e.model}`;
      const g = groups.get(k) ?? { feature: e.feature, model: e.model, uses: 0, cost: 0 };
      g.uses++; g.cost += e.cost;
      groups.set(k, g);
    }
    return {
      thisMonth: sum(log.filter((e) => e.at.startsWith(month))),
      total: sum(log),
      groups: [...groups.values()].sort((a, b) => a.feature.localeCompare(b.feature) || a.model.localeCompare(b.model)),
      recent: log.slice(-20).reverse(),
    };
  }

  async aiClearUsage(): Promise<AiUsageReport> {
    await this.usageWrites;
    await this.store.remove(AI_USAGE_KEY);
    return this.aiUsage();
  }

  private async usageLog(): Promise<AiUsageEntry[]> {
    try {
      const v = JSON.parse((await this.store.get(AI_USAGE_KEY)) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }

  /** Adds a request's usage to this use's entry in the cost log. */
  private recordUsage(entry: AiUsageEntry, u: Usage): Promise<void> {
    entry.requests++;
    entry.model = u.model;
    entry.inputTokens += u.tokens.input + u.tokens.cacheRead + u.tokens.cacheWrite;
    entry.outputTokens += u.tokens.output;
    entry.cost += costOf(u.model, u.tokens);
    const write = this.usageWrites.then(async () => {
      const log = (await this.usageLog()).filter((e) => !(e.at === entry.at && e.feature === entry.feature));
      log.push(entry);
      await this.store.set(AI_USAGE_KEY, JSON.stringify(log.slice(-USAGE_KEEP)));
    }).catch(() => undefined);
    this.usageWrites = write;
    return write;
  }

  /**
   * The AI for one use of a feature. With the user's own key: the chosen model, and the cost
   * goes in the cost log (it's on their bill). Otherwise the included AI, on Haiku.
   */
  private async asker(feature: AiFeature): Promise<Ask> {
    const { backend, model, own } = await this.ai();
    const use = crypto.randomUUID();
    const entry: AiUsageEntry = { at: new Date().toISOString(), feature, model, requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    return async (o) => {
      try {
        const { output, usage, allowance } = await backend.ask(o, model, use);
        if (own && usage) await this.recordUsage(entry, usage);
        if (allowance) await this.saveAllowance(allowance);
        return output;
      } catch (e) {
        if (own && e instanceof AiError && e.usage) await this.recordUsage(entry, e.usage);
        throw e;
      }
    };
  }

  /** Save an Anthropic API key after checking it works. */
  async aiSetKey(key: string): Promise<AiStatus> {
    const k = key.trim();
    if (!/^sk-ant-/.test(k)) throw new CrateError(400, 'That doesn\'t look like an Anthropic API key. It starts with sk-ant-.');
    await this.makeAi(k).check(await this.aiModel());
    await this.store.set(AI_KEY, k);
    this.aiCache = undefined;
    return this.aiStatus();
  }

  async aiRemoveKey(): Promise<AiStatus> {
    await this.store.remove(AI_KEY);
    this.aiCache = undefined;
    return this.aiStatus();
  }

  private async ai(): Promise<{ backend: AiBackend; model: AiModelId; own: boolean }> {
    const key = await this.store.get(AI_KEY);
    if (key) {
      if (this.aiCache?.key !== key) this.aiCache = { key, backend: this.makeAi(key) };
      return { backend: this.aiCache.backend, model: await this.aiModel(), own: true };
    }
    if (this.makeIncluded) return { backend: await this.includedAi(), model: INCLUDED_MODEL, own: false };
    throw new AiError(400, 'Add your Anthropic API key in Settings to use the AI features.');
  }

  /** Identify a pressing from up to 4 photos (cover, label, barcode, runout). Runs as a job. */
  async aiIdentify(body: { photos?: Photo[] }): Promise<{ id: string }> {
    const photos = (body.photos ?? []).filter((p) => p?.data && /^image\/(jpeg|png|webp)$/.test(p.mediaType));
    if (!photos.length) throw new CrateError(400, 'Add a photo first.');
    const ask = await this.asker('identify');
    await this.me();
    const job = startJob<IdentifyResult>('ai-identify', (progress) => identify(ask, this.api, photos, progress));
    return { id: job.id };
  }

  /** Recommendations for a request in plain English, checked against Discogs. Runs as a job. */
  async aiRecommend(body: { request?: string }): Promise<{ id: string }> {
    const request = body.request?.trim().slice(0, 500);
    if (!request) throw new CrateError(400, 'Say what you\'re in the mood for.');
    const ask = await this.asker('recommend');
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
    return reviewListings(await this.asker('review'), listings);
  }

  /** Short notes on an album and this pressing. Kept for a day. */
  async aiNotes(releaseId: number): Promise<AlbumNotes> {
    if (!releaseId) throw new CrateError(400, 'releaseId required');
    const hit = this.notes.get(String(releaseId));
    if (hit) return hit;
    const ask = await this.asker('notes');
    const n = await albumNotes(ask, await this.api.release(releaseId));
    this.notes.set(String(releaseId), n, 24 * 60 * 60_000);
    return n;
  }

  /** A few albums from your own shelves for right now. */
  async aiTonight(body: { mood?: string }): Promise<TonightResult> {
    const ask = await this.asker('tonight');
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
