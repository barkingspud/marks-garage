import { describe, expect, it } from 'vitest';
import type { CollectionItem } from './discogs-types';
import { buildTasteProfile, rankCandidates } from './recommend';

const item = (id: number, artistId: number, styles: string[], rating = 0, year = 1995): CollectionItem => ({
  id, instance_id: id, folder_id: 1, rating, date_added: '',
  basic_information: {
    id, master_id: id + 1000, title: `t${id}`, year, thumb: '', cover_image: '',
    artists: [{ id: artistId, name: `a${artistId}` }], labels: [{ id: 7, name: 'L' }],
    formats: [], genres: ['Electronic'], styles,
  },
});

const collection = [
  item(1, 10, ['Techno']), item(2, 10, ['Techno'], 5), item(3, 10, ['Ambient']),
  item(4, 20, ['House']), item(5, 194 /* Various */, ['Techno']),
];

describe('buildTasteProfile', () => {
  it('weights artists, styles and ratings and ignores "Various"', () => {
    const p = buildTasteProfile(collection);
    expect(p.artists.get(10)!.weight).toBe(4); // 1 + 2 (5★) + 1
    expect(p.artists.has(194)).toBe(false);
    expect(p.styles.get('Techno')).toBe(4);
    expect(p.ownedMasterIds.has(1001)).toBe(true);
  });
  it('counts a label once per release even when listed with several catalog numbers', () => {
    const dup = item(9, 30, ['Rock']);
    dup.basic_information.labels = [{ id: 1000, name: 'WB', catno: '1-25264' }, { id: 1000, name: 'WB', catno: '9 25264-1' }];
    expect(buildTasteProfile([dup]).labels.get(1000)!.weight).toBe(1);
  });
});

describe('rankCandidates', () => {
  const p = buildTasteProfile(collection);
  it('excludes owned and wanted items and merges duplicates', () => {
    const out = rankCandidates([
      { releaseId: 1, title: 'owned', artist: '', sources: ['x'] },
      { masterId: 1002, title: 'owned master', artist: '', sources: ['x'] },
      { releaseId: 50, title: 'wanted', artist: '', sources: ['x'] },
      { masterId: 2000, releaseId: 60, title: 'new', artist: 'a10', artistId: 10, sources: ['by artist'] },
      { masterId: 2000, title: 'new', artist: 'a10', styles: ['Techno'], sources: ['in style'] },
    ], p, new Set([50]), new Set());
    expect(out).toHaveLength(1);
    expect(out[0]!.releaseId).toBe(60);
    expect(out[0]!.sources).toEqual(['by artist', 'in style']);
  });
  it('ranks favorite artist + style above unrelated', () => {
    const out = rankCandidates([
      { releaseId: 70, title: 'unrelated', artist: '', styles: ['Polka'], sources: [] },
      { releaseId: 71, title: 'fav', artist: '', artistId: 10, styles: ['Techno'], year: 1997, sources: [] },
    ], p, new Set(), new Set());
    expect(out[0]!.releaseId).toBe(71);
  });
  it('caps picks per artist', () => {
    const p = buildTasteProfile(collection);
    const many = Array.from({ length: 6 }, (_, i) => ({
      masterId: 5000 + i, title: `x${i}`, artist: i % 2 ? 'Kiss' : 'Kiss, Ace Frehley', styles: ['Techno'], sources: ['s'],
    }));
    const r = rankCandidates([...many, { masterId: 6000, title: 'y', artist: 'Other', sources: ['s'] }], p, new Set(), new Set(), 50, 3);
    expect(r.filter((x) => x.artist.startsWith('Kiss'))).toHaveLength(3);
    expect(r.some((x) => x.artist === 'Other')).toBe(true);
  });
});
