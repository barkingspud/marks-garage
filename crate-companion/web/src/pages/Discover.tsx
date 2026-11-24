import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { AiRecommendResult } from '../../../shared/ai-types';
import type { RecommendResult } from '../../../shared/api-types';
import { api } from '../api';
import { AiGate, Sparkle } from '../components/Ai';
import { Cover } from '../components/Cover';
import { DiscProgress, ErrorBox, PageHeader, ScoreRing, discogsUrl } from '../components/ui';
import { useRoom } from '../room';
import { whenText } from '../storage';
import { useJob } from '../useJob';

type Ids = { masterId?: number; releaseId?: number };
const key = (r: Ids) => (r.masterId ? `m${r.masterId}` : `r${r.releaseId}`);
const link = (r: Ids) => (r.masterId ? discogsUrl('master', r.masterId) : discogsUrl('release', r.releaseId!));

export function Discover() {
  const { result, finishedAt, progress, error, running, start } = useJob<RecommendResult>('recommend');
  const qc = useQueryClient();
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const add = useMutation({
    mutationFn: (r: Ids) => api.addWant({ releaseId: r.releaseId, masterId: r.masterId }),
    onSuccess: (_d, r) => { setJustAdded((s) => new Set(s).add(key(r))); void qc.invalidateQueries({ queryKey: ['wants'] }); },
  });
  // Picks are kept between visits, so check the wantlist too, not only what was added just now.
  const added = useMemo(() => {
    const s = new Set(justAdded);
    for (const w of wants.data?.items ?? []) { s.add(`r${w.id}`); if (w.basic_information.master_id) s.add(`m${w.basic_information.master_id}`); }
    return { has: (k: string) => s.has(k) };
  }, [justAdded, wants.data]);
  const [top, ...rest] = result?.recommendations ?? [];
  useRoom(top?.thumb ?? null, 32);

  const taste = result ? [
    ...result.profile.topStyles.slice(0, 3).map(([s]) => s),
    ...result.profile.topDecades.slice(0, 1).map(([d]) => `The ${d}s`),
    ...result.profile.topArtists.slice(0, 2).map((a) => a.name),
  ] : [];

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader title="Picked for you" sub={result ? `From the ${result.profile.total.toLocaleString()} albums you own${finishedAt ? `, picked ${whenText(finishedAt)}` : ''}` : 'Albums you don’t own yet, chosen from the artists, labels and styles you collect.'}>
        {!running && <button className="btn primary" onClick={() => start()}>{result ? 'Pick again' : 'Find albums for me'}</button>}
      </PageHeader>
      <AskBox added={added} add={add} />
      {progress && <section className="glass panel"><DiscProgress {...progress} /></section>}
      <ErrorBox error={error ?? add.error} />

      {result && !running && (
        <>
          <div className="chip-row" role="list" aria-label="Your taste">
            {taste.map((t) => <span role="listitem" key={t} className="chip static">{t}</span>)}
          </div>
          {top && (
            <article className="pick-feature glass">
              <Cover src={top.thumb} id={top.masterId ?? top.releaseId ?? 0} alt={`Cover of ${top.title}`} />
              <div className="pick-feature-text">
                <ScoreRing value={top.score} size={64} />
                <h2><a href={link(top)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{top.title}</a></h2>
                <span className="sub" style={{ fontSize: 17 }}>{top.artist}{top.year ? `, ${top.year}` : ''}</span>
                <p>{top.reasons.slice(0, 2).map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join('. ')}.</p>
                <div className="page-actions">
                  <button className="btn primary" disabled={added.has(key(top)) || add.isPending} onClick={() => add.mutate(top)}>
                    {added.has(key(top)) ? 'On your wantlist' : 'Add to wantlist'}
                  </button>
                </div>
              </div>
            </article>
          )}
          <section aria-labelledby="h-more">
            <h2 id="h-more" style={{ margin: '4px 0 12px 4px' }}>More picks</h2>
            <ul className="rows glass">
              {rest.map((r) => (
                <li key={key(r)} className="row">
                  <Cover src={r.thumb} id={r.masterId ?? r.releaseId ?? 0} />
                  <span className="row-main">
                    <a href={link(r)} target="_blank" rel="noreferrer"><b>{r.title}</b></a>
                    <span>{r.artist}{r.year ? `, ${r.year}` : ''}</span>
                    <span className="small">{r.reasons[0]}</span>
                  </span>
                  <span className="amber" style={{ fontSize: 20 }} aria-label={`Match score ${r.score}`}>{r.score}</span>
                  <button className="btn icon" disabled={added.has(key(r)) || add.isPending} onClick={() => add.mutate(r)}
                    aria-label={added.has(key(r)) ? `${r.title} is on your wantlist` : `Add ${r.title} to wantlist`}>
                    <svg viewBox="0 0 24 24" aria-hidden><path d={added.has(key(r)) ? 'M5 12l4 4 10-10' : 'M12 5v14M5 12h14'} /></svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

/** Ask for albums in your own words; the AI suggests, Discogs confirms each one exists. */
function AskBox({ added, add }: {
  added: { has: (k: string) => boolean };
  add: { mutate: (r: Ids) => void; isPending: boolean };
}) {
  const ai = useJob<AiRecommendResult>('ai-recommend');
  const [text, setText] = useState('');
  const r = ai.result;
  return (
    <section className="glass panel ask" aria-labelledby="h-ask">
      <h2 id="h-ask"><Sparkle />Ask for something specific</h2>
      <AiGate what="find albums from a request in your own words">
        <form className="ask-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void ai.start({ request: text }); }}>
          <label className="field-glass">
            <span className="sr-only">What are you looking for?</span>
            <textarea rows={2} placeholder="Like Crime of the Century but jazzier. 70s soul I don’t own. Something for a late night drive…" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={!text.trim() || ai.running}>Ask</button>
        </form>
        {ai.progress && <DiscProgress {...ai.progress} />}
        <ErrorBox error={ai.error} />
        {r && !ai.running && (
          <div className="ask-result">
            <p className="sub"><b>“{r.request}”</b>{ai.finishedAt ? `, asked ${whenText(ai.finishedAt)}` : ''}. {r.intro}</p>
            <ul className="rows">
              {r.picks.map((p) => (
                <li key={key(p)} className="row">
                  <Cover src={p.thumb} id={p.masterId ?? p.releaseId ?? 0} />
                  <span className="row-main">
                    <a href={link(p)} target="_blank" rel="noreferrer"><b>{p.title}</b></a>
                    <span>{p.artist}{p.year ? `, ${p.year}` : ''}</span>
                    <span className="small why">{p.why}</span>
                  </span>
                  <button className="btn icon" disabled={added.has(key(p)) || add.isPending} onClick={() => add.mutate(p)}
                    aria-label={added.has(key(p)) ? `${p.title} is on your wantlist` : `Add ${p.title} to wantlist`}>
                    <svg viewBox="0 0 24 24" aria-hidden><path d={added.has(key(p)) ? 'M5 12l4 4 10-10' : 'M12 5v14M5 12h14'} /></svg>
                  </button>
                </li>
              ))}
            </ul>
            {!r.picks.length && <p className="sub">Nothing new turned up. Try wording it differently.</p>}
            {r.notFound.length > 0 && <p className="sub small">Left out because Discogs doesn’t list them: {r.notFound.join('; ')}.</p>}
          </div>
        )}
      </AiGate>
    </section>
  );
}
