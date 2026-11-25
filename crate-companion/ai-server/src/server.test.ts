import { describe, expect, it } from 'vitest';
import { AiError } from '../../core/ai/llm';
import { checkContent, TASKS } from '../../core/ai/tasks';
import { handle, notesReleaseId, type Deps } from './handler';
import { Meter, nextMonth, type Store } from './meter';

class MapStore implements Store {
  map = new Map<string, unknown>();
  async get<T>(k: string) { return this.map.get(k) as T | undefined; }
  async put<T>(k: string, v: T) { this.map.set(k, v); }
}

const limits = { monthlyUses: 3, ipDailyRequests: 20, monthlyBudgetUsd: 10 };
const now = new Date('2026-11-24T12:00:00Z');
const INSTALL = '0b0e3c2a-1111-4222-8333-944455556666';

describe('meter', () => {
  it('counts uses per install per month, and stops at the cap', async () => {
    const m = new Meter(new MapStore(), limits);
    for (let i = 1; i <= 3; i++) {
      const v = await m.reserve(INSTALL, `use-${i}`, '1.1.1.1', now);
      expect(v).toMatchObject({ ok: true, allowance: { used: i, limit: 3, resetsOn: '2026-12-01' } });
    }
    expect(await m.reserve(INSTALL, 'use-4', '1.1.1.1', now)).toMatchObject({ ok: false, reason: 'cap' });
    // Another install has its own allowance; next month starts over.
    expect((await m.reserve('other', 'u', '1.1.1.1', now)).ok).toBe(true);
    expect((await m.reserve(INSTALL, 'use-5', '1.1.1.1', new Date('2026-12-02T00:00:00Z'))).ok).toBe(true);
  });

  it('counts the requests of one use as one, but only a few', async () => {
    const m = new Meter(new MapStore(), limits);
    await m.reserve(INSTALL, 'identify-1', 'ip', now);
    await m.reserve(INSTALL, 'identify-1', 'ip', now);
    expect((await m.allowance(INSTALL, now)).used).toBe(1);
    await m.reserve(INSTALL, 'identify-1', 'ip', now);
    await m.reserve(INSTALL, 'identify-1', 'ip', now); // a fourth request is a new use
    expect((await m.allowance(INSTALL, now)).used).toBe(2);
  });

  it('limits requests per network address per day', async () => {
    const m = new Meter(new MapStore(), { ...limits, monthlyUses: 100, ipDailyRequests: 2 });
    await m.reserve('a', 'u1', 'ip', now);
    await m.reserve('b', 'u2', 'ip', now);
    expect(await m.reserve('c', 'u3', 'ip', now)).toMatchObject({ ok: false, reason: 'ip' });
    expect((await m.reserve('c', 'u3', 'other-ip', now)).ok).toBe(true);
  });

  it('never stores a network address, only a hash that changes every day', async () => {
    const store = new MapStore();
    const m = new Meter(store, limits);
    await m.reserve(INSTALL, 'u1', '203.0.113.7', now);
    expect(JSON.stringify([...store.map])).not.toContain('203.0.113.7');
    const ipKeys = () => [...store.map.keys()].filter((k) => k.startsWith('ip:'));
    expect(ipKeys()).toHaveLength(1);
    // The next day, the same address hashes differently (a new random key).
    const tomorrow = new Date(now.getTime() + 86_400_000);
    await m.reserve(INSTALL, 'u2', '203.0.113.7', tomorrow);
    const [k1, k2] = ipKeys().map((k) => k.split(':')[2]);
    expect(k1).not.toBe(k2);
  });

  it('pauses when the month reaches the budget', async () => {
    const m = new Meter(new MapStore(), limits);
    await m.spend(9.99, now);
    expect((await m.reserve(INSTALL, 'u1', 'ip', now)).ok).toBe(true);
    await m.spend(0.02, now);
    expect(await m.reserve(INSTALL, 'u2', 'ip', now)).toMatchObject({ ok: false, reason: 'budget' });
    expect(await m.spent(now)).toBeCloseTo(10.01);
  });

  it('gives a use back when the request failed before any work', async () => {
    const m = new Meter(new MapStore(), limits);
    await m.reserve(INSTALL, 'u1', 'ip', now);
    await m.refund(INSTALL, 'u1', now);
    expect((await m.allowance(INSTALL, now)).used).toBe(0);
  });

  it('knows when next month starts', () => {
    expect(nextMonth(new Date('2026-12-31T23:59:00Z'))).toBe('2027-01-01');
  });
});

