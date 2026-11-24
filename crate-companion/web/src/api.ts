import type { ConnectionStatus } from '../../core/auth/connection';
import type { AiStatus, AiUsageReport, AlbumNotes, ListingReview, TonightResult } from '../../shared/ai-types';

type Allowance = NonNullable<AiStatus['allowance']>;
import type { KeyValueStore } from '../../core/auth/store';
import type { CrateCore, Job as CoreJob, Status as CoreStatus } from '../../core/crate';
import type { CollectionField, CollectionFolder, CollectionItem, Listing, MarketplaceStats, ReleaseDetails, SearchResult, UserProfile, WantItem } from '../../shared/discogs-types';

/**
 * Two ways to run:
 *  - "server": the web version talks to the server (server/app.ts) over /api.
 *  - "local": the app runs the core (core/crate.ts) itself, with no server. The Android and
 *    desktop apps always do this; in a browser, open the app with ?local=1 to try it
 *    (reads work; Discogs doesn't let browsers write, so the installed apps use a native
 *    network bridge for that).
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type AuthStatus = ConnectionStatus;
export type JobKind = 'match' | 'recommend' | 'ai-identify' | 'ai-recommend';
export type Status = CoreStatus;
export type Job<T> = Pick<CoreJob<T>, 'id' | 'status' | 'progress' | 'result' | 'error'>;
type Value = { minimum: string; median: string; maximum: string } | null;

/** What the platform gives the app: set by the Electron preload or the Capacitor bridge. */
interface NativeBridge {
  /** A fetch that isn't subject to browser CORS rules. */
  fetch?: typeof fetch;
  /** Secure key-value storage on the device. */
  store?: KeyValueStore;
  /** Open a URL in the system browser (for "Connect with Discogs"). */
  openExternal?: (url: string) => void;
  /** Where Discogs sends the user back after signing in (e.g. cratecompanion://auth). */
  callbackUrl?: string;
  /** Scan a barcode with the camera; resolves to its digits, or null if canceled. */
  scanBarcode?: () => Promise<string | null>;
  /** Keep the screen on (during long scans) or let it sleep again. */
  keepAwake?: (on: boolean) => void;
}
declare global {
  interface Window { crateNative?: NativeBridge }
}

export const native = typeof window !== 'undefined' ? window.crateNative : undefined;
const wantLocal = (() => {
  if (native) return true;
  try {
    const q = new URLSearchParams(window.location.search).get('local');
    if (q !== null) sessionStorage.setItem('crate:local', q === '0' ? '0' : '1');
    return sessionStorage.getItem('crate:local') === '1';
  } catch { return false; }
})();
export const mode: 'local' | 'server' = wantLocal ? 'local' : 'server';

// ---------------------------------------------------------------- server mode

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  return body as T;
}

// ---------------------------------------------------------------- local mode

class BrowserStore implements KeyValueStore {
  async get(k: string) { try { return localStorage.getItem(`crate:core:${k}`); } catch { return null; } }
  async set(k: string, v: string) { try { localStorage.setItem(`crate:core:${k}`, v); } catch { /* private mode */ } }
  async remove(k: string) { try { localStorage.removeItem(`crate:core:${k}`); } catch { /* ignore */ } }
}

let corePromise: Promise<CrateCore> | null = null;
function core(): Promise<CrateCore> {
  corePromise ??= import('../../core/crate').then(({ CrateCore }) => {
    const key = import.meta.env.VITE_DISCOGS_CONSUMER_KEY as string | undefined;
    const secret = import.meta.env.VITE_DISCOGS_CONSUMER_SECRET as string | undefined;
    let demo = false;
    try { demo = localStorage.getItem('crate:demo') === '1'; } catch { /* ignore */ }
    return CrateCore.create({
      mock: demo,
      userAgent: 'CrateCompanion/0.3 +https://github.com/barkingspud/marks-garage',
      fetch: native?.fetch,
      store: native?.store ?? new BrowserStore(),
      consumer: key && secret ? { key, secret } : undefined,
      aiServer: (import.meta.env.VITE_AI_SERVER_URL as string | undefined) || undefined,
    });
  });
  return corePromise;
}
/** Run a core call, turning its errors into ApiError like the server would. */
async function local<T>(fn: (c: CrateCore) => Promise<T> | T): Promise<T> {
  const c = await core();
  try {
    return await fn(c);
  } catch (e) {
    const { errorStatus } = await import('../../core/crate');
    const { status, message } = errorStatus(e);
    throw new ApiError(status, message);
  }
}

