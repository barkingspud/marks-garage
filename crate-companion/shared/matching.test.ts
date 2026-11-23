import { describe, expect, it } from 'vitest';
import type { Listing } from './discogs-types';
import { buyerPrice, DEFAULT_CRITERIA, matchListings, rejectReasons, scoreListing } from './matching';

const listing = (over: Partial<Listing> & { rating?: number; total?: number } = {}): Listing => ({
  id: 1, status: 'For Sale', condition: 'Near Mint (NM or M-)', sleeve_condition: 'Very Good Plus (VG+)',
  price: { value: 20, currency: 'USD' }, ships_from: 'United States', uri: '',
  seller: { id: 1, username: 's', stats: { rating: String(over.rating ?? 99.8), total: over.total ?? 1000 } },
  release: { id: 100, description: 'x' },
  ...over,
});

describe('rejectReasons', () => {
  it('passes a good listing', () => {
    expect(rejectReasons(listing(), DEFAULT_CRITERIA)).toEqual([]);
  });
  it('rejects low media, sleeve, rating, volume, price and origin', () => {
    const c = { ...DEFAULT_CRITERIA, maxPrice: 10, shipsFrom: ['Germany'] };
    const r = rejectReasons(listing({ condition: 'Good (G)', sleeve_condition: 'Fair (F)', rating: 95, total: 3 }), c);
    expect(r).toHaveLength(6);
  });
  it('handles generic sleeves per setting', () => {
    const l = listing({ sleeve_condition: 'Generic' });
    expect(rejectReasons(l, DEFAULT_CRITERIA)).toHaveLength(1);
    expect(rejectReasons(l, { ...DEFAULT_CRITERIA, allowUngradedSleeve: true })).toEqual([]);
    expect(rejectReasons(l, { ...DEFAULT_CRITERIA, minSleeve: 'any' })).toEqual([]);
  });
});

describe('scoreListing', () => {
  it('prefers better condition and cheaper price', () => {
    const nm = scoreListing(listing(), 20).score;
    const vgp = scoreListing(listing({ condition: 'Very Good Plus (VG+)' }), 20).score;
    const pricey = scoreListing(listing({ price: { value: 50, currency: 'USD' } }), 20).score;
    expect(nm).toBeGreaterThan(vgp);
    expect(nm).toBeGreaterThan(pricey);
    expect(nm).toBeLessThanOrEqual(100);
  });
});

describe('matchListings', () => {
  it('keeps only wanted, passing listings, best first', () => {
    const out = matchListings(
      [listing(), listing({ id: 2, release: { id: 999, description: '' } }), listing({ id: 3, condition: 'Mint (M)' })],
      new Set([100]), DEFAULT_CRITERIA,
    );
    expect(out.map((m) => m.listing.id)).toEqual([3, 1]);
  });
});

describe('buyerPrice (seller currency vs. buyer currency)', () => {
  // Shape seen on the live API: a German shop pricing in EUR, viewed by a USD account.
  const eur = listing({
    price: { value: 12.08, currency: 'EUR' },
    original_price: { curr_abbr: 'EUR', value: 12.08, converted: { curr_abbr: 'USD', value: 13.27 } },
  });
  it('uses the converted price when present', () => {
    expect(buyerPrice(eur)).toEqual({ value: 13.27, currency: 'USD' });
    expect(buyerPrice(listing())).toEqual({ value: 20, currency: 'USD' });
  });
  it('applies max price and the market floor in the buyer currency', () => {
    expect(rejectReasons(eur, { ...DEFAULT_CRITERIA, maxPrice: 13 })).toHaveLength(1);
    expect(rejectReasons(eur, { ...DEFAULT_CRITERIA, maxPrice: 14 })).toEqual([]);
    expect(scoreListing(eur, 13.27).reasons).toContain('near lowest price');
  });
});
