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
/** The artist part of a search title exactly as Discogs writes it, e.g. "America (2)". */
function rawArtist(t: string): string {
  const i = t.indexOf(' - ');
  return i > 0 ? t.slice(0, i).trim().replace(/\*$/, '') : '';
}

/**
 * An artist's albums, most collected first. Discographies (/artists/{id}/releases) don't
 * say which masters are albums and which are singles, so search masters with format=album.
 * Artist search is fuzzy ("America" also finds "The Presidents Of The United States Of
 * America"), so keep only results credited exactly to this artist.
 */
export async function artistAlbums(api: DiscogsApi, name: string) {
  const r = await api.search({
    artist: name.replace(/\s+\(\d+\)$/, ''), type: 'master', format: 'album',
    sort: 'have', sort_order: 'desc', per_page: 50,
  }).catch(() => undefined);
  return (r?.results ?? []).filter((s) =>
    rawArtist(s.title).toLowerCase() === name.toLowerCase() &&
    !(s.format ?? []).includes('Unofficial Release'));
}

export function splitTitle(t: string): { artist: string; title: string } {
  const i = t.indexOf(' - ');
  if (i <= 0) return { artist: '', title: t.trim() };
  // "Iggy And The Stooges*": the asterisk marks an artist name variation.
  const artist = t.slice(0, i).trim().replace(/\*$/, '').replace(/\s+\(\d+\)$/, '');
  return { artist, title: t.slice(i + 3).trim() };
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
    const source = `you own ${n(a.weight)} by ${a.name}`;
    const albums = await artistAlbums(api, a.name);
    if (albums.length >= 3) {
      for (const s of albums) {
        const { title } = splitTitle(s.title);
        candidates.push({
          masterId: s.master_id || s.id, title, artist: a.name.replace(/\s+\(\d+\)$/, ''),
          year: s.year ? Number(s.year) : undefined, thumb: s.thumb, styles: s.style, genres: s.genre,
          community: s.community, artistId: a.id, sources: [source],
        });
      }
      continue;
    }
    // Fallback when search finds too few: the full discography (includes singles).
    const r = await api.artistReleases(a.id).catch(() => undefined);
    for (const rel of r?.releases ?? []) {
      if (rel.role !== 'Main') continue;
      candidates.push({
        releaseId: rel.type === 'master' ? rel.main_release : rel.id,
        masterId: rel.type === 'master' ? rel.id : undefined,
        title: rel.title, artist: rel.artist || a.name, year: rel.year, thumb: rel.thumb, artistId: a.id,
        community: rel.stats?.community
          ? { want: rel.stats.community.in_wantlist, have: rel.stats.community.in_collection } : undefined,
        sources: [source],
      });
    }
  }
  // A big label's raw catalog (/labels/{id}/releases) is mostly compilations and records
  // unrelated to your taste, so search the label's masters in the style you collect most on
  // it, most-collected first.
  for (const l of labels) {
    progress(done++, total, `Exploring ${l.name}…`);
    const style = topN(profile.labelStyles.get(l.id) ?? new Map<string, number>(), 1)[0]?.[0] ?? styles[0]?.[0];
    const r = await api.search({
      label: l.name, style, type: 'master', per_page: 50, sort: 'have', sort_order: 'desc',
    }).catch(() => undefined);
    for (const s of r?.results ?? []) {
      const { artist, title } = splitTitle(s.title);
      if (!artist || /^various$/i.test(artist)) continue;
      candidates.push({
        masterId: s.master_id || s.id, title, artist, year: s.year ? Number(s.year) : undefined,
        thumb: s.thumb, styles: s.style, genres: s.genre, community: s.community, labelId: l.id,
        sources: [`${style ? `${style} ` : ''}on ${l.name} (${n(l.weight)} in your collection)`],
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
