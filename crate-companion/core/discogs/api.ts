import type {
  ArtistRelease, CollectionField, CollectionFolder, CollectionItem, Identity, LabelRelease, Listing,
  MarketplaceStats, Pagination, ReleaseDetails, SearchResult, UserProfile, WantItem,
} from '../../shared/discogs-types';

export type Paged<K extends string, T> = { pagination: Pagination } & { [P in K]: T[] };

export interface SearchParams {
  q?: string;
  type?: 'release' | 'master' | 'artist' | 'label';
  genre?: string;
  style?: string;
  year?: string;     // "1995" or "1990-1999"
  format?: string;
  country?: string;
  /** Catalog number and barcode (Record Check). */
  catno?: string;
  barcode?: string;
  /** Artist name (fuzzy match; Discogs ignores the " (2)" suffix form). */
  artist?: string;
  /** Album title (with type=master or release). */
  release_title?: string;
  /** Label name (matched by name, not id). */
  label?: string;
  sort?: 'have' | 'want' | 'year' | 'title';
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

/** Everything the app needs from Discogs. Implemented by the real client and the mock. */
export interface DiscogsApi {
  readonly isMock: boolean;
  /** Fetch a cover image's bytes (to read its colors), or null if unavailable. */
  image(url: string): Promise<{ body: ArrayBuffer; type: string } | null>;
  requestsInWindow(): number;
  identity(): Promise<Identity>;
  profile(username: string): Promise<UserProfile>;
  folders(username: string): Promise<{ folders: CollectionFolder[] }>;
  collectionPage(username: string, folderId: number, page: number, perPage?: number): Promise<Paged<'releases', CollectionItem>>;
  collectionValue(username: string): Promise<{ minimum: string; median: string; maximum: string }>;
  wantsPage(username: string, page: number, perPage?: number): Promise<Paged<'wants', WantItem>>;
  addWant(username: string, releaseId: number): Promise<void>;
  /** Add a release to the "Uncategorized" folder (id 1). */
  addToCollection(username: string, releaseId: number): Promise<void>;
  collectionFields(username: string): Promise<{ fields: CollectionField[] }>;
  removeWant(username: string, releaseId: number): Promise<void>;
  /** Rate a record in the collection, 1 to 5 stars (0 clears it). */
  setRating(username: string, folderId: number, releaseId: number, instanceId: number, rating: number): Promise<void>;
  /** Everything about one pressing: track listing, credits, runout numbers, notes. */
  release(releaseId: number): Promise<ReleaseDetails>;
  marketplaceStats(releaseId: number, currency?: string): Promise<MarketplaceStats>;
  inventoryPage(username: string, page: number, perPage?: number): Promise<Paged<'listings', Listing>>;
  artistReleases(artistId: number, page?: number, perPage?: number): Promise<Paged<'releases', ArtistRelease>>;
  labelReleases(labelId: number, page?: number, perPage?: number): Promise<Paged<'releases', LabelRelease>>;
  master(masterId: number): Promise<{ id: number; main_release: number; title: string }>;
  search(params: SearchParams): Promise<Paged<'results', SearchResult>>;
}
