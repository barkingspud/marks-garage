import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Status } from '../api';
import { Cover } from '../components/Cover';
import { DisconnectButton } from '../components/Disconnect';
import { ErrorBox, Loading, artistLine, discogsUrl } from '../components/ui';

const CRATE_SIZE = 12;

export function Home() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const status = useQuery<Status>({ queryKey: ['status'], queryFn: api.status });
  // Same query as the Collection page, so it's loaded once for both.
  const coll = useQuery({ queryKey: ['collection', 0], queryFn: () => api.collection(0) });

  if (me.isLoading) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} />;
  const { profile, value } = me.data!;
  const firstName = profile.name?.trim().split(/\s+/)[0] || profile.username;
  const latest = [...(coll.data?.items ?? [])]
    .sort((a, b) => b.date_added.localeCompare(a.date_added))
    .slice(0, CRATE_SIZE);
  const n = (x?: number) => (x ?? 0).toLocaleString();

  return (
    <>
      <h1 className="home-hello">Hi, {firstName}</h1>
      <p className="muted">The last records you added.</p>

      {coll.isLoading && <Loading label="Pulling your latest records…" />}
      {latest.length > 0 && (
        <div className="crate" role="list" aria-label="Recently added records">
          {latest.map((i, idx) => {
            const b = i.basic_information;
            return (
              <a
                key={i.instance_id} role="listitem" className="crate-item" style={{ ['--i' as string]: idx }}
                href={discogsUrl('release', b.id)} target="_blank" rel="noreferrer"
                title={`${artistLine(b)}: ${b.title}`}
              >
                <Cover src={b.cover_image || b.thumb} id={b.id} fill alt={`${artistLine(b)}: ${b.title}`} />
              </a>
            );
          })}
        </div>
      )}

      <p className="summary">
        You have <b>{n(profile.num_collection)}</b> records and <b>{n(profile.num_wantlist)}</b> on
        your wantlist.
        {value && <> Discogs values the collection at about <b>{value.median}</b> (somewhere between {value.minimum} and {value.maximum}).</>}
      </p>

      <div className="next-steps">
        <Link className="button primary" to="/match">Find your wants for sale</Link>
        <Link className="button" to="/discover">Get recommendations</Link>
      </div>

      {status.data?.auth?.method === 'oauth' && (
        <p className="muted small account-line">
          Connected to Discogs as <b>{status.data.auth.username}</b>. <DisconnectButton />
        </p>
      )}
    </>
  );
}
