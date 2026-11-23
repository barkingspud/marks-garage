import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { CrateCore } from '../core/crate';
import { MockDiscogs } from '../core/discogs/mock';

describe('app routes for the redesign', () => {
  const app = createApp(CrateCore.fromApi(new MockDiscogs()));

  it('only passes through Discogs images', async () => {
    expect((await app.request('/api/img?u=' + encodeURIComponent('https://example.com/a.jpg'))).status).toBe(400);
    expect((await app.request('/api/img?u=' + encodeURIComponent('http://i.discogs.com/a.jpg'))).status).toBe(400);
    expect((await app.request('/api/img?u=not-a-url')).status).toBe(400);
  });

  it('returns collection custom fields', async () => {
    const r = await (await app.request('/api/collection/fields')).json() as { fields: { name: string }[] };
    expect(r.fields.map((f) => f.name)).toContain('Media Condition');
  });

  it('searches releases for Record Check and needs something to search for', async () => {
    expect((await app.request('/api/search/releases')).status).toBe(400);
    const r = await (await app.request('/api/search/releases?q=Ines')).json() as { results: { type: string }[] };
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => x.type === 'release')).toBe(true);
  });

  it('adds a bought record to the collection and drops it from the wantlist', async () => {
    const wants = await (await app.request('/api/wants')).json() as { items: { id: number }[] };
    const id = wants.items[0]!.id;
    const res = await app.request('/api/collection', { method: 'POST', body: JSON.stringify({ releaseId: id, removeFromWants: true }), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(200);
    const coll = await (await app.request('/api/collection')).json() as { items: { id: number }[] };
    const after = await (await app.request('/api/wants')).json() as { items: { id: number }[] };
    expect(coll.items.some((i) => i.id === id)).toBe(true);
    expect(after.items.some((w) => w.id === id)).toBe(false);
  });
});
