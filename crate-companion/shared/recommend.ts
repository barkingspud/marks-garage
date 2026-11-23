import type { CollectionItem } from './discogs-types';

/** Weighted counts of what the user collects. */
export interface TasteProfile {
  total: number;
  artists: Map<number, { name: string; weight: number }>;
  labels: Map<number, { name: string; weight: number }>;
  styles: Map<string, number>;
  genres: Map<string, number>;
  decades: Map<number, number>;
  ownedReleaseIds: Set<number>;
  ownedMasterIds: Set<number>;
}

// Discogs uses these as placeholders, not real artists/labels.
const IGNORED_ARTISTS = new Set([194 /* Various */, 355 /* Unknown Artist */]);
const IGNORED_LABELS = new Set([750 /* Not On Label */, 1818 /* White Label */]);

function bump<K>(m: Map<K, number>, k: K, w: number) {
  m.set(k, (m.get(k) ?? 0) + w);
}

/** A rated 5★ item counts double; unrated counts once. */
function itemWeight(rating: number): number {
  return rating >= 4 ? 1 + (rating - 3) / 2 : rating > 0 && rating <= 2 ? 0.5 : 1;
}

export function buildTasteProfile(collection: CollectionItem[]): TasteProfile {
  const p: TasteProfile = {
    total: collection.length,
    artists: new Map(), labels: new Map(), styles: new Map(), genres: new Map(), decades: new Map(),
    ownedReleaseIds: new Set(), ownedMasterIds: new Set(),
  };
  for (const item of collection) {
    const b = item.basic_information;
    const w = itemWeight(item.rating);
    p.ownedReleaseIds.add(b.id);
    if (b.master_id) p.ownedMasterIds.add(b.master_id);
    for (const a of b.artists) {
      if (IGNORED_ARTISTS.has(a.id)) continue;
      const cur = p.artists.get(a.id);
      p.artists.set(a.id, { name: a.name, weight: (cur?.weight ?? 0) + w });
    }
    for (const l of b.labels) {
      if (IGNORED_LABELS.has(l.id)) continue;
      const cur = p.labels.get(l.id);
      p.labels.set(l.id, { name: l.name, weight: (cur?.weight ?? 0) + w });
    }
    for (const s of b.styles ?? []) bump(p.styles, s, w);
    for (const g of b.genres ?? []) bump(p.genres, g, w);
    if (b.year > 0) bump(p.decades, Math.floor(b.year / 10) * 10, w);
  }
  return p;
}

export function topN<K>(m: Map<K, number>, n: number): [K, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function topEntities(m: Map<number, { name: string; weight: number }>, n: number) {
  return [...m.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n);
}

export interface Candidate {
  /** Release id to add to the wantlist. Search results only give a master; it's resolved on add. */
  releaseId?: number;
  masterId?: number;
  title: string;
  artist: string;
  year?: number;
  thumb?: string;
  styles?: string[];
  genres?: string[];
  artistId?: number;
  labelId?: number;
  community?: { want: number; have: number };
  /** Why this was surfaced, e.g. "You own 8 records by Aphex Twin". */
  sources: string[];
}

export interface Recommendation extends Candidate {
  score: number;
  reasons: string[];
}

/**
 * Score a candidate against the profile. Components (each roughly 0..1):
 *  - style/genre overlap with the collection
 *  - artist and label affinity
 *  - decade affinity
 *  - community demand (want/have ratio, popularity)
 */
export function scoreCandidate(c: Candidate, p: TasteProfile): Recommendation {
  const reasons = [...c.sources];
  const maxStyle = Math.max(1, ...p.styles.values());
  const maxGenre = Math.max(1, ...p.genres.values());
  const maxArtist = Math.max(1, ...[...p.artists.values()].map((a) => a.weight));
  const maxLabel = Math.max(1, ...[...p.labels.values()].map((l) => l.weight));
  const maxDecade = Math.max(1, ...p.decades.values());

  const styleScores = (c.styles ?? []).map((s) => (p.styles.get(s) ?? 0) / maxStyle);
  const style = styleScores.length ? Math.max(...styleScores) * 0.7 + avg(styleScores) * 0.3 : 0;
  const genre = Math.max(0, ...(c.genres ?? []).map((g) => (p.genres.get(g) ?? 0) / maxGenre));
  const artist = c.artistId ? (p.artists.get(c.artistId)?.weight ?? 0) / maxArtist : 0;
  const label = c.labelId ? (p.labels.get(c.labelId)?.weight ?? 0) / maxLabel : 0;
  const decade = c.year ? (p.decades.get(Math.floor(c.year / 10) * 10) ?? 0) / maxDecade : 0;

  let demand = 0;
  if (c.community && c.community.have + c.community.want > 0) {
    const { want, have } = c.community;
    const ratio = want / Math.max(1, have);                 // >1 = sought after
    const pop = Math.min(1, Math.log10(1 + want + have) / 4); // ~10k → 1
    demand = 0.5 * Math.min(1, ratio) + 0.5 * pop;
    if (ratio > 1.5 && want > 50) reasons.push('highly wanted by the community');
  }

  const matchingStyles = (c.styles ?? []).filter((s) => p.styles.has(s)).slice(0, 3);
  if (matchingStyles.length && !reasons.some((r) => r.includes('style'))) {
    reasons.push(`matches your styles: ${matchingStyles.join(', ')}`);
  }

  const score = Math.round(
    100 * (0.3 * style + 0.1 * genre + 0.25 * artist + 0.1 * label + 0.1 * decade + 0.15 * demand),
  );
  return { ...c, score, reasons };
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Drop owned/wanted items, merge duplicates (keeping all reasons), score and rank. */
export function rankCandidates(
  candidates: Candidate[],
  p: TasteProfile,
  wantedReleaseIds: Set<number>,
  wantedMasterIds: Set<number>,
  limit = 50,
): Recommendation[] {
  const merged = new Map<string, Candidate>();
  for (const c of candidates) {
    if (c.releaseId && (p.ownedReleaseIds.has(c.releaseId) || wantedReleaseIds.has(c.releaseId))) continue;
    if (c.masterId && (p.ownedMasterIds.has(c.masterId) || wantedMasterIds.has(c.masterId))) continue;
    const key = c.masterId ? `m${c.masterId}` : `r${c.releaseId}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, { ...c, sources: [...c.sources] });
    else {
      prev.sources = [...new Set([...prev.sources, ...c.sources])];
      prev.styles ??= c.styles;
      prev.genres ??= c.genres;
      prev.community ??= c.community;
      prev.artistId ??= c.artistId;
      prev.labelId ??= c.labelId;
      prev.thumb ||= c.thumb;
      prev.releaseId ??= c.releaseId;
    }
  }
  return [...merged.values()]
    .map((c) => {
      const r = scoreCandidate(c, p);
      // Found by more than one route = stronger signal.
      r.score = Math.min(100, r.score + 5 * (c.sources.length - 1));
      return r;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
