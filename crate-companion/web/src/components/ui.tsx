import type { ReactNode } from 'react';
import type { BasicInformation } from '../../../shared/discogs-types';

export const artistLine = (b: Pick<BasicInformation, 'artists'>) =>
  b.artists.map((a) => a.name.replace(/ \(\d+\)$/, '').replace(/\*$/, '') + (a.join ? ` ${a.join} ` : '')).join('').trim() ||
  b.artists.map((a) => a.name).join(', ');

export const formatLine = (b: Pick<BasicInformation, 'formats'>) =>
  b.formats.map((f) => [f.name, ...(f.descriptions ?? [])].join(', ')).join(' + ');

export const discogsUrl = (kind: 'release' | 'master', id: number) => `https://www.discogs.com/${kind}/${id}`;

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

/** A small record turning: used while something loads. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="mini-disc" aria-hidden /> {label}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="error" role="alert">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass empty">
      <span className="mini-disc still" aria-hidden />
      <div><h3>{title}</h3>{children && <p className="sub">{children}</p>}</div>
    </div>
  );
}

/** Background job progress: a turning record with the progress drawn around it. */
export function DiscProgress({ done, total, message }: { done: number; total: number; message: string }) {
  const pct = total ? Math.min(1, done / total) : 0;
  const c = 2 * Math.PI * 54;
  return (
    <div className="disc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={message}>
      <div className="disc-progress-ring">
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="54" className="track" />
          <circle cx="60" cy="60" r="54" className="bar" strokeDasharray={`${pct * c} ${c}`} />
        </svg>
        <span className="disc-progress-disc"><span /></span>
      </div>
      <p aria-live="polite">{message}</p>
    </div>
  );
}

/** Match score 0–100 as a ring. */
export function ScoreRing({ value, size = 56 }: { value: number; size?: number }) {
  const c = 2 * Math.PI * 24;
  return (
    <span className="score-ring" style={{ width: size, height: size }} role="img" aria-label={`Match score ${value} out of 100`}>
      <svg viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r="24" className="track" />
        <circle cx="28" cy="28" r="24" className="bar" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span>{value}</span>
    </span>
  );
}

/** "$50.60"; whole amounts from 100 up. */
export function money(value: number, currency: string) {
  const big = value >= 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2 }).format(value);
  } catch {
    return `${value.toFixed(big ? 0 : 2)} ${currency}`;
  }
}

const SCALE = ['P', 'F', 'G', 'G+', 'VG', 'VG+', 'NM', 'M'] as const;

/** A grade on the scale from Poor to Mint, filled up to the grade. */
export function GradeMeter({ label, grade, text }: { label: string; grade: string | null; text: string }) {
  const at = grade ? SCALE.indexOf(grade as (typeof SCALE)[number]) : -1;
  return (
    <div className="grade-meter">
      <div className="grade-meter-head"><span>{label}</span><b>{text}</b></div>
      <div className="grade-meter-scale" role="img" aria-label={`${label}: ${text}, on the scale from Poor to Mint`}>
        {SCALE.map((g, i) => (
          <span key={g} className={i === at ? 'on' : i < at ? 'below' : ''}><i /><small>{g}</small></span>
        ))}
      </div>
    </div>
  );
}

/** Grade chip that gets stronger as the grade improves. */
export function GradeChip({ label, grade }: { label: string; grade: string | null }) {
  const tone = grade === 'M' || grade === 'NM' ? 'top' : grade === 'VG+' ? 'good' : 'plain';
  return <span className={`grade-chip ${tone}`}>{label} {grade ?? 'not graded'}</span>;
}
