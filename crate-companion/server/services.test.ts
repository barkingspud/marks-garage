import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA } from '../shared/matching';
import { MockDiscogs } from './discogs/mock';
import { buildRecommendations, runSellerMatch } from './services';

const noop = () => {};

describe('services against mock Discogs', () => {
  const api = new MockDiscogs();
  it('matches wantlist items in seller inventories', async () => {
    const r = await runSellerMatch(api, 'demo_digger', {
      sellers: ['groove_merchant', 'dusty_bins', 'nobody'], criteria: { ...DEFAULT_CRITERIA, minSellerRating: 0, minSellerRatings: 0 },
      maxPagesPerSeller: 5,
    }, noop);
    expect(r.wantsCount).toBeGreaterThan(0);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.sellers.find((s) => s.username === 'nobody')?.error).toBeTruthy();
  });
  it('builds recommendations excluding owned items', async () => {
    const r = await buildRecommendations(api, 'demo_digger', { artists: 4, labels: 2, styles: 3 }, noop);
    expect(r.recommendations.length).toBeGreaterThan(5);
    expect(r.profile.topArtists.length).toBe(4);
  });
});
