import type { MatchResult, RecommendResult, SellerScan } from '../shared/api-types';
import type { CollectionItem, Listing, WantItem } from '../shared/discogs-types';
import { matchListings, type MatchCriteria } from '../shared/matching';
import {
  buildTasteProfile, rankCandidates, topEntities, topN, type Candidate,
} from '../shared/recommend';
import type { DiscogsApi } from './discogs/api';
import type { ProgressFn } from './lib/jobs';

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ pagination: { pages: number; items: number }; items: T[] }>,
  maxPages = Infinity,
  onPage?: (page: number, pages: number) => void,
): Promise<{ items: T[]; totalItems: number; truncated: boolean }> {
  const first = await fetchPage(1);
  const pages = Math.min(first.pagination.pages, maxPages);
  const items = [...first.items];
  onPage?.(1, pages);
  for (let p = 2; p <= pages; p++) {
    items.push(...(await fetchPage(p)).items);
    onPage?.(p, pages);
  }
  return { items, totalItems: first.pagination.items, truncated: first.pagination.pages > maxPages };
}

export async function fetchCollection(api: DiscogsApi, username: string, folderId = 0, onPage?: (p: number, n: number) => void) {
  const { items } = await fetchAllPages<CollectionItem>(async (p) => {
    const r = await api.collectionPage(username, folderId, p);
    return { pagination: r.pagination, items: r.releases };
  }, Infinity, onPage);
  return items;
}

export async function fetchWants(api: DiscogsApi, username: string, onPage?: (p: number, n: number) => void) {
  const { items } = await fetchAllPages<WantItem>(async (p) => {
    const r = await api.wantsPage(username, p);
    return { pagination: r.pagination, items: r.wants };
  }, Infinity, onPage);
  return items;
}

// ---------------------------------------------------------------- seller match

export interface MatchRequest {
  sellers: string[];
  criteria: MatchCriteria;
  /** Inventory pages (100 listings each) to scan per seller. */
  maxPagesPerSeller: number;
}

/**
 * The Discogs API has no "all listings for release X" endpoint, so we scan the
 * inventories of sellers the user chooses and intersect them with the wantlist.
 */
export async function runSellerMatch(
  api: DiscogsApi, username: string, req: MatchRequest, progress: ProgressFn,
): Promise<MatchResult> {
  progress(0, 1, 'Loading wantlist…');
  const wants = await fetchWants(api, username);
  const wanted = new Set(wants.map((w) => w.id));

  const perSeller: SellerScan[] = [];
  const all: Listing[] = [];
  const sellers = [...new Set(req.sellers.map((s) => s.trim()).filter(Boolean))];
  const totalSteps = sellers.length * req.maxPagesPerSeller;
  let step = 0;

  for (const seller of sellers) {
    try {
      const prof = await api.profile(seller).catch(() => undefined);
      const { items, totalItems, truncated } = await fetchAllPages<Listing>(async (p) => {
        const r = await api.inventoryPage(seller, p);
        return { pagination: r.pagination, items: r.listings };
      }, req.maxPagesPerSeller, (p, n) => progress(step + p, totalSteps, `Scanning ${seller}: page ${p}/${n}`));
      step += req.maxPagesPerSeller;
      // Inventory listings don't always carry seller stats; fill from the profile.
      for (const l of items) {
        if (!l.seller.stats && prof?.seller_rating !== undefined && (prof.seller_num_ratings ?? 0) > 0) {
          l.seller.stats = { rating: prof.seller_rating, total: prof.seller_num_ratings ?? 0 };
        }
      }
      const hits = items.filter((l) => wanted.has(l.release.id));
      all.push(...hits);
      perSeller.push({
        username: seller, scanned: items.length, totalListings: totalItems, truncated, matches: hits.length,
        rating: prof?.seller_rating, ratings: prof?.seller_num_ratings,
      });
    } catch (e) {
      step += req.maxPagesPerSeller;
      perSeller.push({ username: seller, scanned: 0, totalListings: 0, truncated: false, matches: 0, error: (e as Error).message });
    }
  }

  // Market floor for each wanted release that showed up, to judge price.
  const lowest = new Map<number, number>();
  const ids = [...new Set(all.map((l) => l.release.id))].slice(0, 40);
  for (const [i, id] of ids.entries()) {
    progress(i, ids.length, 'Checking market prices…');
    const s = await api.marketplaceStats(id).catch(() => undefined);
    if (s?.lowest_price) lowest.set(id, s.lowest_price.value);
  }

  const matches = matchListings(all, wanted, req.criteria, lowest);
  for (const s of perSeller) s.matches = matches.filter((m) => m.listing.seller.username === s.username).length;
  return { wantsCount: wants.length, sellers: perSeller, matches };
}

