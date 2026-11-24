import type { SearchResult } from './discogs-types';

/** What the AI features return to the app. */

export interface AiStatus {
  /** An Anthropic API key is saved. */
  configured: boolean;
  model: string;
}

export interface IdentifyResult {
  /** What the AI read in the photos. */
  seen: {
    artist: string | null;
    title: string | null;
    label: string | null;
    catalogNumbers: string[];
    barcode: string | null;
    runout: string[];
  };
  /** Pressings found on Discogs, best match first. */
  candidates: SearchResult[];
  bestReleaseId: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  /** What to look at on the copy to be sure. */
  check: string;
}

export interface AiPick {
  masterId?: number;
  releaseId?: number;
  artist: string;
  title: string;
  year?: number;
  thumb?: string;
  styles?: string[];
  why: string;
}

export interface AiRecommendResult {
  request: string;
  intro: string;
  picks: AiPick[];
  /** Suggestions that couldn't be found on Discogs, so they were left out. */
  notFound: string[];
}

export interface ListingReview {
  summary: string;
  listings: { listingId: number; verdict: 'great' | 'good' | 'caution' | 'skip'; note: string }[];
}

export interface AlbumNotes {
  about: string;
  listenFor: string[];
  thisPressing: string;
  /** Anything the AI isn't sure of. */
  caveat: string;
}

export interface TonightPick { releaseId: number; artist: string; title: string; year?: number; thumb?: string; why: string }
export interface TonightResult { note: string; picks: TonightPick[] }
