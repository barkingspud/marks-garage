import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AiGate, Sparkle } from './Ai';
import { Cover } from './Cover';
import { ErrorBox, Loading } from './ui';

/** "What should I play tonight?": picks from your own shelves for a mood. */
export function Tonight() {
  const [mood, setMood] = useState('');
  const qc = useQueryClient();
  // Ask for different albums than the ones on screen.
  const pick = useMutation({
    mutationFn: (avoid: number[]) => api.ai.tonight(mood, avoid),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-allowance'] }),
  });
  return (
    <section className="glass panel tonight" aria-labelledby="h-tonight">
      <h2 id="h-tonight"><Sparkle />What should I play tonight?</h2>
      <AiGate what="pick albums from your shelves for your mood">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); pick.mutate(pick.data?.picks.map((p) => p.releaseId) ?? []); }}>
          <label className="field-glass">
            <span className="sr-only">Your mood</span>
            <input placeholder="Rainy Sunday, cooking dinner, friends over…" value={mood} onChange={(e) => setMood(e.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={pick.isPending}>{mood.trim() ? 'Pick for me' : 'Surprise me'}</button>
        </form>
        {pick.isPending && <Loading label="Looking through your shelves…" />}
        <ErrorBox error={pick.error} />
        {pick.data && (
          <>
            <p className="sub" style={{ margin: '12px 0' }}>{pick.data.note}</p>
            <ul className="ai-picks">
              {pick.data.picks.map((p) => (
                <li key={p.releaseId}>
                  <Link to={`/record/${p.releaseId}`} className="ai-pick">
                    <Cover src={p.thumb} id={p.releaseId} />
                    <span><b>{p.title}</b><small>{p.artist}{p.year ? `, ${p.year}` : ''}</small><span className="why">{p.why}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </AiGate>
    </section>
  );
}
