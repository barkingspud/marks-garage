import { useState } from 'react';
import { GRADE_LABELS, MEDIA_GRADES, parseGrade, type Grade } from '../../../shared/conditions';
import { buyerPrice, DEFAULT_CRITERIA, type MatchCriteria } from '../../../shared/matching';
import type { MatchResult } from '../../../shared/api-types';
import { Cover } from '../components/Cover';
import { DiscProgress, Empty, ErrorBox, GradeChip, PageHeader, money } from '../components/ui';
import { useRoom } from '../room';
import { load, save, whenText } from '../storage';
import { useJob } from '../useJob';

interface Saved { sellers: string[]; criteria: MatchCriteria; maxPages: number }

export function Match() {
  const [cfg, setCfg] = useState<Saved>(() => load('match', { sellers: [], criteria: DEFAULT_CRITERIA, maxPages: 10 }));
  const [newSeller, setNewSeller] = useState('');
  // Keep the raw text so commas can be typed; the parsed list goes into the criteria.
  const [shipsText, setShipsText] = useState(() => cfg.criteria.shipsFrom.join(', '));
  const [editing, setEditing] = useState(false);
  const { result, finishedAt, progress, error, running, start } = useJob<MatchResult>('match');
  useRoom(null, 268);

  const update = (patch: Partial<Saved>) => setCfg((c) => { const n = { ...c, ...patch }; save('match', n); return n; });
  const setCrit = (patch: Partial<MatchCriteria>) => update({ criteria: { ...cfg.criteria, ...patch } });
  function addSellers() {
    const names = newSeller.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    update({ sellers: [...new Set([...cfg.sellers, ...names])] });
    setNewSeller('');
  }
  const run = () => { setEditing(false); void start({ sellers: cfg.sellers, criteria: cfg.criteria, maxPagesPerSeller: cfg.maxPages }); };

  const showSetup = !running && (!result || editing);
  const c = cfg.criteria;
  const rules = [
    `record ${c.minMedia} or better`,
    c.minSleeve === 'any' ? 'any sleeve' : `sleeve ${c.minSleeve} or better`,
    c.shipsFrom.length ? `shipping from ${c.shipsFrom.join(' or ')}` : 'shipping from anywhere',
    `sellers rated ${c.minSellerRating}% or more`,
    ...(c.maxPrice !== null ? [`up to ${c.maxPrice}`] : []),
  ];

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHeader
        title="Sellers"
        sub={result && !editing ? `${new Set(result.matches.map((m) => m.listing.release.id)).size} of your ${result.wantsCount} wants found in ${result.sellers.filter((s) => !s.error).length} shop${result.sellers.length === 1 ? '' : 's'}${finishedAt ? `, scanned ${whenText(finishedAt)}` : ''}` : 'Look for your wants in the shops you trust.'}
      >
        {result && !editing && !running && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>Edit shops and rules</button>
            <button className="btn primary" onClick={run}>Scan again</button>
          </>
        )}
      </PageHeader>

      {showSetup && (
        <>
          <section className="glass panel" aria-labelledby="h-shops">
            <h2 id="h-shops">Shops to scan</h2>
            <form className="toolbar" onSubmit={(e) => { e.preventDefault(); addSellers(); }}>
              <label className="field-glass">
                <span className="sr-only">Seller usernames</span>
                <input placeholder="Seller username(s) on Discogs" value={newSeller} onChange={(e) => setNewSeller(e.target.value)} />
              </label>
              <button type="submit" className="btn" disabled={!newSeller.trim()}>Add</button>
            </form>
            <div className="chip-row" style={{ marginTop: 12 }}>
              {cfg.sellers.map((s) => (
                <span key={s} className="chip static">{s}<button className="chip-x" aria-label={`Remove ${s}`} onClick={() => update({ sellers: cfg.sellers.filter((x) => x !== s) })}>×</button></span>
              ))}
              {!cfg.sellers.length && <span className="sub">No shops yet. Sellers you've bought from before are a good start.</span>}
            </div>
            <label className="field" style={{ marginTop: 14, maxWidth: 320 }}>
              Pages per shop (100 newest listings each)
              <input className="input" type="number" min={1} max={100} value={cfg.maxPages} onChange={(e) => update({ maxPages: Number(e.target.value) || 1 })} />
            </label>
          </section>

          <section className="glass panel" aria-labelledby="h-rules">
            <h2 id="h-rules">Your rules</h2>
            <div className="form-grid">
              <label className="field">Record grade at least<GradeSelect value={c.minMedia} onChange={(g) => setCrit({ minMedia: g as Grade })} /></label>
              <label className="field">Sleeve grade at least<GradeSelect value={c.minSleeve} allowAny onChange={(g) => setCrit({ minSleeve: g })} /></label>
              <label className="field">Seller rating at least (%)<input className="input" type="number" step="0.1" min={0} max={100} value={c.minSellerRating} onChange={(e) => setCrit({ minSellerRating: Number(e.target.value) })} /></label>
              <label className="field">Seller ratings at least<input className="input" type="number" min={0} value={c.minSellerRatings} onChange={(e) => setCrit({ minSellerRatings: Number(e.target.value) })} /></label>
              <label className="field">Max price (your currency)<input className="input" type="number" min={0} placeholder="No limit" value={c.maxPrice ?? ''} onChange={(e) => setCrit({ maxPrice: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="field">Ships from (blank for anywhere)<input className="input" placeholder="e.g. US, Canada" value={shipsText} onChange={(e) => { setShipsText(e.target.value); setCrit({ shipsFrom: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }); }} /></label>
            </div>
            <label className="check" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={c.allowUngradedSleeve} onChange={(e) => setCrit({ allowUngradedSleeve: e.target.checked })} />
              Accept generic and ungraded sleeves
            </label>
          </section>

          <div className="page-actions">
            <button className="btn primary" disabled={!cfg.sellers.length} onClick={run}>Find my wants for sale</button>
            {result && <button className="btn" onClick={() => setEditing(false)}>Back to results</button>}
          </div>
        </>
      )}

      {progress && (
        <section className="glass panel">
          <DiscProgress {...progress} />
          <p className="sub" style={{ textAlign: 'center' }}>Keeping copies with {rules.join(', ')}.</p>
        </section>
      )}
      <ErrorBox error={error} />

      {result && !editing && !running && (
        <>
          <div className="shops">
            {result.sellers.map((s) => (
              <div key={s.username} className="shop glass">
                <b>{s.username}</b>
                {s.error ? <span className="bad">{s.error}</span> : (
                  <>
                    {s.rating !== undefined && <span>{s.rating}% from {(s.ratings ?? 0).toLocaleString()} ratings</span>}
                    <span className={s.truncated ? 'warn' : undefined}>
                      {s.matches} match{s.matches === 1 ? '' : 'es'}, {s.truncated ? `newest ${s.scanned.toLocaleString()} of ${s.totalListings.toLocaleString()} listings scanned` : 'whole shop scanned'}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
          {!result.matches.length && <Empty title="Nothing on your wantlist in these shops right now">Try more pages per shop, more shops, or looser rules.</Empty>}
          <ol className="matches">
            {result.matches.map(({ listing: l, score, reasons }, i) => {
              const p = buyerPrice(l);
              const ship = l.shipping_price && l.shipping_price.currency === p.currency ? l.shipping_price.value : null;
              return (
                <li key={l.id} className="match glass">
                  <div className="match-top">
                    <span className="match-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                    <Cover src={l.release.thumbnail} id={l.release.id} />
                    <div className="match-title">
                      <a href={l.uri} target="_blank" rel="noreferrer">{l.release.description}</a>
                      <div className="chip-row" style={{ gap: 6 }}>
                        <GradeChip label="Record" grade={parseGrade(l.condition)} />
                        <GradeChip label="Sleeve" grade={parseGrade(l.sleeve_condition)} />
                      </div>
                    </div>
                    <div className="match-score"><b>{score}</b><span>out of 100</span></div>
                  </div>
                  <div className="match-foot">
                    <span>
                      <b>{l.seller.username}</b>, {l.seller.stats?.rating}% from {Number(l.seller.stats?.total ?? 0).toLocaleString()} ratings<br />
                      Ships from {l.ships_from}{l.allow_offers ? ', accepts offers' : ''}{reasons.length ? <><br />{reasons.join(', ')}</> : null}
                    </span>
                    <span className="match-price">
                      <b>{money(p.value, p.currency)}</b>
                      {ship !== null && <span>{money(p.value + ship, p.currency)} with shipping</span>}
                      {p.currency !== l.price.currency && <span>{money(l.price.value, l.price.currency)} in the seller's currency</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function GradeSelect({ value, onChange, allowAny }: { value: string; onChange: (v: Grade | 'any') => void; allowAny?: boolean }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as Grade | 'any')}>
      {allowAny && <option value="any">Any, or ignore the sleeve</option>}
      {MEDIA_GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
    </select>
  );
}
