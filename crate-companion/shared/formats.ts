/**
 * Which kind of physical media a release is, from Discogs' format names. The app treats vinyl,
 * CDs and cassettes as their own kinds (their own labels and artwork); anything else
 * (8-track, reel-to-reel, MiniDisc, files…) gets neutral wording.
 */

export type MediaKind = 'vinyl' | 'cd' | 'cassette' | 'other';

const VINYL = /^(vinyl|lp|acetate|lathe cut|flexi-disc|shellac|[0-9]{1,2}")$/i;
const CD = /^(cd|cdr|sacd|hybrid|hdcd|cdv|minimax cd|blu-spec cd|shm-cd)$/i;
const CASSETTE = /^(cassette|microcassette|dcc|cass)$/i;

/**
 * The first recognizable name wins, so a box set of LPs counts as vinyl. Works with release
 * formats (`['Vinyl', 'CD']`), search results (`['Vinyl', 'LP', 'Album']`) and listing
 * descriptions (`'CD, Album, RE'`).
 */
export function mediaKind(names: string | (string | undefined | null)[] | undefined | null): MediaKind {
  const list = typeof names === 'string' ? names.split(',') : names ?? [];
  for (const raw of list) {
    const n = (raw ?? '').trim();
    if (!n) continue;
    if (VINYL.test(n)) return 'vinyl';
    if (CD.test(n)) return 'cd';
    if (CASSETTE.test(n)) return 'cassette';
  }
  return 'other';
}

/** The release's formats, as Discogs lists them on a release or collection item. */
export function kindOf(b: { formats?: { name: string }[] } | null | undefined): MediaKind {
  return mediaKind(b?.formats?.map((f) => f.name));
}

/** What the two condition grades are called for this kind of media. */
export function gradeLabels(kind: MediaKind): { media: string; sleeve: string } {
  switch (kind) {
    case 'vinyl': return { media: 'Vinyl', sleeve: 'Sleeve' };
    case 'cd': return { media: 'Disc', sleeve: 'Case' };
    case 'cassette': return { media: 'Tape', sleeve: 'Case' };
    default: return { media: 'Media', sleeve: 'Sleeve' };
  }
}

export const KIND_NAMES: Record<MediaKind, string> = { vinyl: 'Vinyl', cd: 'CD', cassette: 'Cassette', other: 'Other' };
