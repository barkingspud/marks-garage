import type { AiModelId } from './ai-models';
import type { SearchResult } from './discogs-types';

/** What the AI features return to the app. */

export interface AiStatus {
  /** An Anthropic API key is saved. */
  configured: boolean;
  /** The model the AI features use, chosen in Settings. */
  model: AiModelId;
}

export type AiFeature = 'identify' | 'recommend' | 'review' | 'notes' | 'tonight';

/** One use of an AI feature (it can take more than one request) and what it cost. */
export interface AiUsageEntry {
  at: string;
  feature: AiFeature;
  /** The model that answered. */
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** U.S. dollars, from Anthropic's list prices. */
  cost: number;
}

export interface AiUsageGroup {
  feature: AiFeature;
  model: string;
  uses: number;
  cost: number;
}

export interface AiUsageReport {
  thisMonth: { uses: number; cost: number };
  total: { uses: number; cost: number };
  /** Average cost per use, by feature and model, so models can be compared. */
  groups: AiUsageGroup[];
  recent: AiUsageEntry[];
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
