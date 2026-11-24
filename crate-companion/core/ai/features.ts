import type {
  AiPick, AiRecommendResult, AlbumNotes, IdentifyResult, ListingReview, TonightResult,
} from '../../shared/ai-types';
import type { BasicInformation, CollectionItem, Listing, ReleaseDetails, SearchResult, WantItem } from '../../shared/discogs-types';
import { buildTasteProfile, topEntities, topN } from '../../shared/recommend';
import type { DiscogsApi } from '../discogs/api';
import type { ProgressFn } from '../lib/jobs';
import { splitTitle } from '../services';
import type { Ask } from './llm';

/**
 * The AI features. Each one gives Claude the relevant Discogs data and asks for an answer in a
 * fixed shape. Anything that names an album is checked against Discogs before it's shown, so
 * the app never offers an album that doesn't exist or a pressing Discogs doesn't list.
 */

const clean = (n: string) => n.replace(/ \(\d+\)$/, '').replace(/\*$/, '');
const artists = (b: Pick<BasicInformation, 'artists'>) => b.artists.map((a) => clean(a.name)).join(', ');
const albumLine = (b: BasicInformation) => `${artists(b)} - ${b.title}${b.year ? ` (${b.year})` : ''}`;
/** "The Dark Side Of The Moon" and "Dark Side of the Moon" compare equal. */
export const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Big collections are trimmed for the AI: rated albums first, then the newest. */
function forAi(items: CollectionItem[], max = 1500): CollectionItem[] {
  if (items.length <= max) return items;
  return [...items].sort((a, b) => b.rating - a.rating || b.date_added.localeCompare(a.date_added)).slice(0, max);
}

function tasteSummary(collection: CollectionItem[]) {
  const p = buildTasteProfile(collection);
  return [
    `Albums owned: ${p.total}`,
    `Top artists: ${topEntities(p.artists, 15).map((a) => clean(a.name)).join(', ')}`,
    `Top labels: ${topEntities(p.labels, 10).map((l) => clean(l.name)).join(', ')}`,
    `Top styles: ${topN(p.styles, 12).map(([s]) => s).join(', ')}`,
    `Top decades: ${topN(p.decades, 4).map(([d]) => `${d}s`).join(', ')}`,
  ].join('\n');
}


// ------------------------------------------------------------------ identify from photos

export interface Photo { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }



function describeCandidate(r: SearchResult, d?: ReleaseDetails) {
  const ids = (d?.identifiers ?? [])
    .filter((x) => /barcode|matrix|runout|pressing|mastering/i.test(x.type))
    .slice(0, 12)
    .map((x) => `${x.type}${x.description ? ` (${x.description})` : ''}: ${x.value}`);
  return [
    `Release ${r.id}: ${r.title}`,
    `  ${[r.country, r.year, (d?.labels ?? []).map((l) => `${clean(l.name)} ${l.catno ?? ''}`.trim()).join('; ') || [r.label?.[0], r.catno].filter(Boolean).join(' '), r.format?.join(', ')].filter(Boolean).join(' | ')}`,
    ...ids.map((i) => `  ${i}`),
  ].join('\n');
}

