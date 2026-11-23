import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { RecordHero } from '../components/RecordHero';
import { Empty, ErrorBox, GradeMeter, Loading, artistLine, discogsUrl, formatLine, money } from '../components/ui';
import { myGrades } from '../grades';
import { useRoom } from '../room';

/** One record: yours (grades, catalog details) or wanted (what it costs right now). */
export function Record() {
  const id = Number(useParams().releaseId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coll = useQuery({ queryKey: ['collection', 0], queryFn: () => api.collection(0) });
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const fields = useQuery({ queryKey: ['fields'], queryFn: api.fields });

  const owned = coll.data?.items.find((i) => i.id === id);
  const wanted = wants.data?.items.find((w) => w.id === id);
  const b = owned?.basic_information ?? wanted?.basic_information;
  const stats = useQuery({ queryKey: ['stats', id], queryFn: () => api.stats(id), enabled: !!wanted && !owned });
  const remove = useMutation({
    mutationFn: () => api.removeWant(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wants'] }); navigate('/wantlist'); },
  });
  useRoom(b ? b.cover_image || b.thumb : null);

  if (coll.isLoading || wants.isLoading) return <Loading />;
  if (!b) {
    return (
      <div className="page">
        <button className="btn back" onClick={() => navigate(-1)}>Back</button>
        <Empty title="This record isn't in your collection or wantlist">
          <a href={discogsUrl('release', id)} target="_blank" rel="noreferrer">See it on Discogs</a>
        </Empty>
      </div>
    );
  }
  const g = myGrades(owned, fields.data?.fields);
  const label = b.labels[0];

  return (
    <div className="page">
      <button className="btn back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>Back
      </button>
      <div className="detail">
        <RecordHero src={b.cover_image || b.thumb} id={b.id} artist={artistLine(b)} title={b.title} label={label?.name} />
        <div className="detail-info">
          <div>
            <h1>{b.title}</h1>
            <p className="sub" style={{ fontSize: 19, marginTop: 8 }}>{artistLine(b)}{b.year ? `, ${b.year}` : ''}</p>
          </div>
          {owned ? (
            <span className="owned-pill glass">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12l4 4 10-10" /></svg>
              In your collection since {new Date(owned.date_added).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : (
            <span className="owned-pill glass" style={{ color: 'var(--amber)' }}>On your wantlist</span>
          )}

          {owned && (
            <section className="glass panel" aria-labelledby="h-copy">
              <h2 id="h-copy">Your copy</h2>
              {g.media || g.sleeve ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {g.media && <GradeMeter label="Record" grade={g.media.grade} text={g.media.text} />}
                  {g.sleeve && <GradeMeter label="Sleeve" grade={g.sleeve.grade} text={g.sleeve.text} />}
                </div>
              ) : (
                <p className="sub">No grades yet. Add them in your collection on Discogs (Media and Sleeve Condition) and they'll show here.</p>
              )}
            </section>
          )}

          {wanted && !owned && (
            <section className="glass panel" aria-labelledby="h-market">
              <h2 id="h-market">On the Discogs marketplace</h2>
              {stats.isLoading && <Loading label="Checking prices…" />}
              <ErrorBox error={stats.error} />
              {stats.data && (stats.data.num_for_sale && stats.data.lowest_price ? (
                <div className="verdict">
                  <b>{money(stats.data.lowest_price.value, stats.data.lowest_price.currency)}</b>
                  <span>cheapest of {stats.data.num_for_sale} for sale</span>
                </div>
              ) : <p className="sub">None for sale right now.</p>)}
            </section>
          )}

          <dl className="facts">
            {label && <div><dt>Label</dt><dd>{label.name}</dd></div>}
            {label?.catno && <div><dt>Catalog no.</dt><dd>{label.catno}</dd></div>}
            <div><dt>Format</dt><dd>{formatLine(b)}</dd></div>
            {b.year > 0 && <div><dt>Released</dt><dd>{b.year}</dd></div>}
          </dl>
          {(b.styles?.length ?? 0) > 0 && <div className="chip-row">{b.styles!.map((s) => <span key={s} className="chip static">{s}</span>)}</div>}

          <div className="page-actions">
            {wanted && !owned && stats.data?.num_for_sale ? (
              <a className="btn primary" href={`https://www.discogs.com/sell/release/${id}`} target="_blank" rel="noreferrer">See the {stats.data.num_for_sale} listings</a>
            ) : null}
            {wanted && !owned && <Link className="btn" to="/match">Check my sellers</Link>}
            <a className="btn" href={discogsUrl('release', id)} target="_blank" rel="noreferrer">Open on Discogs</a>
            {wanted && !owned && <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate()}>Remove from wantlist</button>}
          </div>
          <ErrorBox error={remove.error} />
        </div>
      </div>
    </div>
  );
}
