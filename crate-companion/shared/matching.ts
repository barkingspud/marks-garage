import { gradeRank, meetsGrade, parseGrade, type Grade } from './conditions';
import type { Listing } from './discogs-types';

export interface MatchCriteria {
  minMedia: Grade;
  /** Minimum sleeve grade, or 'any' to ignore sleeve entirely. */
  minSleeve: Grade | 'any';
  /** Accept "Generic" / "Not Graded" / "No Cover" sleeves (only when minSleeve != 'any'). */
  allowUngradedSleeve: boolean;
  /** Seller feedback %, 0-100. */
  minSellerRating: number;
  minSellerRatings: number;
  /** Max price in the listing currency; null = no limit. */
  maxPrice: number | null;
  /** If non-empty, listing.ships_from must be one of these. */
  shipsFrom: string[];
}

export const DEFAULT_CRITERIA: MatchCriteria = {
  minMedia: 'VG+',
  minSleeve: 'VG',
  allowUngradedSleeve: false,
  minSellerRating: 98,
  minSellerRatings: 25,
  maxPrice: null,
  shipsFrom: [],
};

export interface ScoredListing {
  listing: Listing;
  score: number;      // 0-100
  reasons: string[];
}

export function sellerRating(l: Listing): { rating: number | null; total: number } {
  const s = l.seller.stats;
  if (!s) return { rating: null, total: 0 };
  const r = typeof s.rating === 'string' ? parseFloat(s.rating) : s.rating;
  return { rating: Number.isFinite(r) ? r : null, total: s.total ?? 0 };
}

/** Returns a list of reasons the listing fails the criteria (empty = passes). */
export function rejectReasons(l: Listing, c: MatchCriteria): string[] {
  const out: string[] = [];
  if (!meetsGrade(l.condition, c.minMedia)) out.push(`media ${l.condition} below ${c.minMedia}`);
  if (c.minSleeve !== 'any') {
    const sg = parseGrade(l.sleeve_condition);
    if (sg === null) {
      if (!c.allowUngradedSleeve) out.push(`sleeve "${l.sleeve_condition || 'none'}" not graded`);
    } else if (gradeRank(sg) < gradeRank(c.minSleeve)) {
      out.push(`sleeve ${l.sleeve_condition} below ${c.minSleeve}`);
    }
  }
  const { rating, total } = sellerRating(l);
  if (rating !== null && rating < c.minSellerRating) out.push(`seller rating ${rating}% < ${c.minSellerRating}%`);
  if (total < c.minSellerRatings) out.push(`seller has ${total} ratings (< ${c.minSellerRatings})`);
  if (c.maxPrice !== null && l.price.value > c.maxPrice) out.push(`price ${l.price.value} > ${c.maxPrice}`);
  if (c.shipsFrom.length && !c.shipsFrom.includes(l.ships_from ?? '')) out.push(`ships from ${l.ships_from}`);
  return out;
}

/**
 * Score a passing listing 0-100. Weighted: media 35, sleeve 15, seller 30, price 20.
 * `lowestPrice` (from marketplace stats) lets us reward listings near the market floor.
 */
export function scoreListing(l: Listing, lowestPrice: number | null): ScoredListing {
  const reasons: string[] = [];
  const media = gradeRank(parseGrade(l.condition)) / 7;            // 0..1
  const sleeveG = parseGrade(l.sleeve_condition);
  const sleeve = sleeveG ? gradeRank(sleeveG) / 7 : 0.3;
  const { rating, total } = sellerRating(l);
  const ratingPart = rating === null ? 0.5 : Math.max(0, (rating - 90) / 10); // 90%→0, 100%→1
  const volumePart = Math.min(1, Math.log10(Math.max(1, total)) / 3);     // 1000+ ratings → 1
  const seller = 0.7 * ratingPart + 0.3 * volumePart;
  let price = 0.5;
  if (lowestPrice && lowestPrice > 0) {
    const ratio = l.price.value / lowestPrice;                      // 1 = market floor
    price = Math.max(0, Math.min(1, 1 - (ratio - 1) / 2));          // 3x floor → 0
    if (ratio <= 1.1) reasons.push('near lowest price');
  }
  if (media >= 6 / 7) reasons.push(`media ${parseGrade(l.condition)}`);
  if (rating !== null && rating >= 99.5 && total >= 500) reasons.push('top-rated seller');
  const score = Math.round(100 * (0.35 * media + 0.15 * sleeve + 0.3 * seller + 0.2 * price));
  return { listing: l, score, reasons };
}

export function matchListings(
  listings: Listing[],
  wantedReleaseIds: Set<number>,
  criteria: MatchCriteria,
  lowestPrices: Map<number, number> = new Map(),
): ScoredListing[] {
  return listings
    .filter((l) => wantedReleaseIds.has(l.release.id) && rejectReasons(l, criteria).length === 0)
    .map((l) => scoreListing(l, lowestPrices.get(l.release.id) ?? null))
    .sort((a, b) => b.score - a.score);
}
