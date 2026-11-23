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

export function Score({ value }: { value: number }) {
  const tone = value >= 75 ? 'good' : value >= 55 ? 'ok' : 'low';
  return <span className={`score score-${tone}`} title="Match score (0–100)">{value}</span>;
}
