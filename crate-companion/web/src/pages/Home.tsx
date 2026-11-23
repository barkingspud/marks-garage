import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { ICONS } from '../components/Layout';
import { RecordHero } from '../components/RecordHero';
import { ErrorBox, Loading, artistLine } from '../components/ui';
import { useRoom } from '../room';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  // Same query as the Collection page, so it's loaded once for both.
  const coll = useQuery({ queryKey: ['collection', 0], queryFn: () => api.collection(0) });
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });

  const latest = [...(coll.data?.items ?? [])].sort((a, b) => b.date_added.localeCompare(a.date_added));
  const lead = latest[0];
  useRoom(lead?.basic_information.cover_image || lead?.basic_information.thumb);

  if (me.isLoading) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} />;
  const { profile, value } = me.data!;
  const first = profile.name?.trim().split(/\s+/)[0] || profile.username;
  const b = lead?.basic_information;

  return (
    <div className="page">
      <div className="home-top">
        <div className="home-hello">
          <h1>{greeting()}, {first}</h1>
          <p className="sub">{(profile.num_collection ?? 0).toLocaleString()} records. Put one on.</p>
        </div>
        <Link to="/check" className="btn icon" aria-label="Check a record"><svg viewBox="0 0 24 24" aria-hidden><path d={ICONS.barcode} /></svg></Link>
      </div>

      {coll.isLoading && <Loading label="Pulling your latest records…" />}
      <ErrorBox error={coll.error} />
      {b && (
        <section className="home-hero" aria-label="Last added">
          <Link to={`/record/${b.id}`} aria-label={`${b.title} by ${artistLine(b)}. Open record.`}>
            <RecordHero src={b.cover_image || b.thumb} id={b.id} artist={artistLine(b)} title={b.title} label={b.labels[0]?.name} />
          </Link>
          <div className="home-hero-text">
            <span className="sub">Last added, {new Date(lead!.date_added).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            <h2>{b.title}</h2>
            <span className="artist">{artistLine(b)}{b.year ? `, ${b.year}` : ''}</span>
            {b.labels[0] && <span className="sub">{b.labels[0].name} {b.labels[0].catno}</span>}
            <div className="page-actions" style={{ marginTop: 10 }}>
              <Link to={`/record/${b.id}`} className="btn primary">Open record</Link>
              <Link to="/collection" className="btn">All {(profile.num_collection ?? 0).toLocaleString()} records</Link>
            </div>
          </div>
        </section>
      )}

      <div className="home-split">
        <section aria-labelledby="h-recent">
          <div className="section-head"><h2 id="h-recent">Recently added</h2><Link to="/collection">See all</Link></div>
          <ul className="strip">
            {latest.slice(1, 7).map((i) => {
              const r = i.basic_information;
              return (
                <li key={i.instance_id}>
                  <Link to={`/record/${r.id}`}>
                    <Cover src={r.cover_image || r.thumb} id={r.id} />
                    <span><b>{r.title}</b><small>{artistLine(r)}</small></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="glass panel" aria-labelledby="h-wants">
          <div className="section-head"><h2 id="h-wants">Your wantlist</h2><Link to="/wantlist">All {wants.data?.items.length ?? profile.num_wantlist ?? 0}</Link></div>
          <p className="sub">
            {value ? <>Discogs values your collection at about <b className="amber">{value.median}</b> ({value.minimum} to {value.maximum}).</> : 'Collection value unavailable.'}
          </p>
          <div className="page-actions" style={{ marginTop: 14 }}>
            <Link to="/match" className="btn primary">Find your wants for sale</Link>
            <Link to="/discover" className="btn">Get recommendations</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

