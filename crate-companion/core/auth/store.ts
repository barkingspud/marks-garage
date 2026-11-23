import type { TokenPair } from './oauth';

/**
 * Minimal async key-value storage, so the core runs anywhere: a JSON file on a PC
 * (server/file-store.ts), localStorage in a browser, secure storage on a phone.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory store, for tests and demo mode. */
export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, value: string) { this.map.set(key, value); }
  async remove(key: string) { this.map.delete(key); }
}

export interface SavedConnection extends TokenPair {
  username: string;
  connectedAt: string;
}

const KEY = 'discogs-connection';

/** The "Connect with Discogs" access token, kept so it survives restarts. */
export class ConnectionStore {
  constructor(private store: KeyValueStore) {}

  async load(): Promise<SavedConnection | undefined> {
    try {
      const c = JSON.parse((await this.store.get(KEY)) ?? 'null') as SavedConnection | null;
      return c?.token && c.secret && c.username ? c : undefined;
    } catch {
      return undefined;
    }
  }

  save(c: SavedConnection) {
    return this.store.set(KEY, JSON.stringify(c));
  }

  clear() {
    return this.store.remove(KEY);
  }
}