describe('request handling', () => {
  const usage = { model: 'claude-haiku-5-5', tokens: { input: 10_000, output: 2_000, cacheRead: 0, cacheWrite: 0 } };
  function setup(over: Partial<Deps> = {}) {
    const meter = new Meter(new MapStore(), limits);
    const ran: string[] = [];
    const deps: Deps = {
      enabled: true,
      meter: {
        reserve: (i, u, ip) => meter.reserve(i, u, ip, now),
        refund: (i, u) => meter.refund(i, u, now),
        spend: (usd) => meter.spend(usd, now),
        allowance: (i) => meter.allowance(i, now),
        getNotes: (id) => meter.getNotes(id),
        putNotes: (id, n) => meter.putNotes(id, n),
      },
      run: async (task) => { ran.push(task); return { output: { note: 'Enjoy.', picks: [] }, usage }; },
      ...over,
    };
    return { meter, ran, deps };
  }
  const ask = (body: unknown, install = INSTALL) => new Request('https://ai.example/v1/ask', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-install-id': install, 'cf-connecting-ip': '1.2.3.4' }, body: JSON.stringify(body),
  });

  it('runs a known task and reports the allowance and cost', async () => {
    const { deps, meter, ran } = setup();
    const res = await handle(ask({ task: 'tonight', content: 'mood', use: 'u1' }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.json() as { output: unknown; allowance: { used: number } };
    expect(body.output).toEqual({ note: 'Enjoy.', picks: [] });
    expect(body.allowance.used).toBe(1);
    expect(ran).toEqual(['tonight']);
    expect(await meter.spent(now)).toBeCloseTo(0.002); // Haiku: 10K in, 2K out
  });

  it('refuses unknown tasks, bad installs, photos where not allowed, and when turned off', async () => {
    const { deps, ran } = setup();
    expect((await handle(ask({ task: 'write-my-essay', content: 'x' }), deps)).status).toBe(400);
    expect((await handle(ask({ task: 'tonight', content: 'x' }, 'nope'), deps)).status).toBe(400);
    const photo = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }];
    expect((await handle(ask({ task: 'notes', content: photo }), deps)).status).toBe(400);
    expect((await handle(ask({ task: 'tonight', content: 'x' }), { ...deps, enabled: false })).status).toBe(503);
    expect(ran).toEqual([]);
  });

  it('says when the monthly allowance is used up', async () => {
    const { deps } = setup();
    for (let i = 0; i < 3; i++) await handle(ask({ task: 'tonight', content: 'x', use: `u${i}` }), deps);
    const res = await handle(ask({ task: 'tonight', content: 'x', use: 'u9' }), deps);
    expect(res.status).toBe(429);
    expect((await res.json() as { error: string }).error).toMatch(/this month's 3 included AI uses\. They start again on December 1/);
  });

  it('gives the use back when the AI fails before doing any work', async () => {
    const { deps, meter } = setup({ run: async () => { throw new AiError(502, "Couldn't reach the AI."); } });
    const res = await handle(ask({ task: 'tonight', content: 'x', use: 'u1' }), deps);
    expect(res.status).toBe(502);
    expect((await meter.allowance(INSTALL, now)).used).toBe(0);
  });

  it("hides problems with the app's own key from users", async () => {
    const { deps } = setup({ run: async () => { throw new AiError(400, 'Your Anthropic API key was rejected. Check it in Settings.'); } });
    const res = await handle(ask({ task: 'tonight', content: 'x', use: 'u1' }), deps);
    expect(res.status).toBe(503);
    expect((await res.json() as { error: string }).error).not.toMatch(/Settings/);
  });

  it('answers the allowance', async () => {
    const { deps } = setup();
    const res = await handle(new Request('https://ai.example/v1/allowance', { headers: { 'x-install-id': INSTALL } }), deps);
    expect(await res.json()).toEqual({ used: 0, limit: 3, resetsOn: '2026-12-01' });
  });
});

