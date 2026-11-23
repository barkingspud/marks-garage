import type { ScoredListing } from './matching';
import type { Recommendation } from './recommend';

export interface SellerScan {
  username: string;
  scanned: number;
  totalListings: number;
  truncated: boolean;
  matches: number;
  rating?: number;
  ratings?: number;
  error?: string;
}

export interface MatchResult {
  wantsCount: number;
  sellers: SellerScan[];
  matches: ScoredListing[];
}

export interface RecommendResult {
  profile: {
    total: number;
    topArtists: { id: number; name: string; weight: number }[];
    topLabels: { id: number; name: string; weight: number }[];
    topStyles: [string, number][];
    topDecades: [number, number][];
  };
  recommendations: Recommendation[];
}
