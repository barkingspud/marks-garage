import type { ReactNode } from 'react';
import type { BasicInformation } from '../../../shared/discogs-types';

export const artistLine = (b: Pick<BasicInformation, 'artists'>) =>
  b.artists.map((a) => a.name.replace(/ \(\d+\)$/, '') + (a.join ? ` ${a.join} ` : '')).join('').trim() ||
  b.artists.map((a) => a.name).join(', ');

export const formatLine = (b: Pick<BasicInformation, 'formats'>) =>
  b.formats.map((f) => [f.name, ...(f.descriptions ?? [])].join(', ')).join(' + ');

export const discogsUrl = (kind: 'release' | 'master', id: number) => `https://www.discogs.com/${kind}/${id}`;

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading"><span className="spinner" /> {label}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="error">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Progress({ done, total, message }: { done: number; total: number; message: string }) {
  const pct = total ? Math.min(100, Math.round((100 * done) / total)) : 0;
  return (
    <div className="progress">
      <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
      <span className="muted">{message}</span>
    </div>
  );
}

/** "$50.60", "€12.08"; whole amounts from 100 up so they fit the sticker. */
export function money(value: number, currency: string) {
  const big = value >= 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(big ? 0 : 2)} ${currency}`;
  }
}

/** Round yellow price sticker, as from a shop's price gun. */
export function Sticker({ value, currency, label }: { value: number; currency: string; label?: string }) {
  return (
    <span className="sticker">
      <span>{label && <small>{label}</small>}{money(value, currency)}</span>
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function Score({ value }: { value: number }) {
  const tone = value >= 75 ? 'good' : value >= 55 ? 'ok' : 'low';
  return <span className={`score score-${tone}`} title="Match score (0–100)">{value}</span>;
}
