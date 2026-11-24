import type {
  ArtistRelease, BasicInformation, CollectionItem, LabelRelease, Listing, Pagination, ReleaseDetails, SearchResult, WantItem,
} from '../../shared/discogs-types';
import type { DiscogsApi, SearchParams } from './api';

/**
 * Deterministic fake Discogs data so the UI can be developed and demoed
 * without an API token (`npm run mock`). Names are invented.
 */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}
const r = rng(42);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const GENRES: Record<string, string[]> = {
  Jazz: ['Hard Bop', 'Modal', 'Soul-Jazz', 'Cool Jazz', 'Spiritual Jazz'],
  Electronic: ['Deep House', 'Techno', 'Ambient', 'IDM', 'Downtempo'],
  Rock: ['Krautrock', 'Psychedelic Rock', 'Post-Punk'],
  'Funk / Soul': ['Soul', 'Funk', 'Disco'],
};
const GENRE_WEIGHTS = ['Jazz', 'Jazz', 'Electronic', 'Electronic', 'Electronic', 'Rock', 'Funk / Soul'];
const FIRST = ['Marlo', 'Ines', 'Theo', 'Kasimir', 'Odette', 'Ray', 'Lumi', 'Dex', 'Nadia', 'Otis'];
const LAST = ['Quartet', 'Collective', 'Sound System', 'Trio', 'Ensemble', 'Orchestra', 'Project'];
const WORDS = ['Blue', 'Night', 'Static', 'Velvet', 'Orbit', 'Echo', 'Harbor', 'Signal', 'Amber', 'Drift', 'Tide', 'Mirror'];

const artists = Array.from({ length: 24 }, (_, i) => ({
  id: 1001 + i,
  name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
  genre: GENRE_WEIGHTS[i % GENRE_WEIGHTS.length]!,
}));
const labels = Array.from({ length: 10 }, (_, i) => ({
  id: 2001 + i,
  name: `${WORDS[(i * 5) % WORDS.length]} ${pick(['Records', 'Recordings', 'Music', 'Tapes'])}`,
}));

const catalog: (BasicInformation & { community: { want: number; have: number } })[] = Array.from(
  { length: 260 },
  (_, i) => {
    const artist = artists[i % artists.length]!;
    const styles = GENRES[artist.genre]!;
    const label = labels[(i * 7) % labels.length]!;
    const year = artist.genre === 'Jazz' ? 1956 + Math.floor(r() * 20) : 1972 + Math.floor(r() * 50);
    return {
      id: 5000 + i,
      master_id: 9000 + i,
      title: `${pick(WORDS)} ${pick(WORDS)}`,
      year,
      thumb: '',
      cover_image: '',
      artists: [{ id: artist.id, name: artist.name }],
      labels: [{ id: label.id, name: label.name, catno: `${label.name.slice(0, 3).toUpperCase()}-${100 + i}` }],
      formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'] }],
      genres: [artist.genre],
      styles: [pick(styles), pick(styles)].filter((s, j, a) => a.indexOf(s) === j),
      community: { have: 50 + Math.floor(r() * 3000), want: 20 + Math.floor(r() * 4000) },
    };
  },
);

const USERNAME = 'demo_digger';
// Collection skews to the first 12 artists; the rest of the catalog is "undiscovered".
let collection: CollectionItem[] = catalog
  .filter((b) => (b.artists[0]!.id - 1001) < 12 && b.id % 3 !== 0)
  .slice(0, 64)
  .map((b, i) => ({
    id: b.id, instance_id: 70000 + i, folder_id: i % 4 === 0 ? 2 : 1, rating: i % 5 === 0 ? 5 : i % 7 === 0 ? 3 : 0,
    date_added: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000 * 5).toISOString(), basic_information: b,
    // Like a real collection with the default custom fields filled in on some records.
    notes: i % 3 === 0 ? [{ field_id: 1, value: 'Near Mint (NM or M-)' }, { field_id: 2, value: 'Very Good Plus (VG+)' }] : undefined,
  }));
const owned = new Set(collection.map((c) => c.id));
let wants: WantItem[] = catalog
  .filter((b) => !owned.has(b.id))
  .slice(0, 16)
  .map((b, i) => ({ id: b.id, rating: 0, date_added: new Date(Date.UTC(2025, 5, 1) + i * 86_400_000).toISOString(), basic_information: b }));