const imageUrls = new Map<string, Promise<string | null>>();

// ---------------------------------------------------------------- the API the pages use

const L = mode === 'local';
export const api = {
  status: () => (L ? local((c) => c.status()) : call<Status>('/status')),
  me: () => (L ? local((c) => c.profile()) : call<{ profile: UserProfile; value: Value }>('/me')),
  folders: () => (L ? local((c) => c.folders()) : call<{ folders: CollectionFolder[] }>('/folders')),
  collection: (folder: number) => (L ? local((c) => c.collection(folder)) : call<{ items: CollectionItem[] }>(`/collection?folder=${folder}`)),
  wants: () => (L ? local((c) => c.wants()) : call<{ items: WantItem[] }>('/wants')),
  addWant: (ids: { releaseId?: number; masterId?: number }) =>
    L ? local((c) => c.addWant(ids)) : call<{ ok: true; releaseId: number }>('/wants', { method: 'POST', body: JSON.stringify(ids) }),
  removeWant: (releaseId: number) => (L ? local((c) => c.removeWant(releaseId)) : call<{ ok: true }>(`/wants/${releaseId}`, { method: 'DELETE' })),
  stats: (releaseId: number) => (L ? local((c) => c.stats(releaseId)) : call<MarketplaceStats>(`/stats/${releaseId}`)),
  startJob: (kind: JobKind, body: unknown = {}) => {
    if (L) {
      return local((c) => {
        switch (kind) {
          case 'match': return c.startMatch(body as Parameters<CrateCore['startMatch']>[0]);
          case 'recommend': return c.startRecommend();
          case 'ai-identify': return c.aiIdentify(body as Parameters<CrateCore['aiIdentify']>[0]);
          case 'ai-recommend': return c.aiRecommend(body as Parameters<CrateCore['aiRecommend']>[0]);
        }
      });
    }
    const path = kind === 'ai-identify' ? '/ai/identify' : kind === 'ai-recommend' ? '/ai/recommend' : `/jobs/${kind}`;
    return call<{ id: string }>(path, { method: 'POST', body: JSON.stringify(body) });
  },
  job: <T,>(id: string) => (L ? local((c) => ({ ...c.job<T>(id) })) : call<Job<T>>(`/jobs/${id}`)),
  fields: () => (L ? local((c) => c.fields()) : call<{ fields: CollectionField[] }>('/collection/fields')),
  addToCollection: (releaseId: number, removeFromWants: boolean) =>
    L ? local((c) => c.addToCollection(releaseId, removeFromWants))
      : call<{ ok: true }>('/collection', { method: 'POST', body: JSON.stringify({ releaseId, removeFromWants }) }),
  release: (releaseId: number) => (L ? local((c) => c.release(releaseId)) : call<ReleaseDetails>(`/releases/${releaseId}`)),
  rate: (p: { releaseId: number; instanceId: number; folderId: number; rating: number }) =>
    L ? local((c) => c.rate(p)) : call<{ ok: true }>('/collection/rating', { method: 'POST', body: JSON.stringify(p) }),
  searchReleases: (p: { q?: string; barcode?: string; catno?: string }) =>
    L ? local((c) => c.searchReleases(p))
      : call<{ total: number; results: SearchResult[] }>(`/search/releases?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),

  // ---- AI (your own Anthropic API key)

  ai: {
    status: () => (L ? local((c) => c.aiStatus()) : call<AiStatus>('/ai/status')),
    setKey: (key: string) => (L ? local((c) => c.aiSetKey(key)) : call<AiStatus>('/ai/key', { method: 'POST', body: JSON.stringify({ key }) })),
    removeKey: () => (L ? local((c) => c.aiRemoveKey()) : call<AiStatus>('/ai/key', { method: 'DELETE' })),
    setModel: (model: string) => (L ? local((c) => c.aiSetModel(model)) : call<AiStatus>('/ai/model', { method: 'POST', body: JSON.stringify({ model }) })),
    usage: () => (L ? local((c) => c.aiUsage()) : call<AiUsageReport>('/ai/usage')),
    allowance: () => (L ? local((c) => c.aiAllowance()) : call<Allowance | null>('/ai/allowance')),
    clearUsage: () => (L ? local((c) => c.aiClearUsage()) : call<AiUsageReport>('/ai/usage', { method: 'DELETE' })),
    review: (listings: Listing[]) => (L ? local((c) => c.aiReviewListings({ listings })) : call<ListingReview>('/ai/review', { method: 'POST', body: JSON.stringify({ listings }) })),
    notes: (releaseId: number) => (L ? local((c) => c.aiNotes(releaseId)) : call<AlbumNotes>(`/ai/notes/${releaseId}`)),
    sharedNotes: (releaseId: number) => (L ? local((c) => c.aiSharedNotes(releaseId)) : call<AlbumNotes | null>(`/ai/notes/${releaseId}/shared`)),
    tonight: (mood: string, avoid: number[] = []) => (L ? local((c) => c.aiTonight({ mood, avoid })) : call<TonightResult>('/ai/tonight', { method: 'POST', body: JSON.stringify({ mood, avoid }) })),
  },

  // ---- connecting

  /** Start "Connect with Discogs": sends the user to discogs.com to approve. */
  connect: async () => {
    if (!L) { window.location.href = '/api/auth/connect'; return; }
    const callback = native?.callbackUrl ?? `${window.location.origin}${window.location.pathname}`;
    const url = await local((c) => c.connectBegin(callback));
    if (native?.openExternal) native.openExternal(url); else window.location.href = url;
  },
  /** Local mode: finish the sign-in when Discogs sends the user back (oauth_token + oauth_verifier). */
  finishConnect: (token: string, verifier: string) => local((c) => c.connectFinish(token, verifier)),
  useToken: (token: string) => (L ? local((c) => c.useToken(token)) : call<AuthStatus>('/auth/token', { method: 'POST', body: JSON.stringify({ token }) })),
  disconnect: () => (L ? local((c) => c.disconnect()) : call<AuthStatus>('/auth/disconnect', { method: 'POST' })),
  /** Local mode: look around with demo data instead of a Discogs account. */
  setDemo: (on: boolean) => {
    try { if (on) localStorage.setItem('crate:demo', '1'); else localStorage.removeItem('crate:demo'); } catch { /* ignore */ }
    window.location.reload();
  },

  // ---- cover images

  /** URL to show a cover. Server mode goes through /api/img; the apps load Discogs directly. */
  coverUrl: (src?: string | null): string | null => {
    if (!src || src.includes('spacer.gif')) return null;
    if (L) return src;
    return src.startsWith('https://i.discogs.com/') ? `/api/img?u=${encodeURIComponent(src)}` : src;
  },
  /** A same-origin URL for the cover, so its pixels can be read (for the room color). */
  coverPixelsUrl: (src: string): Promise<string | null> => {
    if (!L) return Promise.resolve(api.coverUrl(src));
    let p = imageUrls.get(src);
    if (!p) {
      p = local((c) => c.image(src)).then((img) => URL.createObjectURL(new Blob([img.body], { type: img.type }))).catch(() => null);
      imageUrls.set(src, p);
    }
    return p;
  },
};
