/** Tiny in-memory TTL cache with a size cap (oldest entries evicted first). */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(private maxEntries = 5000) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  deletePrefix(prefix: string) {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}