export async function identify(ask: Ask, api: DiscogsApi, photos: Photo[], progress: ProgressFn): Promise<IdentifyResult> {
  progress(0, 3, 'Reading the photos…');
  const images = photos.slice(0, 4).map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType, data: p.data } }));
  const seen = await ask({
    task: 'identify-read',
    content: [...images, { type: 'text', text: 'What album is this, and what identifying text can you read?' }],
  });
  const base = { seen: { artist: seen.artist, title: seen.title, label: seen.label, catalogNumbers: seen.catalogNumbers, barcode: seen.barcode, runout: seen.runout } };
  if (!seen.isAlbum) {
    return { ...base, candidates: [], bestReleaseId: null, confidence: 'low', reasoning: "This doesn't look like an album. Try a photo of the cover, the label or the barcode.", check: '' };
  }

  progress(1, 3, 'Searching Discogs…');
  const found = new Map<number, SearchResult>();
  const add = (rs?: SearchResult[]) => { for (const r of rs ?? []) if (found.size < 15) found.set(r.id, r); };
  const digits = seen.barcode?.replace(/\D/g, '') ?? '';
  if (digits.length >= 8) add((await api.search({ barcode: digits, type: 'release', per_page: 10 }).catch(() => undefined))?.results);
  for (const catno of seen.catalogNumbers.slice(0, 3)) {
    if (found.size >= 10) break;
    add((await api.search({ catno, artist: seen.artist ?? undefined, type: 'release', per_page: 10 }).catch(() => undefined))?.results);
  }
  if (!found.size && (seen.artist || seen.title)) {
    add((await api.search({ q: [seen.artist, seen.title].filter(Boolean).join(' '), type: 'release', per_page: 15 }).catch(() => undefined))?.results);
  }
  const candidates = [...found.values()];
  if (!candidates.length) {
    return { ...base, candidates, bestReleaseId: null, confidence: 'low', reasoning: "Couldn't find a match on Discogs from what's in the photos. Try a clearer photo of the label or the barcode, or type the catalog number.", check: '' };
  }

  progress(2, 3, 'Comparing pressings…');
  const details = await Promise.all(candidates.slice(0, 6).map((c) => api.release(c.id).catch(() => undefined)));
  const match = await ask({
    task: 'identify-match',
    content: [
      ...images,
      {
        type: 'text',
        text: `Text read from the photos:\n<seen>${JSON.stringify(base.seen)}</seen>\n\nCandidate releases:\n<data>\n${candidates.map((c, i) => describeCandidate(c, details[i])).join('\n\n')}\n</data>\n\nWhich release is this copy?`,
      },
    ],
  });
  const best = candidates.some((c) => c.id === match.bestReleaseId) ? match.bestReleaseId : null;
  const ordered = best ? [found.get(best)!, ...candidates.filter((c) => c.id !== best)] : candidates;
  progress(3, 3, 'Done');
  return { ...base, candidates: ordered, bestReleaseId: best, confidence: best ? match.confidence : 'low', reasoning: match.reasoning, check: match.check };
}

// ------------------------------------------------------------------ recommendations from a request


/** Find an album on Discogs: its master release, or null if Discogs doesn't have it. */
async function findOnDiscogs(api: DiscogsApi, artist: string, title: string): Promise<SearchResult | null> {
  const want = norm(title);
  const ok = (r: SearchResult) => {
    const t = norm(splitTitle(r.title).title);
    return t === want || t.startsWith(want) || want.startsWith(t);
  };
  const a = await api.search({ type: 'master', artist, release_title: title, per_page: 5 }).catch(() => undefined);
  const hit = a?.results.find(ok);
  if (hit) return hit;
  const b = await api.search({ type: 'master', q: `${artist} ${title}`, per_page: 5 }).catch(() => undefined);
  return b?.results.find(ok) ?? null;
}

export async function recommendFor(
  ask: Ask, api: DiscogsApi, request: string, collection: CollectionItem[], wants: WantItem[], progress: ProgressFn,
): Promise<AiRecommendResult> {
  progress(0, 1, 'Thinking about your request…');
  const owned = forAi(collection).map((i) => albumLine(i.basic_information));
  const s = await ask({
    task: 'recommend',
    content: `Their request: <request>${request}</request>\n\nTheir taste:\n<data>\n${tasteSummary(collection)}\n</data>\n\nAlbums they own:\n<data>\n${owned.join('\n')}\n</data>\n\nAlbums on their wantlist:\n<data>\n${wants.slice(0, 300).map((w) => albumLine(w.basic_information)).join('\n')}\n</data>`,
  });

  const ownedMasters = new Set(collection.map((i) => i.basic_information.master_id).filter(Boolean));
  const wantedMasters = new Set(wants.map((w) => w.basic_information.master_id).filter(Boolean));
  const ownedTitles = new Set(collection.map((i) => norm(`${artists(i.basic_information)} ${i.basic_information.title}`)));
  const picks: AiPick[] = [];
  const notFound: string[] = [];
  const list = s.picks.slice(0, 15);
  for (const [i, p] of list.entries()) {
    progress(i, list.length, `Finding ${p.title} on Discogs…`);
    if (ownedTitles.has(norm(`${p.artist} ${p.title}`))) continue;
    const r = await findOnDiscogs(api, p.artist, p.title);
    if (!r) { notFound.push(`${p.artist} - ${p.title}`); continue; }
    const id = r.master_id || r.id;
    if (ownedMasters.has(id) || wantedMasters.has(id) || picks.some((x) => x.masterId === id)) continue;
    const t = splitTitle(r.title);
    picks.push({
      masterId: r.type === 'master' ? r.id : r.master_id, releaseId: r.type === 'release' ? r.id : undefined,
      artist: t.artist || p.artist, title: t.title, // Discogs search gives an album the year of its main pressing, often a reissue; the
      // AI's year is the original release, so prefer it.
      year: p.year ?? (Number(r.year) || undefined),
      thumb: r.thumb || r.cover_image, styles: r.style, why: p.why,
    });
  }
  progress(list.length, list.length, 'Done');
  return { request, intro: s.intro, picks, notFound };
}