const GRADES = ['Mint (M)', 'Near Mint (NM or M-)', 'Very Good Plus (VG+)', 'Very Good (VG)', 'Good Plus (G+)', 'Good (G)'];
const SLEEVES = [...GRADES, 'Generic', 'Not Graded'];
const sellers = [
  { id: 1, username: 'groove_merchant', rating: 99.9, total: 4210, ships: 'United States' },
  { id: 2, username: 'dusty_bins', rating: 97.1, total: 312, ships: 'United Kingdom' },
  { id: 3, username: 'needle_drop_records', rating: 100, total: 18, ships: 'Germany' },
  { id: 4, username: 'crate_and_barrel', rating: 99.6, total: 880, ships: 'United States' },
];
const basePrice = new Map(catalog.map((b) => [b.id, 8 + Math.round(r() * 60)]));
const inventories = new Map<string, Listing[]>(
  sellers.map((s) => [
    s.username,
    Array.from({ length: 140 }, (_, i) => {
      const b = i % 9 === 0 ? pick(wants).basic_information : pick(catalog);
      const ci = Math.floor(r() * GRADES.length);
      const price = Math.round(basePrice.get(b.id)! * (1.6 - ci * 0.15 + r() * 0.6) * 100) / 100;
      return {
        id: s.id * 100000 + i, status: 'For Sale', condition: GRADES[ci]!, sleeve_condition: pick(SLEEVES),
        // Like the real API: `price` is in the seller's currency, `original_price.converted` in the buyer's.
        ...(s.ships === 'Germany'
          ? {
              price: { value: Math.round(price * 92) / 100, currency: 'EUR' },
              original_price: { curr_abbr: 'EUR', value: Math.round(price * 92) / 100, converted: { curr_abbr: 'USD', value: price } },
            }
          : { price: { value: price, currency: 'USD' } }),
        ships_from: s.ships, allow_offers: r() > 0.5,
        uri: `https://www.discogs.com/sell/item/${s.id * 100000 + i}`,
        seller: { id: s.id, username: s.username, stats: { rating: String(s.rating), total: s.total } },
        release: { id: b.id, description: `${b.artists[0]!.name} - ${b.title} (LP, Album)`, year: b.year },
      } satisfies Listing;
    }),
  ]),
);

function page<T>(items: T[], pageNo: number, perPage: number): { pagination: Pagination; items: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  return {
    pagination: { page: pageNo, pages, per_page: perPage, items: items.length },
    items: items.slice((pageNo - 1) * perPage, pageNo * perPage),
  };
}
const delay = () => new Promise((res) => setTimeout(res, 40));

