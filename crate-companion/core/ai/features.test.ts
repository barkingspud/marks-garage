import { describe, expect, it } from 'vitest';
import { CrateCore } from '../crate';
import { MockDiscogs } from '../discogs/mock';
import { fetchCollection, fetchWants, splitTitle } from '../services';
import { identify, norm, playTonight, recommendFor, reviewListings } from './features';
import type { Ask } from './llm';

/** A fake AI that returns the given answers in order. */
function scripted(...answers: unknown[]): Ask & { calls: number } {
  const f = (async () => {
    f.calls++;
    if (!answers.length) throw new Error('no more answers');
    return answers.shift();
  }) as unknown as Ask & { calls: number };
  f.calls = 0;
  return f;
}
const noop = () => undefined;

describe('AI features', () => {
  const api = new MockDiscogs();

  it('keeps only recommendations that exist on Discogs and that you do not own', async () => {
    const collection = await fetchCollection(api, 'demo');
    const wants = await fetchWants(api, 'demo');
    const ownedTitles = new Set(collection.map((i) => i.basic_information.title));
    const all = (await api.search({ type: 'master', per_page: 500 })).results.map((r) => splitTitle(r.title));
    const notOwned = all.find((t) => !ownedTitles.has(t.title) && !wants.some((w) => w.basic_information.title === t.title))!;
    const owned = collection[0]!.basic_information;
    const ask = scripted({
      intro: 'Here you go.',
      picks: [
        { artist: notOwned.artist, title: notOwned.title, year: null, why: 'Fits.' },
        { artist: 'Nobody', title: 'An Album That Does Not Exist', year: 1999, why: 'Invented.' },
        { artist: owned.artists[0]!.name, title: owned.title, year: null, why: 'Already owned.' },
      ],
    });
    const r = await recommendFor(ask, api, 'something mellow', collection, wants, noop);
    expect(r.picks.map((p) => p.title)).toEqual([notOwned.title]);
    expect(r.picks[0]!.masterId).toBeTruthy();
    expect(r.notFound).toEqual(['Nobody - An Album That Does Not Exist']);
  });

  it('identifies a pressing: searches Discogs for what the photo shows and keeps only a real candidate', async () => {
    const collection = await fetchCollection(api, 'demo');
    const b = collection[0]!.basic_information;
    const catno = b.labels[0]!.catno!;
    const ask = scripted(
      { isAlbum: true, artist: b.artists[0]!.name, title: b.title, label: null, catalogNumbers: [catno], barcode: null, runout: [`${catno}-A-1`] },
      { bestReleaseId: b.id, confidence: 'high', reasoning: 'The runout matches.', check: 'Check side B.' },
    );
    const r = await identify(ask, api, [{ data: 'AAAA', mediaType: 'image/jpeg' }], noop);
    expect(r.bestReleaseId).toBe(b.id);
    expect(r.candidates[0]!.id).toBe(b.id);
    expect(r.confidence).toBe('high');

    const made = scripted(
      { isAlbum: true, artist: b.artists[0]!.name, title: b.title, label: null, catalogNumbers: [catno], barcode: null, runout: [] },
      { bestReleaseId: 123456789, confidence: 'high', reasoning: 'Made up.', check: '' },
    );
    const r2 = await identify(made, api, [{ data: 'AAAA', mediaType: 'image/jpeg' }], noop);
    expect(r2.bestReleaseId).toBeNull();
    expect(r2.confidence).toBe('low');
  });

  it('stops early when the photo is not an album', async () => {
    const ask = scripted({ isAlbum: false, artist: null, title: null, label: null, catalogNumbers: [], barcode: null, runout: [] });
    const r = await identify(ask, api, [{ data: 'AAAA', mediaType: 'image/jpeg' }], noop);
    expect(ask.calls).toBe(1);
    expect(r.candidates).toEqual([]);
  });

  it('plays only albums you own', async () => {
    const collection = await fetchCollection(api, 'demo');
    const id = collection[2]!.basic_information.id;
    const r = await playTonight(scripted({ note: 'Enjoy.', picks: [{ releaseId: id, why: 'Mellow.' }, { releaseId: 999999999, why: 'Not yours.' }] }), '', collection);
    expect(r.picks.map((p) => p.releaseId)).toEqual([id]);
  });

  it('drops reviews of listings it was not given', async () => {
    const inv = await api.inventoryPage((await import('../discogs/mock')).SELLER_NAMES[0]!, 1);
    const l = inv.listings[0]!;
    const r = await reviewListings(scripted({ summary: 'One good one.', listings: [{ listingId: l.id, verdict: 'good', note: 'Fine.' }, { listingId: 1, verdict: 'great', note: 'Unknown.' }] }), [l]);
    expect(r.listings.map((x) => x.listingId)).toEqual([l.id]);
  });

  it('compares titles loosely', () => {
    expect(norm('The Dark Side Of The Moon')).toBe(norm('Dark Side of the Moon'));
    expect(norm('Simon & Garfunkel')).toBe(norm('Simon and Garfunkel'));
  });
});

describe('AI key in the core', () => {
  it('needs a key, checks it before saving, and can remove it', async () => {
    let checked = 0;
    const core = CrateCore.fromApi(new MockDiscogs(), undefined, undefined, () => ({ ask: scripted(), check: async () => { checked++; } }));
    expect((await core.aiStatus()).configured).toBe(false);
    await expect(core.aiTonight({})).rejects.toThrow(/Anthropic API key/);
    await expect(core.aiSetKey('not-a-key')).rejects.toThrow(/sk-ant-/);
    expect((await core.aiSetKey(' sk-ant-test ')).configured).toBe(true);
    expect(checked).toBe(1);
    expect((await core.aiRemoveKey()).configured).toBe(false);
  });
});
