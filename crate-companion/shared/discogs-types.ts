// Subset of Discogs API response shapes that this app uses.
// Reference: https://www.discogs.com/developers

export interface Pagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
}

export interface ArtistRef { id: number; name: string; anv?: string; join?: string }
export interface LabelRef { id: number; name: string; catno?: string }
export interface FormatRef { name: string; qty?: string; descriptions?: string[]; text?: string }

/** `basic_information` on collection and wantlist items. */
export interface BasicInformation {
  id: number;
  master_id: number;
  title: string;
  year: number;
  thumb: string;
  cover_image: string;
  artists: ArtistRef[];
  labels: LabelRef[];
  formats: FormatRef[];
  genres?: string[];
  styles?: string[];
}

export interface CollectionItem {
  id: number;            // release id
  instance_id: number;
  folder_id: number;
  rating: number;        // 0-5, 0 = unrated
  date_added: string;
  basic_information: BasicInformation;
}

export interface WantItem {
  id: number;            // release id
  rating: number;
  date_added: string;
  notes?: string;
  basic_information: BasicInformation;
}

export interface CollectionFolder { id: number; name: string; count: number }

export interface Identity { id: number; username: string; resource_url: string }

export interface UserProfile {
  id: number;
  username: string;
  name?: string;
  avatar_url?: string;
  num_collection?: number;
  num_wantlist?: number;
  num_for_sale?: number;
  seller_rating?: number;
  seller_num_ratings?: number;
  location?: string;
  currency?: string;
}

export interface Price { value: number; currency: string }

export interface Listing {
  id: number;
  status: string;
  condition: string;        // e.g. "Very Good Plus (VG+)"
  sleeve_condition: string; // may also be "Generic", "Not Graded", "No Cover"
  price: Price;
  ships_from?: string;
  comments?: string;
  allow_offers?: boolean;
  posted?: string;
  uri: string;
  seller: {
    id: number;
    username: string;
    stats?: { rating: string | number; stars?: number; total: number };
  };
  release: { id: number; description: string; thumb?: string; year?: number };
}

export interface MarketplaceStats {
  lowest_price: Price | null;
  num_for_sale: number;
  blocked_from_sale: boolean;
}

/** Item from /artists/{id}/releases */
export interface ArtistRelease {
  id: number;
  type: 'master' | 'release';
  main_release?: number;
  title: string;
  artist: string;
  year?: number;
  role: string;
  thumb?: string;
  format?: string;
  label?: string;
  stats?: { community?: { in_wantlist: number; in_collection: number } };
}

/** Item from /labels/{id}/releases */
export interface LabelRelease {
  id: number;
  title: string;
  artist: string;
  year?: number;
  catno?: string;
  format?: string;
  thumb?: string;
}

/** Item from /database/search */
export interface SearchResult {
  id: number;
  type: 'release' | 'master' | 'artist' | 'label';
  master_id?: number;
  title: string;            // "Artist - Title"
  year?: string;
  genre?: string[];
  style?: string[];
  label?: string[];
  format?: string[];
  country?: string;
  thumb?: string;
  cover_image?: string;
  community?: { want: number; have: number };
}
