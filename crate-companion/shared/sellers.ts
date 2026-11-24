/**
 * Working out which Discogs shop someone means: a seller name, or a link to the seller's page,
 * their profile, or one of their listings. Shared text from the Discogs app can wrap the link
 * in other words ("Check out this record on Discogs: https://…"), so the link is found anywhere.
 */

export type SellerInput =
  | { kind: 'username'; username: string }
  | { kind: 'listing'; listingId: number };

/** A Discogs username: letters, digits, dots, dashes and underscores. */
const USERNAME = /^[A-Za-z0-9._-]{2,64}$/;

export function parseSellerInput(text: string): SellerInput | null {
  const t = text.trim();
  if (!t) return null;
  const url = /https?:\/\/(?:www\.|m\.)?discogs\.com\/\S+/i.exec(t)?.[0];
  if (url) {
    let path: string;
    try { path = new URL(url).pathname; } catch { return null; }
    // Links can carry a language first, e.g. /fr/sell/item/123.
    const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
    if (parts[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]) && parts[0] !== 'me') parts.shift();
    const [a, b, c] = parts;
    if (a === 'sell' && b === 'item' && c && /^\d+$/.test(c)) return { kind: 'listing', listingId: Number(c) };
    if ((a === 'seller' || a === 'user') && b && USERNAME.test(b)) return { kind: 'username', username: b };
    return null;
  }
  return USERNAME.test(t) ? { kind: 'username', username: t } : null;
}

/** What the app shows about a shop before adding it. */
export interface SellerCard {
  username: string;
  name?: string;
  location?: string;
  avatar?: string;
  /** Seller rating in percent, e.g. 99.8. */
  rating?: number;
  ratings?: number;
  forSale?: number;
}
