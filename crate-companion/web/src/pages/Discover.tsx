import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { RecommendResult } from '../../../shared/api-types';
import type { Recommendation } from '../../../shared/recommend';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { ErrorBox, PageHeader, Progress, Score, discogsUrl } from '../components/ui';
import { useJob } from '../useJob';

export function Discover() {
  const { job, error, running, start } = useJob<RecommendResult>('recommend');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const add = useMutation({
    mutationFn: (r: Recommendation) => api.addWant({ releaseId: r.releaseId, masterId: r.masterId }),
    onSuccess: (_d, r) => setAdded((s) => new Set(s).add(key(r))),
  });
  const result = job?.status === 'done' ? job.result : undefined;

  return (
    <>
      <PageHeader title="Discover" sub="Recommendations from the artists, labels and styles you collect most.">
        <button className="primary" onClick={() => start()} disabled={running}>
          {running ? 'Digging…' : result ? 'Refresh' : 'Get recommendations'}
        </button>
      </PageHeader>
      {running && job && <Progress {...job.progress} />}
      <ErrorBox error={error ?? add.error} />

      {result && (
        <>
          <section className="card taste">
            <h3>Your taste profile <span className="muted small">({result.profile.total} releases)</span></h3>
            <div className="taste-grid">
              <TasteList title="Artists" items={result.profile.topArtists.map((a) => [a.name, a.weight])} />
              <TasteList title="Styles" items={result.profile.topStyles} />
              <TasteList title="Labels" items={result.profile.topLabels.map((l) => [l.name, l.weight])} />
              <TasteList title="Decades" items={result.profile.topDecades.map(([d, w]) => [`${d}s`, w])} />
            </div>
          </section>
          <ul className="list">
            {result.recommendations.map((r) => (
              <li key={key(r)} className="row">
                <Cover src={r.thumb} id={r.masterId ?? r.releaseId ?? 0} />
                <div className="row-main">
                  <a className="row-title" target="_blank" rel="noreferrer"
                    href={r.masterId ? discogsUrl('master', r.masterId) : discogsUrl('release', r.releaseId!)}>{r.title}</a>
                  <div>{r.artist}{r.year ? <span className="muted"> · {r.year}</span> : null}</div>
                  <div className="chips">{r.reasons.map((x) => <span key={x} className="chip">{x}</span>)}</div>
                </div>
                <div className="row-side">
                  <Score value={r.score} />
                  <button className="small" disabled={added.has(key(r)) || add.isPending} onClick={() => add.mutate(r)}>
                    {added.has(key(r)) ? 'Added ✓' : '+ Want'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

const key = (r: Recommendation) => (r.masterId ? `m${r.masterId}` : `r${r.releaseId}`);

function TasteList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div>
      <div className="muted small">{title}</div>
      <ol>{items.map(([n, w]) => <li key={n}>{n} <span className="muted small">{Math.round(w)}</span></li>)}</ol>
    </div>
  );
}
