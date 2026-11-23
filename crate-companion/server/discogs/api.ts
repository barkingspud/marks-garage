import type {
  ArtistRelease, CollectionFolder, CollectionItem, Identity, LabelRelease, Listing,
  MarketplaceStats, Pagination, SearchResult, UserProfile, WantItem,
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
  requestsInWindow(): number;
  identity(): Promise<Identity>;
  profile(username: string): Promise<UserProfile>;
  folders(username: string): Promise<{ folders: CollectionFolder[] }>;
  collectionPage(username: string, folderId: number, page: number, perPage?: number): Promise<Paged<'releases', CollectionItem>>;
  collectionValue(username: string): Promise<{ minimum: string; median: string; maximum: string }>;
  wantsPage(username: string, page: number, perPage?: number): Promise<Paged<'wants', WantItem>>;
  addWant(username: string, releaseId: number): Promise<void>;
  removeWant(username: string, releaseId: number): Promise<void>;
  marketplaceStats(releaseId: number, currency?: string): Promise<MarketplaceStats>;
  inventoryPage(username: string, page: number, perPage?: number): Promise<Paged<'listings', Listing>>;
  artistReleases(artistId: number, page?: number, perPage?: number): Promise<Paged<'releases', ArtistRelease>>;
  labelReleases(labelId: number, page?: number, perPage?: number): Promise<Paged<'releases', LabelRelease>>;
  master(masterId: number): Promise<{ id: number; main_release: number; title: string }>;
  search(params: SearchParams): Promise<Paged<'results', SearchResult>>;
}
