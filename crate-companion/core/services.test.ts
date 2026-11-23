import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA } from '../shared/matching';
import { MockDiscogs } from './discogs/mock';
import type { DiscogsApi } from './discogs/api';
import { artistAlbums, buildRecommendations, runSellerMatch, splitTitle } from './services';

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
    expect(r.recommendations.some((x) => x.labelId)).toBe(true);
    expect(r.recommendations.every((x) => x.artist !== 'Various')).toBe(true);
  });
});

describe('splitTitle', () => {
  it('splits search titles and cleans Discogs artist suffixes and stray spaces', () => {
    expect(splitTitle('Steve Perry - Traces ')).toEqual({ artist: 'Steve Perry', title: 'Traces' });
    expect(splitTitle('UFO (5) - Doctor Doctor')).toEqual({ artist: 'UFO', title: 'Doctor Doctor' });
    expect(splitTitle('Iggy And The Stooges* - Raw Power')).toEqual({ artist: 'Iggy And The Stooges', title: 'Raw Power' });
    expect(splitTitle('Untitled')).toEqual({ artist: '', title: 'Untitled' });
  });
});

describe('artistAlbums', () => {
  it('keeps only albums credited exactly to the artist and skips unofficial releases', async () => {
    let asked: unknown;
    // Results as returned by the live API for artist=America.
    const api = { search: async (p: unknown) => {
      asked = p;
      return { pagination: { page: 1, pages: 1, per_page: 50, items: 3 }, results: [
        { id: 1, type: 'master', title: 'America (2) - Homecoming', format: ['Vinyl', 'LP', 'Album'] },
        { id: 2, type: 'master', title: 'The Presidents Of The United States Of America - The Presidents Of The United States Of America', format: ['CD', 'Album'] },
        { id: 3, type: 'master', title: 'America (2) - Live Bootleg', format: ['CD', 'Album', 'Unofficial Release'] },
      ] };
    } } as unknown as DiscogsApi;
    const r = await artistAlbums(api, 'America (2)');
    expect(r.map((x) => x.id)).toEqual([1]);
    expect(asked).toMatchObject({ artist: 'America', format: 'album', type: 'master', sort: 'have' });
  });
});
