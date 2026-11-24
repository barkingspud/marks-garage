import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { albumOfTheDay, anotherAlbum, storyFor } from '../albumOfTheDay';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { ICONS } from '../components/Layout';
import { RecordHero } from '../components/RecordHero';
import { kindOf } from '../../../shared/formats';
import { Tonight } from '../components/Tonight';
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

  const items = coll.data?.items;
  const latest = useMemo(() => [...(items ?? [])].sort((a, b) => b.date_added.localeCompare(a.date_added)), [items]);
  const today = useMemo(() => albumOfTheDay(items ?? []), [items]);
  // The shuffle button swaps in another album for this visit; tomorrow brings a new one.
  const [shuffled, setShuffled] = useState<number | null>(null);
  const lead = (shuffled !== null && items?.find((i) => i.instance_id === shuffled)) || today;
  useRoom(lead?.basic_information.cover_image || lead?.basic_information.thumb);

  if (me.isLoading) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} />;
  const { profile, value } = me.data!;
  const wantCount = wants.data?.items.length ?? profile.num_wantlist ?? 0;
  const first = profile.name?.trim().split(/\s+/)[0] || profile.username;
  const b = lead?.basic_information;

  return (
    <div className="page">
      <div className="home-top">
        <div className="home-hello">
          <h1>{greeting()}, {first}</h1>
          <p className="sub">{(profile.num_collection ?? 0).toLocaleString()} albums. Put one on.</p>
        </div>
        <div className="page-actions">
          <Link to="/check" className="btn icon" aria-label="Check an album"><svg viewBox="0 0 24 24" aria-hidden><path d={ICONS.barcode} /></svg></Link>
          <Link to="/settings" className="btn icon" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden><path d={ICONS.settings} /></svg></Link>
        </div>
      </div>

      {coll.isLoading && <Loading label="Pulling your latest albums…" />}
      <ErrorBox error={coll.error} />
      {b && (
        <section className="home-hero" aria-label={shuffled ? 'Shuffled album' : 'Album of the day'}>
          <Link to={`/record/${b.id}`} aria-label={`${b.title} by ${artistLine(b)}. Open album.`}>
            <RecordHero kind={kindOf(b)} src={b.cover_image || b.thumb} id={b.id} artist={artistLine(b)} title={b.title} label={b.labels[0]?.name} />
          </Link>
          <div className="home-hero-text">
            <span className="hero-kicker">
              <span className="amber">{shuffled ? 'Shuffled' : 'Album of the day'}</span>
              <span className="sub">{storyFor(lead!)}</span>
            </span>
            <h2>{b.title}</h2>
            <span className="artist">{artistLine(b)}{b.year ? `, ${b.year}` : ''}</span>
            {b.labels[0] && <span className="sub">{b.labels[0].name} {b.labels[0].catno}</span>}
            <div className="page-actions" style={{ marginTop: 10 }}>
              <Link to={`/record/${b.id}`} className="btn primary">Open album</Link>
              <button className="btn icon" aria-label="Show another album" title="Show another album"
                onClick={() => setShuffled(anotherAlbum(items ?? [], lead)?.instance_id ?? null)}>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c1.6 0 2.7-1 3.6-2.4M13.4 9.4C14.3 8 15.4 7 17 7h3M17 4l3 3-3 3" /></svg>
              </button>
              <Link to="/collection" className="btn">All {(profile.num_collection ?? 0).toLocaleString()} albums</Link>
            </div>
          </div>
        </section>
      )}

      <Tonight />

      <div className="home-split">
        <section aria-labelledby="h-recent">
          <div className="section-head"><h2 id="h-recent">Recently added</h2><Link to="/collection">See all</Link></div>
          <ul className="strip">
            {latest.slice(0, 6).map((i) => {
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
          {value && (
            <p className="sub small home-value">
              Discogs values your collection at about <b className="amber">{value.median}</b> ({value.minimum} to {value.maximum}).
            </p>
          )}
        </section>
        <section className="glass panel" aria-labelledby="h-wants">
          <div className="section-head"><h2 id="h-wants">Your wantlist</h2><Link to="/wantlist">All {wantCount}</Link></div>
          <p className="sub">
            {wantCount ? `${wantCount.toLocaleString()} album${wantCount === 1 ? '' : 's'} you're looking for. See which ones your favorite shops have for sale.` : 'Albums you want go here. Add them from any album page or from Discover.'}
          </p>
          <div className="page-actions" style={{ marginTop: 14 }}>
            <Link to="/match" className="btn primary">Check my favorite shops</Link>
            <Link to="/discover" className="btn">Get recommendations</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

