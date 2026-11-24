import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, mode, type Status } from '../api';
import { RoomProvider } from '../room';
import { DisconnectButton } from './Disconnect';
import { forgetJobResults } from '../useJob';

const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  collection: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  wantlist: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  sellers: 'M4 8h13l-3-3M20 16H7l3 3',
  discover: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  barcode: 'M4 6v12M7 6v12M11 6v12M14 6v12M18 6v12M20 6v12',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
};
export const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>;
export { ICONS };

const NAV = [
  { to: '/', label: 'Home', icon: ICONS.home },
  { to: '/collection', label: 'Collection', icon: ICONS.collection },
  { to: '/wantlist', label: 'Wantlist', icon: ICONS.wantlist },
  { to: '/discover', label: 'Discover', icon: ICONS.discover },
];

export function Layout({ status }: { status: Status }) {
  const { pathname } = useLocation();
  // Favorite shops lives under the wantlist.
  const inSection = (to: string) => to === '/wantlist' && pathname.startsWith('/match');
  return (
    <RoomProvider>
      {(style) => (
        <div className="room" style={style}>
          <div className="shell">
            <aside className="side glass glass-blur">
              <NavLink to="/" className="brand"><span className="brand-disc" aria-hidden /> Crate Companion</NavLink>
              <nav aria-label="Main" className="side-nav">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `side-link${isActive || inSection(n.to) ? ' active' : ''}`}>
                    <Icon d={n.icon} />{n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="side-foot">
                <NavLink to="/check" className="btn"><svg viewBox="0 0 24 24" aria-hidden><path d={ICONS.barcode} /></svg>Check an album</NavLink>
                <NavLink to="/settings" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><Icon d={ICONS.settings} />Settings</NavLink>
                <div className="who">
                  {status.mock ? <span>Demo data</span> : status.username && <span>Signed in as <b>{status.username}</b></span>}
                  {status.mock && mode === 'local' && <button className="btn small" onClick={() => { forgetJobResults(); api.setDemo(false); }}>Leave demo</button>}
                  {(status.auth?.method === 'oauth' || (mode === 'local' && status.auth?.method)) && <DisconnectButton />}
                </div>
              </div>
            </aside>
            <main className="main">
              <Outlet />
              <p className="attribution">
                Data provided by <a href="https://www.discogs.com" target="_blank" rel="noreferrer">Discogs</a>.
                Crate Companion is not affiliated with or endorsed by Discogs.
              </p>
            </main>
          </div>
          <nav aria-label="Main" className="tabbar glass glass-blur">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `tab${isActive || inSection(n.to) ? ' active' : ''}`}>
                <Icon d={n.icon} /><span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <svg className="grain" aria-hidden width="100%" height="100%">
            <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1 0" /></filter>
            <rect width="100%" height="100%" filter="url(#grain)" />
          </svg>
        </div>
      )}
    </RoomProvider>
  );
}
