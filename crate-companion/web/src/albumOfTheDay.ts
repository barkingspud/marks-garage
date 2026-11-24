import type { CollectionItem } from '../../shared/discogs-types';

/**
 * The Home page's featured album: a different one each day (the same all day), favoring albums
 * you rated highly, with a line saying why it's a good pick today.
 */

/** A small seeded random generator (mulberry32), so a day always gives the same pick. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const added = (i: CollectionItem) => new Date(i.date_added);
const addedOnThisDay = (i: CollectionItem, now: Date) => {
  const a = added(i);
  return a.getMonth() === now.getMonth() && a.getDate() === now.getDate() && a.getFullYear() < now.getFullYear();
};
const roundBirthday = (i: CollectionItem, now: Date) => {
  const y = i.basic_information.year;
  const age = now.getFullYear() - y;
  return y > 0 && age >= 5 && age % 5 === 0 ? age : 0;
};
/** 5 stars count three times, 4 stars twice. */
const weight = (i: CollectionItem) => (i.rating >= 5 ? 3 : i.rating === 4 ? 2 : 1);

/** Why this album is worth playing today. */
export function storyFor(i: CollectionItem, now = new Date()): string {
  if (addedOnThisDay(i, now)) return `Added to your collection on this day in ${added(i).getFullYear()}`;
  const age = roundBirthday(i, now);
  if (age) return `Turns ${age} this year`;
  if (i.rating >= 4) return `One of your ${i.rating}-star albums`;
  const since = added(i).getFullYear();
  if (now.getFullYear() - since >= 2) return `In your collection since ${since}`;
  return i.basic_information.year > 0 ? `From ${i.basic_information.year}` : 'From your shelves';
}

function weightedPick(items: CollectionItem[], rand: () => number): CollectionItem {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let r = rand() * total;
  for (const i of items) { r -= weight(i); if (r < 0) return i; }
  return items[items.length - 1]!;
}

/**
 * Today's album. An album added on this day in an earlier year comes first (it's the best
 * story), then one turning a round age this year; otherwise a weighted pick from everything.
 */
export function albumOfTheDay(items: CollectionItem[], now = new Date()): CollectionItem | undefined {
  if (!items.length) return undefined;
  const rand = seeded(hash(dayKey(now)));
  const anniversary = items.filter((i) => addedOnThisDay(i, now));
  if (anniversary.length) return weightedPick(anniversary, rand);
  // Round birthdays only some days, so the rest of the collection still gets its turn.
  const birthdays = items.filter((i) => roundBirthday(i, now));
  if (birthdays.length && rand() < 0.35) return weightedPick(birthdays, rand);
  return weightedPick(items, rand);
}

/** Another album for the shuffle button, never the one showing now. */
export function anotherAlbum(items: CollectionItem[], current?: CollectionItem, rand = Math.random): CollectionItem | undefined {
  const rest = items.filter((i) => i.instance_id !== current?.instance_id);
  return rest.length ? weightedPick(rest, rand) : current;
}
