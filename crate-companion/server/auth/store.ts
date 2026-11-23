import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenPair } from './oauth';

export interface SavedConnection extends TokenPair {
  username: string;
  connectedAt: string;
}

/**
 * Keeps the "Connect with Discogs" access token on disk so it survives restarts.
 * The file lives under .cache/ (git-ignored) unless DISCOGS_AUTH_FILE says otherwise.
 */
export class ConnectionStore {
  constructor(private file: string) {}

  load(): SavedConnection | undefined {
    try {
      const c = JSON.parse(readFileSync(this.file, 'utf8')) as SavedConnection;
      return c.token && c.secret && c.username ? c : undefined;
    } catch {
      return undefined;
    }
  }

  save(c: SavedConnection) {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(c, null, 2), { mode: 0o600 });
  }

  clear() {
    rmSync(this.file, { force: true });
  }
}
