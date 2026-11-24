import { describe, expect, it } from 'vitest';
import { CrateCore } from '../crate';
import { MockDiscogs } from '../discogs/mock';
import { fetchCollection, fetchWants, splitTitle } from '../services';
import { identify, norm, playTonight, recommendFor, reviewListings } from './features';
import { costOf } from '../../shared/ai-models';
import { MemoryStore } from '../auth/store';
import { AiError, type AiBackend, type Ask } from './llm';

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
    const core = CrateCore.fromApi(new MockDiscogs(), undefined, undefined, () => ({ ask: async () => { throw new Error('unused'); }, check: async () => { checked++; } }));
    expect((await core.aiStatus()).configured).toBe(false);
    await expect(core.aiTonight({})).rejects.toThrow(/Anthropic API key/);
    await expect(core.aiSetKey('not-a-key')).rejects.toThrow(/sk-ant-/);
    expect((await core.aiSetKey(' sk-ant-test ')).configured).toBe(true);
    expect(checked).toBe(1);
    expect((await core.aiRemoveKey()).configured).toBe(false);
  });
});

describe('AI model and costs', () => {
  const tokens = (input: number, output: number) => ({ input, output, cacheRead: 0, cacheWrite: 0 });

  it('prices requests from the list prices', () => {
    // Opus 5.5: $4 in, $20 out per million tokens.
    expect(costOf('claude-opus-5-5', tokens(1_000_000, 0))).toBeCloseTo(4);
    expect(costOf('claude-opus-5-5', tokens(10_000, 2_000))).toBeCloseTo(0.08);
    // Haiku 5.5: $0.10 / $0.50, and $0.50 / $2.50 for prompts over 100K tokens.
    expect(costOf('claude-haiku-5-5', tokens(10_000, 2_000))).toBeCloseTo(0.002);
    expect(costOf('claude-haiku-5-5', tokens(200_000, 0))).toBeCloseTo(0.1);
    expect(costOf('some-other-model', tokens(1000, 1000))).toBe(0);
  });

  it('uses Haiku by default, lets you choose, and logs what each use cost', async () => {
    const asked: string[] = [];
    let answer: () => unknown = () => ({ note: 'Enjoy.', picks: [] });
    const backend: AiBackend = {
      check: async () => undefined,
      ask: async (_o, model) => {
        asked.push(model);
        return { output: answer() as never, usage: { model, tokens: tokens(10_000, 2_000) } };
      },
    };
    const core = CrateCore.fromApi(new MockDiscogs(), undefined, new MemoryStore(), () => backend);
    await core.aiSetKey('sk-ant-test');
    expect((await core.aiStatus()).model).toBe('claude-haiku-5-5');

    await core.aiTonight({});
    expect((await core.aiSetModel('claude-opus-5-5')).model).toBe('claude-opus-5-5');
    await core.aiTonight({});
    await expect(core.aiSetModel('gpt-5')).rejects.toThrow(/Unknown model/);
    expect(asked).toEqual(['claude-haiku-5-5', 'claude-opus-5-5']);

    // A declined answer is still billed, so it's still logged.
    answer = () => { throw new AiError(422, 'declined', { model: 'claude-opus-5-5', tokens: tokens(10_000, 2_000) }); };
    await expect(core.aiTonight({})).rejects.toThrow(/declined/);

    const u = await core.aiUsage();
    expect(u.total.uses).toBe(3);
    expect(u.thisMonth.uses).toBe(3);
    expect(u.total.cost).toBeCloseTo(0.002 + 0.08 + 0.08);
    expect(u.groups.map((g) => [g.feature, g.model, g.uses])).toEqual([
      ['tonight', 'claude-haiku-5-5', 1],
      ['tonight', 'claude-opus-5-5', 2],
    ]);
    expect(u.recent[0]?.model).toBe('claude-opus-5-5');

    expect((await core.aiClearUsage()).total.uses).toBe(0);
  });

  it('adds up every request in one use', async () => {
    let n = 0;
    const backend: AiBackend = {
      check: async () => undefined,
      ask: async (_o, model) => {
        n++;
        // The first answer reads the photo; the second picks among Discogs matches.
        const output = n === 1
          ? { seen: { artist: 'Nobody', title: 'Nothing', label: null, catalogNumbers: [], barcode: null, runout: [] }, confidence: 'low', notes: '' }
          : { releaseId: null, confidence: 'low', reason: 'No match.' };
        return { output: output as never, usage: { model, tokens: tokens(1_000, 1_000) } };
      },
    };
    const core = CrateCore.fromApi(new MockDiscogs(), undefined, new MemoryStore(), () => backend);
    await core.aiSetKey('sk-ant-test');
    const { id } = await core.aiIdentify({ photos: [{ mediaType: 'image/jpeg', data: 'AAAA' }] });
    for (let i = 0; i < 50 && core.job(id).status === 'running'; i++) await new Promise((r) => setTimeout(r, 10));
    const u = await core.aiUsage();
    expect(u.total.uses).toBe(1);
    expect(u.recent[0]?.requests).toBe(n);
    expect(u.recent[0]?.cost).toBeCloseTo(n * costOf('claude-haiku-5-5', tokens(1_000, 1_000)));
  });
});
