import { useState } from 'react';
import { GRADE_LABELS, MEDIA_GRADES, type Grade } from '../../../shared/conditions';
import { DEFAULT_CRITERIA, type MatchCriteria } from '../../../shared/matching';
import type { MatchResult } from '../../../shared/api-types';
import { Cover } from '../components/Cover';
import { ErrorBox, PageHeader, Progress, Score } from '../components/ui';
import { load, save } from '../storage';
import { useJob } from '../useJob';

interface Saved { sellers: string[]; criteria: MatchCriteria; maxPages: number }

export function Match() {
  const [cfg, setCfg] = useState<Saved>(() => load('match', { sellers: [], criteria: DEFAULT_CRITERIA, maxPages: 10 }));
  const [newSeller, setNewSeller] = useState('');
  const { job, error, running, start } = useJob<MatchResult>('match');

  const update = (patch: Partial<Saved>) => setCfg((c) => { const n = { ...c, ...patch }; save('match', n); return n; });
  const setCrit = (patch: Partial<MatchCriteria>) => update({ criteria: { ...cfg.criteria, ...patch } });

  function addSellers() {
    const names = newSeller.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    update({ sellers: [...new Set([...cfg.sellers, ...names])] });
    setNewSeller('');
  }

  const result = job?.status === 'done' ? job.result : undefined;

  return (
    <>
      <PageHeader
        title="Match wants to sellers"
        sub="Discogs' API can't search every listing for a release, so add the sellers you like and we'll scan their shops against your wantlist."
      />
      <div className="grid-2">
        <section className="card">
          <h3>Sellers to scan</h3>
          <form className="inline" onSubmit={(e) => { e.preventDefault(); addSellers(); }}>
            <input placeholder="seller username(s)" value={newSeller} onChange={(e) => setNewSeller(e.target.value)} />
            <button type="submit" disabled={!newSeller.trim()}>Add</button>
          </form>
          <div className="chips">
            {cfg.sellers.map((s) => (
              <span key={s} className="chip">
                {s} <button className="chip-x" aria-label={`Remove ${s}`} onClick={() => update({ sellers: cfg.sellers.filter((x) => x !== s) })}>×</button>
              </span>
            ))}
            {!cfg.sellers.length && <span className="muted small">No sellers yet. Tip: sellers you've bought from before are a good start.</span>}
          </div>
          <label className="field">
            Pages per seller <span className="muted small">(100 listings each, ~1s per page)</span>
            <input type="number" min={1} max={100} value={cfg.maxPages} onChange={(e) => update({ maxPages: Number(e.target.value) || 1 })} />
          </label>
        </section>

        <section className="card">
          <h3>Criteria</h3>
          <div className="form-grid">
            <label className="field">Min media
              <GradeSelect value={cfg.criteria.minMedia} onChange={(g) => setCrit({ minMedia: g as Grade })} />
            </label>
            <label className="field">Min sleeve
              <GradeSelect value={cfg.criteria.minSleeve} allowAny onChange={(g) => setCrit({ minSleeve: g })} />
            </label>
            <label className="field">Min seller rating %
              <input type="number" step="0.1" min={0} max={100} value={cfg.criteria.minSellerRating} onChange={(e) => setCrit({ minSellerRating: Number(e.target.value) })} />
            </label>
            <label className="field">Min # of ratings
              <input type="number" min={0} value={cfg.criteria.minSellerRatings} onChange={(e) => setCrit({ minSellerRatings: Number(e.target.value) })} />
            </label>
            <label className="field">Max price
              <input type="number" min={0} placeholder="no limit" value={cfg.criteria.maxPrice ?? ''} onChange={(e) => setCrit({ maxPrice: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="field">Ships from <span className="muted small">(comma-separated)</span>
              <input placeholder="any" value={cfg.criteria.shipsFrom.join(', ')} onChange={(e) => setCrit({ shipsFrom: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={cfg.criteria.allowUngradedSleeve} onChange={(e) => setCrit({ allowUngradedSleeve: e.target.checked })} />
            Accept generic / ungraded sleeves
          </label>
        </section>
      </div>

      <div className="run-bar">
        <button className="primary" disabled={running || !cfg.sellers.length}
          onClick={() => start({ sellers: cfg.sellers, criteria: cfg.criteria, maxPagesPerSeller: cfg.maxPages })}>
          {running ? 'Scanning…' : 'Find matches'}
        </button>
        {running && job && <Progress {...job.progress} />}
      </div>
      <ErrorBox error={error} />

      {result && (
        <>
          <section className="seller-summary">
            {result.sellers.map((s) => (
              <div key={s.username} className="card small">
                <b>{s.username}</b>
                {s.error ? <div className="error-text">{s.error}</div> : (
                  <div className="muted">
                    {s.matches} match{s.matches === 1 ? '' : 'es'} · scanned {s.scanned}/{s.totalListings}
                    {s.truncated && ' (raise pages to scan more)'}
                    {s.rating !== undefined && <> · {s.rating}% ({s.ratings})</>}
                  </div>
                )}
              </div>
            ))}
          </section>
          <h2>{result.matches.length} listing{result.matches.length === 1 ? '' : 's'} match your rules <span className="muted small">(wantlist: {result.wantsCount})</span></h2>
          <ul className="list">
            {result.matches.map(({ listing: l, score, reasons }) => (
              <li key={l.id} className="row">
                <Cover src={l.release.thumb} id={l.release.id} />
                <div className="row-main">
                  <a href={l.uri} target="_blank" rel="noreferrer" className="row-title">{l.release.description}</a>
                  <div className="small">Media <b>{l.condition}</b> · Sleeve <b>{l.sleeve_condition}</b></div>
                  <div className="muted small">{l.seller.username} ({l.seller.stats?.rating}%, {l.seller.stats?.total}) · ships from {l.ships_from}{l.allow_offers ? ' · accepts offers' : ''}</div>
                  <div className="chips">{reasons.map((r) => <span key={r} className="chip chip-good">{r}</span>)}</div>
                </div>
                <div className="row-side">
                  <div className="price">{l.price.value.toFixed(2)} <span className="muted small">{l.price.currency}</span></div>
                  <Score value={score} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function GradeSelect({ value, onChange, allowAny }: { value: string; onChange: (v: Grade | 'any') => void; allowAny?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Grade | 'any')}>
      {allowAny && <option value="any">Any / ignore</option>}
      {MEDIA_GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
    </select>
  );
}
