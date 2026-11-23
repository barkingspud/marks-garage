import { NavLink, Outlet } from 'react-router-dom';
import type { Status } from '../api';

const NAV = [
  { to: '/', label: 'Home', icon: '◉' },
  { to: '/collection', label: 'Collection', icon: '▤' },
  { to: '/wantlist', label: 'Wantlist', icon: '♡' },
  { to: '/match', label: 'Sellers', icon: '⇄' },
  { to: '/discover', label: 'Discover', icon: '✦' },
];

export function Layout({ status }: { status: Status }) {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand"><img src="/icon.svg" alt="" width={28} height={28} /> Crate Companion</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
            <span className="nav-icon" aria-hidden>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="nav-foot muted">
          {status.mock ? <span className="pill">Demo data</span> : status.username && <>Signed in as <b>{status.username}</b></>}
        </div>
      </nav>
      <main className="main">
        <Outlet />
        <footer className="attribution muted">
          Data provided by <a href="https://www.discogs.com" target="_blank" rel="noreferrer">Discogs</a>.
          Crate Companion is not affiliated with or endorsed by Discogs.
        </footer>
      </main>
    </div>
  );
}
