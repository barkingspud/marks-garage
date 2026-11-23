import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KeyValueStore } from '../core/auth/store';

/** Key-value store in one JSON file (git-ignored .cache/ by default), for running on a PC. */
export class FileStore implements KeyValueStore {
  constructor(private file: string) {}
  private read(): Record<string, string> {
    let data: Record<string, unknown>;
    try { data = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>; } catch { return {}; }
    // Before the shared core, this file held just the saved connection. Keep it working.
    if (typeof data.token === 'string' && typeof data.secret === 'string' && typeof data.username === 'string') {
      return { 'discogs-connection': JSON.stringify(data) };
    }
    return data as Record<string, string>;
  }
  private write(all: Record<string, string>) {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(all, null, 2), { mode: 0o600 });
  }
  async get(key: string) { return this.read()[key] ?? null; }
  async set(key: string, value: string) { const all = this.read(); all[key] = value; this.write(all); }
  async remove(key: string) { const all = this.read(); delete all[key]; this.write(all); }
}