export class MockDiscogs implements DiscogsApi {
  readonly isMock = true;
  async image() { return null; }
  requestsInWindow() { return 0; }
  async identity() { return { id: 1, username: USERNAME, resource_url: '' }; }
  async profile(username: string) {
    const s = sellers.find((x) => x.username === username);
    return {
      id: 1, username, name: username === USERNAME ? 'Demo Digger' : username,
      num_collection: collection.length, num_wantlist: wants.length,
      seller_rating: s?.rating, seller_num_ratings: s?.total, curr_abbr: 'USD',
    };
  }
  async folders() {
    return { folders: [
      { id: 0, name: 'All', count: collection.length },
      { id: 1, name: 'Uncategorized', count: collection.filter((c) => c.folder_id === 1).length },
      { id: 2, name: 'Jazz Shelf', count: collection.filter((c) => c.folder_id === 2).length },
    ] };
  }
  async collectionPage(_u: string, folderId: number, p: number, perPage = 100) {
    await delay();
    const items = folderId === 0 ? collection : collection.filter((c) => c.folder_id === folderId);
    const { pagination, items: releases } = page(items, p, perPage);
    return { pagination, releases };
  }
  async collectionValue() { return { minimum: '$812.40', median: '$1,604.15', maximum: '$3,220.00' }; }
  async wantsPage(_u: string, p: number, perPage = 100) {
    await delay();
    const { pagination, items } = page(wants, p, perPage);
    return { pagination, wants: items };
  }
  async addWant(_u: string, releaseId: number) {
    const b = catalog.find((c) => c.id === releaseId);
    if (b && !wants.some((w) => w.id === releaseId)) {
      wants = [{ id: b.id, rating: 0, date_added: new Date().toISOString(), basic_information: b }, ...wants];
    }
  }
  async removeWant(_u: string, releaseId: number) { wants = wants.filter((w) => w.id !== releaseId); }
  async addToCollection(_u: string, releaseId: number) {
    const b = catalog.find((c) => c.id === releaseId);
    if (b && !collection.some((c) => c.id === releaseId)) {
      collection = [{ id: b.id, instance_id: 80000 + collection.length, folder_id: 1, rating: 0, date_added: new Date().toISOString(), basic_information: b }, ...collection];
    }
  }
  async setRating(_u: string, _f: number, releaseId: number, instanceId: number, rating: number) {
    collection = collection.map((c) => (c.id === releaseId && c.instance_id === instanceId ? { ...c, rating } : c));
  }
  async release(releaseId: number): Promise<ReleaseDetails> {
    await delay();
    const b = catalog.find((c) => c.id === releaseId);
    if (!b) throw Object.assign(new Error('Release not found'), { status: 404 });
    const words = ['Morning', 'Static', 'Harbor', 'Glass', 'Undertow', 'Lanterns', 'Second Hand', 'Northbound', 'Velvet', 'Low Tide'];
    const tracklist = Array.from({ length: 8 }, (_, i) => ({
      position: `${i < 4 ? 'A' : 'B'}${(i % 4) + 1}`, type_: 'track',
      title: `${words[(releaseId + i * 3) % words.length]}${i % 3 === 0 ? '' : ` ${words[(releaseId + i) % words.length]}`}`,
      duration: `${3 + ((releaseId + i) % 4)}:${String((releaseId * 7 + i * 13) % 60).padStart(2, '0')}`,
    }));
    const cat = b.labels[0]?.catno ?? '';
    return {
      id: b.id, master_id: b.master_id, title: b.title, year: b.year, country: 'US', released: String(b.year),
      released_formatted: String(b.year), artists: b.artists, labels: b.labels, formats: b.formats,
      genres: b.genres, styles: b.styles, tracklist,
      extraartists: [
        { id: 9001, name: 'Sam Lowe', role: 'Producer' },
        { id: 9002, name: 'Ada Reyes', role: 'Engineer' },
        { id: 9003, name: 'Theo Marsh', role: 'Design [Sleeve], Photography By' },
      ],
      identifiers: [
        { type: 'Barcode', value: `0 7502${String(b.id).padStart(5, '0')} 1` },
        { type: 'Matrix / Runout', value: `${cat}-A-1`, description: 'Side A' },
        { type: 'Matrix / Runout', value: `${cat}-B-1`, description: 'Side B' },
      ],
      notes: 'Demo data. Gatefold sleeve with printed inner sleeve.',
      community: { ...b.community, rating: { count: 40 + (b.id % 200), average: 3.6 + (b.id % 14) / 10 } },
    };
  }
  async collectionFields() {
    return { fields: [
      { id: 1, name: 'Media Condition', type: 'dropdown', position: 1 },
      { id: 2, name: 'Sleeve Condition', type: 'dropdown', position: 2 },
      { id: 3, name: 'Notes', type: 'textarea', position: 3 },
    ] };
  }
  async marketplaceStats(releaseId: number) {
    const listed = [...inventories.values()].flat().filter((l) => l.release.id === releaseId);
    const lowest = listed.length ? Math.min(...listed.map((l) => l.price.value)) : null;
    return { lowest_price: lowest === null ? null : { value: lowest, currency: 'USD' }, num_for_sale: listed.length + (releaseId % 7), blocked_from_sale: false };
  }
  async inventoryPage(username: string, p: number, perPage = 100) {
    await delay();
    const inv = inventories.get(username);
    if (!inv) throw Object.assign(new Error(`Seller ${username} not found`), { status: 404 });
    const { pagination, items } = page(inv, p, perPage);
    return { pagination, listings: items };
  }
  async artistReleases(artistId: number, p = 1, perPage = 100) {
    const items: ArtistRelease[] = catalog.filter((b) => b.artists[0]!.id === artistId).map((b) => ({
      id: b.master_id, type: 'master', main_release: b.id, title: b.title, artist: b.artists[0]!.name, year: b.year,
      role: 'Main', thumb: '', stats: { community: { in_wantlist: b.community.want, in_collection: b.community.have } },
    }));
    const { pagination, items: releases } = page(items, p, perPage);
    return { pagination, releases };
  }
  async labelReleases(labelId: number, p = 1, perPage = 100) {
    const items: LabelRelease[] = catalog.filter((b) => b.labels[0]!.id === labelId).map((b) => ({
      id: b.id, title: b.title, artist: b.artists[0]!.name, year: b.year, catno: b.labels[0]!.catno, format: 'LP', thumb: '',
      stats: { community: { in_wantlist: b.community.want, in_collection: b.community.have } },
    }));
    const { pagination, items: releases } = page(items, p, perPage);
    return { pagination, releases };
  }
  async master(masterId: number) {
    const b = catalog.find((c) => c.master_id === masterId);
    if (!b) throw Object.assign(new Error('Master not found'), { status: 404 });
    return { id: masterId, main_release: b.id, title: b.title };
  }
  async search(params: SearchParams) {
    const [from, to] = (params.year ?? '').split('-').map(Number);
    const items: SearchResult[] = catalog
      .filter((b) => (!params.style || b.styles?.includes(params.style)) && (!params.genre || b.genres?.includes(params.genre)))
      .filter((b) => !params.label || b.labels.some((l) => l.name === params.label))
      .filter((b) => !params.artist || b.artists[0]!.name === params.artist)
      .filter((b) => !params.q || `${b.artists[0]!.name} ${b.title}`.toLowerCase().includes(params.q.toLowerCase()))
      .filter((b) => !params.catno || b.labels.some((l) => (l.catno ?? '').toLowerCase() === params.catno!.toLowerCase()))
      .filter((b) => !from || (b.year >= from && b.year <= (to || from)))
      .map((b) => ({
        id: params.type === 'release' ? b.id : b.master_id, type: params.type === 'release' ? 'release' : 'master',
        master_id: b.master_id, title: `${b.artists[0]!.name} - ${b.title}`,
        year: String(b.year), genre: b.genres, style: b.styles, label: [b.labels[0]!.name], format: ['Vinyl', 'LP', 'Album'],
        catno: b.labels[0]!.catno, country: 'US', thumb: '', community: b.community,
      }));
    if (params.sort === 'have') items.sort((a, b) => (b.community?.have ?? 0) - (a.community?.have ?? 0));
    const { pagination, items: results } = page(items, params.page ?? 1, params.per_page ?? 50);
    return { pagination, results };
  }
}