describe('shared album notes', () => {
  const usage = { model: 'claude-haiku-5-5', tokens: { input: 2_000, output: 600, cacheRead: 0, cacheWrite: 0 } };
  const notes = { about: 'A warm 1973 soul album.', listenFor: ['The title track.'], thisPressing: 'A standard US pressing.', caveat: '' };
  const content = (id: number) => `<data>\n${JSON.stringify({ id, title: 'Drift Away' })}\n</data>`;
  function setup(enabled = true) {
    const meter = new Meter(new MapStore(), limits);
    let runs = 0;
    const deps: Deps = {
      enabled,
      meter: {
        reserve: (i, u, ip) => meter.reserve(i, u, ip, now), refund: (i, u) => meter.refund(i, u, now),
        spend: (usd) => meter.spend(usd, now), allowance: (i) => meter.allowance(i, now),
        getNotes: (id) => meter.getNotes(id), putNotes: (id, n) => meter.putNotes(id, n),
      },
      run: async () => { runs++; return { output: notes, usage }; },
    };
    return { deps, meter, runs: () => runs };
  }
  const req = (method: string, id: number, body?: unknown, install = INSTALL) => new Request(`https://ai.example/v1/notes/${id}`, {
    method, headers: { 'content-type': 'application/json', 'x-install-id': install }, body: body ? JSON.stringify(body) : undefined,
  });
  const OTHER = '11111111-2222-4333-8444-555555555555';

  it('writes notes once per pressing; everyone after gets them free', async () => {
    const { deps, meter, runs } = setup();
    expect((await handle(req('GET', 1869293), deps)).status).toBe(404);

    const first = await handle(req('POST', 1869293, { content: content(1869293), use: 'u1' }), deps);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ output: notes, shared: false, allowance: { used: 1 } });

    // Another user: the same notes, no AI request, no use counted.
    const second = await handle(req('POST', 1869293, { content: content(1869293), use: 'u2' }, OTHER), deps);
    expect(await second.json()).toEqual({ output: notes, shared: true });
    const got = await handle(req('GET', 1869293, undefined, OTHER), deps);
    expect(await got.json()).toEqual({ output: notes, shared: true });
    expect(runs()).toBe(1);
    expect((await meter.allowance(OTHER, now)).used).toBe(0);
  });

  it('refuses notes about a different pressing than the one they would be kept under', async () => {
    const { deps, runs } = setup();
    const res = await handle(req('POST', 1869293, { content: content(999), use: 'u1' }), deps);
    expect(res.status).toBe(400);
    expect(runs()).toBe(0);
  });

  it('still serves shared notes when new AI requests are turned off', async () => {
    const { deps, meter } = setup(false);
    await meter.putNotes(1869293, notes);
    expect((await handle(req('POST', 1869293, { content: content(1869293) }), deps)).status).toBe(200);
    expect((await handle(req('POST', 42, { content: content(42) }), deps)).status).toBe(503);
  });

  it('reads the release id from the notes content', () => {
    expect(notesReleaseId(content(1869293))).toBe(1869293);
    expect(notesReleaseId('no data')).toBeNull();
    expect(notesReleaseId('<data>not json</data>')).toBeNull();
  });
});

describe('task content checks', () => {
  it('allows photos only for identify, and limits sizes', () => {
    const img = (data = 'AAAA') => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    expect(checkContent('identify-read', [img(), { type: 'text', text: 'x' }])).toBeNull();
    expect(checkContent('notes', [img()])).toMatch(/Photos/);
    expect(checkContent('identify-read', [img(), img(), img(), img(), img()])).toMatch(/Too many/);
    expect(checkContent('notes', 'x'.repeat(500_000))).toMatch(/too large/);
    expect(checkContent('notes', [{ type: 'tool_use', id: 'x' }])).toMatch(/Bad request/);
    expect(Object.keys(TASKS)).toEqual(['identify-read', 'identify-match', 'recommend', 'review', 'notes', 'tonight']);
  });
});
