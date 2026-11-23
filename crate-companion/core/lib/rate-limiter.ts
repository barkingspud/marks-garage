const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Discogs allows 60 authenticated requests per moving 60-second window.
 * We keep a sliding window of our own request times (with headroom) and also
 * honour the X-Discogs-Ratelimit-Remaining header the server sends back.
 */
export class RateLimiter {
  private stamps: number[] = [];
  private serverRemaining = Infinity;
  private chain: Promise<void> = Promise.resolve();

  constructor(private perMinute = 55, private windowMs = 60_000) {}

  /** Resolves when it's safe to send the next request. Calls are serialized. */
  acquire(): Promise<void> {
    const next = this.chain.then(() => this.waitTurn());
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async waitTurn() {
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
      const lowOnServer = this.serverRemaining <= 2;
      if (this.stamps.length < this.perMinute && !lowOnServer) break;
      const oldest = this.stamps[0] ?? now;
      const wait = lowOnServer ? 5_000 : Math.max(250, this.windowMs - (now - oldest));
      if (lowOnServer) this.serverRemaining = Infinity; // re-learn from next response
      await sleep(wait);
    }
    this.stamps.push(Date.now());
  }

  update(remainingHeader: string | null) {
    const n = remainingHeader ? Number(remainingHeader) : NaN;
    if (Number.isFinite(n)) this.serverRemaining = n;
  }

  /** Requests used in the current window — surfaced in the UI. */
  get used() {
    const now = Date.now();
    return this.stamps.filter((t) => now - t < this.windowMs).length;
  }
}
