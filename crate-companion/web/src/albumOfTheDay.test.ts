import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../../shared/discogs-types';
import { albumOfTheDay, anotherAlbum, storyFor } from './albumOfTheDay';

const item = (id: number, o: { year?: number; rating?: number; added?: string } = {}): CollectionItem => ({
  id, instance_id: id, folder_id: 1, rating: o.rating ?? 0, date_added: o.added ?? '2025-03-01T12:00:00-08:00',
  basic_information: { id, master_id: id, title: `Album ${id}`, year: o.year ?? 1983, thumb: '', cover_image: '', artists: [], labels: [], formats: [] },
});
const now = new Date(2026, 10, 24, 20, 0); // November 24, 2026

describe('album of the day', () => {
  it('tells why an album is a good pick today', () => {
    expect(storyFor(item(1, { added: '2019-11-24T10:00:00' }), now)).toBe('Added to your collection on this day in 2019');
    expect(storyFor(item(2, { year: 1976 }), now)).toBe('Turns 50 this year');
    expect(storyFor(item(3, { rating: 5 }), now)).toBe('One of your 5-star albums');
    expect(storyFor(item(4, { added: '2014-05-02T10:00:00' }), now)).toBe('In your collection since 2014');
    expect(storyFor(item(5, { year: 1983 }), now)).toBe('From 1983');
  });

  it('is the same all day, and an album added on this day wins', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(i + 1));
    const a = albumOfTheDay(items, now);
    expect(albumOfTheDay(items, new Date(2026, 10, 24, 8, 0))).toBe(a);
    const special = item(99, { added: '2018-11-24T09:00:00' });
    expect(albumOfTheDay([...items, special], now)).toBe(special);
  });

  it('changes from day to day', () => {
    const items = Array.from({ length: 200 }, (_, i) => item(i + 1));
    const picks = new Set(Array.from({ length: 10 }, (_, d) => albumOfTheDay(items, new Date(2026, 0, d + 1))!.id));
    expect(picks.size).toBeGreaterThan(5);
  });

  it('shuffles to a different album', () => {
    const items = [item(1), item(2), item(3)];
    for (let n = 0; n < 20; n++) expect(anotherAlbum(items, items[0])!.id).not.toBe(1);
    expect(anotherAlbum([item(1)], item(1))!.id).toBe(1);
    expect(albumOfTheDay([], now)).toBeUndefined();
  });
});
