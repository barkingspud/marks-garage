import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type Status } from '../api';
import { DisconnectButton } from '../components/Disconnect';
import { ErrorBox, Loading, PageHeader } from '../components/ui';

export function Home() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const status = useQuery<Status>({ queryKey: ['status'], queryFn: api.status });
  if (me.isLoading) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} />;
  const { profile, value } = me.data!;

  return (
    <>
      <PageHeader title={`Hi, ${profile.name || profile.username}`} sub="Your records at a glance." />
      <section className="stats">
        <Stat label="In collection" value={profile.num_collection ?? '—'} to="/collection" />
        <Stat label="On wantlist" value={profile.num_wantlist ?? '—'} to="/wantlist" />
        <Stat label="Collection value (median)" value={value?.median ?? '—'} hint={value ? `${value.minimum} – ${value.maximum}` : undefined} />
      </section>
      <section className="cards">
        <Link to="/match" className="card link-card">
          <h3>Match wants to sellers</h3>
          <p className="muted">Scan the shops you trust for anything on your wantlist that meets your grade, rating and price rules.</p>
        </Link>
        <Link to="/discover" className="card link-card">
          <h3>Discover</h3>
          <p className="muted">Recommendations built from the artists, labels and styles you already collect.</p>
        </Link>
      </section>
      {status.data?.auth?.method === 'oauth' && (
        <p className="muted small account-line">
          Connected to Discogs as <b>{status.data.auth.username}</b>. <DisconnectButton />
        </p>
      )}
    </>
  );
}

function Stat({ label, value, hint, to }: { label: string; value: string | number; hint?: string; to?: string }) {
  const body = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="muted small">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className="stat card link-card">{body}</Link> : <div className="stat card">{body}</div>;
}