// ------------------------------------------------------------------ review seller listings


export async function reviewListings(ask: Ask, listings: Listing[]): Promise<ListingReview> {
  const rows = listings.slice(0, 60).map((l) => ({
    id: l.id, album: l.release.description, record: l.condition, sleeve: l.sleeve_condition,
    price: `${l.price.value} ${l.price.currency}`, shipping: l.shipping_price ? `${l.shipping_price.value} ${l.shipping_price.currency}` : 'not listed',
    shipsFrom: l.ships_from, seller: l.seller.username, sellerRating: l.seller.stats?.rating, sellerRatings: l.seller.stats?.total,
    acceptsOffers: !!l.allow_offers, sellerNotes: l.comments?.slice(0, 600) ?? '',
  }));
  const r = await ask({
    task: 'review',
    content: `Listings for albums on their wantlist:\n<data>\n${rows.map((x) => JSON.stringify(x)).join('\n')}\n</data>`,
  });
  const ids = new Set(rows.map((x) => x.id));
  return { summary: r.summary, listings: r.listings.filter((x) => ids.has(x.listingId)) };
}

// ------------------------------------------------------------------ album notes


export async function albumNotes(ask: Ask, d: ReleaseDetails): Promise<AlbumNotes> {
  const info = {
    title: d.title, artists: artists(d), year: d.year, released: d.released_formatted, country: d.country,
    labels: d.labels.map((l) => `${clean(l.name)} ${l.catno ?? ''}`.trim()),
    formats: d.formats.map((f) => [f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', ')),
    genres: d.genres, styles: d.styles,
    tracks: d.tracklist.filter((t) => t.type_ !== 'heading').map((t) => `${t.position} ${t.title}`),
    credits: (d.extraartists ?? []).slice(0, 30).map((c) => `${c.role}: ${clean(c.name)}`),
    identifiers: (d.identifiers ?? []).slice(0, 15).map((x) => `${x.type}: ${x.value}`),
    discogsNotes: d.notes?.slice(0, 3000),
    community: d.community,
  };
  return ask({
    task: 'notes',
    content: `<data>\n${JSON.stringify(info)}\n</data>`,
  });
}

// ------------------------------------------------------------------ what to play tonight


/**
 * Picks for right now. Asked the same thing twice, the AI tends to give the same answer, so the
 * list is shuffled each time and the last picks are named, so "Surprise me" really does.
 */
export async function playTonight(
  ask: Ask, mood: string, collection: CollectionItem[], avoid: number[] = [], rand: () => number = Math.random,
): Promise<TonightResult> {
  const items = forAi(collection);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const skip = new Set(avoid);
  const lines = shuffled.map((i) => {
    const b = i.basic_information;
    return `${b.id} | ${albumLine(b)} | ${(b.styles ?? b.genres ?? []).slice(0, 3).join(', ')}${i.rating ? ` | rated ${i.rating}/5` : ''}`;
  });
  const r = await ask({
    task: 'tonight',
    content: `Their mood or moment: <request>${mood || 'Surprise me: something they might not think of.'}</request>\n\n${skip.size ? `Picked last time, so choose different ones: ${[...skip].join(', ')}\n\n` : ''}Their albums, in no particular order (release id | album | styles | rating):\n<data>\n${lines.join('\n')}\n</data>`,
  });
  const byId = new Map(items.map((i) => [i.basic_information.id, i.basic_information]));
  const picks = r.picks.flatMap((p) => {
    const b = byId.get(p.releaseId);
    return b ? [{ releaseId: b.id, artist: artists(b), title: b.title, year: b.year || undefined, thumb: b.cover_image || b.thumb, why: p.why }] : [];
  });
  return { note: r.note, picks };
}
