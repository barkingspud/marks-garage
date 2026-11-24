/**
 * Counts AI use for the app's included AI: uses per install per month, requests per network
 * address per day (so reinstalling over and over doesn't get around the cap), and what the
 * month has cost. One instance holds all the counts, so they're always exact.
 */

export interface Limits {
  /** Uses of an AI feature per install per month. */
  monthlyUses: number;
  /** Requests per network address per day, across every install behind it. */
  ipDailyRequests: number;
  /** When the month's spend reaches this, the included AI pauses until next month. */
  monthlyBudgetUsd: number;
}

/** The storage a Durable Object has (and a Map can fake in tests). */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface Allowance { used: number; limit: number; resetsOn: string }

export type Verdict =
  | { ok: true; allowance: Allowance }
  | { ok: false; reason: 'cap' | 'ip' | 'budget'; allowance: Allowance };

/** One feature use can take a few requests (identify takes two). More than this is a new use. */
export const REQUESTS_PER_USE = 3;

const month = (now: Date) => now.toISOString().slice(0, 7);
const day = (now: Date) => now.toISOString().slice(0, 10);
export function nextMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

export class Meter {
  constructor(private store: Store, private limits: Limits) {}

  async allowance(install: string, now = new Date()): Promise<Allowance> {
    const used = (await this.store.get<number>(`uses:${month(now)}:${install}`)) ?? 0;
    return { used, limit: this.limits.monthlyUses, resetsOn: nextMonth(now) };
  }

  /**
   * Before a request: is it allowed? Counts it if so. `use` names the feature use the request
   * belongs to, so the two requests of one photo identify count as one use.
   */
  async reserve(install: string, use: string, ip: string, now = new Date()): Promise<Verdict> {
    const m = month(now);
    const usesKey = `uses:${m}:${install}`;
    const lastKey = `last:${install}`;
    const ipKey = `ip:${day(now)}:${ip}`;
    let used = (await this.store.get<number>(usesKey)) ?? 0;
    const allowance = () => ({ used, limit: this.limits.monthlyUses, resetsOn: nextMonth(now) });

    if (((await this.store.get<number>(`spend:${m}`)) ?? 0) >= this.limits.monthlyBudgetUsd) return { ok: false, reason: 'budget', allowance: allowance() };
    const ipCount = (await this.store.get<number>(ipKey)) ?? 0;
    if (ipCount >= this.limits.ipDailyRequests) return { ok: false, reason: 'ip', allowance: allowance() };

    const last = await this.store.get<{ use: string; month: string; requests: number }>(lastKey);
    const sameUse = !!use && last?.use === use && last.month === m && last.requests < REQUESTS_PER_USE;
    if (!sameUse) {
      if (used >= this.limits.monthlyUses) return { ok: false, reason: 'cap', allowance: allowance() };
      used++;
      await this.store.put(usesKey, used);
    }
    await this.store.put(lastKey, { use, month: m, requests: sameUse ? last!.requests + 1 : 1 });
    await this.store.put(ipKey, ipCount + 1);
    return { ok: true, allowance: allowance() };
  }

  /** A request failed before Claude did any work: give the use back. */
  async refund(install: string, use: string, now = new Date()) {
    const m = month(now);
    const last = await this.store.get<{ use: string; month: string; requests: number }>(`last:${install}`);
    if (last?.use !== use || last.month !== m) return;
    if (last.requests > 1) { await this.store.put(`last:${install}`, { ...last, requests: last.requests - 1 }); return; }
    const key = `uses:${m}:${install}`;
    const used = (await this.store.get<number>(key)) ?? 0;
    if (used > 0) await this.store.put(key, used - 1);
    await this.store.put(`last:${install}`, { use: '', month: m, requests: 0 });
  }

  /** After a request: add what it cost to the month. */
  async spend(usd: number, now = new Date()) {
    const key = `spend:${month(now)}`;
    await this.store.put(key, ((await this.store.get<number>(key)) ?? 0) + usd);
  }

  async spent(now = new Date()): Promise<number> {
    return (await this.store.get<number>(`spend:${month(now)}`)) ?? 0;
  }

  /** Album notes, shared: written once per pressing (Discogs release), then read by everyone. */
  async getNotes(releaseId: number): Promise<unknown | undefined> {
    return this.store.get(`notes:${releaseId}`);
  }

  async putNotes(releaseId: number, notes: unknown) {
    await this.store.put(`notes:${releaseId}`, notes);
  }
}