// ------------------------------------------------------------ recommendations

export interface RecommendOptions { artists: number; labels: number; styles: number }

/**
 * Search results title masters "Artist - Title". Discogs adds " (2)" etc. to tell apart
 * artists with the same name, and titles sometimes have trailing spaces.
 */
export function splitTitle(t: string): { artist: string; title: string } {
  const i = t.indexOf(' - ');
  if (i <= 0) return { artist: '', title: t.trim() };
  return { artist: t.slice(0, i).replace(/\s+\(\d+\)$/, '').trim(), title: t.slice(i + 3).trim() };
}

export async function buildRecommendations(
  api: DiscogsApi, username: string, opts: RecommendOptions, progress: ProgressFn,
): Promise<RecommendResult> {
  progress(0, 1, 'Reading your collection…');
  const collection = await fetchCollection(api, username, 0, (p, n) => progress(p, n, `Reading collection page ${p}/${n}`));
  const wants = await fetchWants(api, username);
  const profile = buildTasteProfile(collection);

  const artists = topEntities(profile.artists, opts.artists);
  const labels = topEntities(profile.labels, opts.labels);
  const styles = topN(profile.styles, opts.styles);
  const total = artists.length + labels.length + styles.length;
  let done = 0;
  const candidates: Candidate[] = [];
  const n = (w: number) => Math.round(w);

  for (const a of artists) {
    progress(done++, total, `Exploring ${a.name}…`);
    const r = await api.artistReleases(a.id).catch(() => undefined);
    for (const rel of r?.releases ?? []) {
      if (rel.role !== 'Main') continue;
      candidates.push({
        releaseId: rel.type === 'master' ? rel.main_release : rel.id,
        masterId: rel.type === 'master' ? rel.id : undefined,
        title: rel.title, artist: rel.artist || a.name, year: rel.year, thumb: rel.thumb, artistId: a.id,
        community: rel.stats?.community
          ? { want: rel.stats.community.in_wantlist, have: rel.stats.community.in_collection } : undefined,
        sources: [`you own ${n(a.weight)} by ${a.name}`],
      });
    }
  }
  for (const l of labels) {
    progress(done++, total, `Exploring ${l.name}…`);
    const r = await api.labelReleases(l.id).catch(() => undefined);
    for (const rel of r?.releases ?? []) {
      candidates.push({
        releaseId: rel.id, title: rel.title, artist: rel.artist, year: rel.year, thumb: rel.thumb, labelId: l.id,
        community: rel.stats?.community
          ? { want: rel.stats.community.in_wantlist, have: rel.stats.community.in_collection } : undefined,
        sources: [`on ${l.name} (${n(l.weight)} in your collection)`],
      });
    }
  }
  for (const [style, w] of styles) {
    progress(done++, total, `Searching ${style}…`);
    const r = await api.search({ style, type: 'master', per_page: 50 }).catch(() => undefined);
    for (const s of r?.results ?? []) {
      const { artist, title } = splitTitle(s.title);
      candidates.push({
        masterId: s.master_id || s.id, title, artist, year: s.year ? Number(s.year) : undefined,
        thumb: s.thumb, styles: s.style, genres: s.genre, community: s.community,
        sources: [`popular in ${style} (${n(w)} in your collection)`],
      });
    }
  }
  progress(total, total, 'Scoring…');

  const recommendations = rankCandidates(
    candidates, profile,
    new Set(wants.map((w) => w.id)),
    new Set(wants.map((w) => w.basic_information.master_id).filter(Boolean)),
    60,
  );
  return {
    profile: {
      total: profile.total, topArtists: artists, topLabels: labels, topStyles: styles,
      topDecades: topN(profile.decades, 4),
    },
    recommendations,
  };
}
