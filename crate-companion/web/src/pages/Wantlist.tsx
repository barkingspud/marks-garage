import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceStats } from '../../../shared/discogs-types';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { Empty, ErrorBox, Loading, PageHeader, artistLine, money } from '../components/ui';
import { useRoom } from '../room';
import { load, save } from '../storage';

type Stat = MarketplaceStats | 'loading' | 'error' | undefined;

/** The price tag: lowest price (links to the listings), a spinner, or a button to check. */
function Price({ id, title, st, check, inline }: { id: number; title: string; st: Stat; check: (id: number) => void; inline?: boolean }) {
  const cls = `tag${inline ? ' tag-inline' : ''}`;
  const priced = st && typeof st === 'object' ? st : undefined;
  if (priced?.lowest_price && priced.num_for_sale > 0) {
    return (
      <a className={cls} href={`https://www.discogs.com/sell/release/${id}`} target="_blank" rel="noreferrer"
        aria-label={`${priced.num_for_sale} for sale from ${money(priced.lowest_price.value, priced.lowest_price.currency)}`}>
        from <b>{money(priced.lowest_price.value, priced.lowest_price.currency)}</b>
      </a>
    );
  }
  if (st === 'loading') return <span className={cls} role="status"><span className="mini-disc" style={{ width: 16, height: 16 }} aria-hidden /><span className="sr-only">Checking price</span></span>;
  if (st === 'error') return <button className={`${cls} tag-btn`} onClick={() => check(id)}>Try again</button>;
  if (!priced) return <button className={`${cls} tag-btn`} onClick={() => check(id)} aria-label={`Check price of ${title}`}>Check price</button>;
  return null;
}

export function Wantlist() {
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<Record<number, Stat>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(() => load('want-view', { v: 'grid' as 'grid' | 'list' }).v);
  const setV = (v: 'grid' | 'list') => { setView(v); save('want-view', { v }); };
  useRoom(null, 340);

  const items = wants.data?.items ?? [];
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? items.filter((w) => `${w.basic_information.title} ${artistLine(w.basic_information)}`.toLowerCase().includes(n)) : items;
  }, [items, q]);

  async function check(id: number) {
    setStats((s) => ({ ...s, [id]: 'loading' }));
    try {
      const st = await api.stats(id);
      setStats((s) => ({ ...s, [id]: st }));
    } catch {
      setStats((s) => ({ ...s, [id]: 'error' }));
    }
  }
  // One at a time on purpose: each check is one Discogs request (60 a minute allowed).
  async function checkAll() {
    setCheckingAll(true);
    for (const w of shown) if (!stats[w.id] || stats[w.id] === 'error') await check(w.id);
    setCheckingAll(false);
  }
  const done = shown.filter((w) => typeof stats[w.id] === 'object').length;

  return (
    <div className="page">
      <PageHeader title="Wantlist" sub={wants.data ? `${items.length} albums you're after` : undefined}>
        <Link className="btn" to="/match">Check my favorite shops</Link>
        <button className="btn primary" onClick={checkAll} disabled={checkingAll || !items.length}>
          {checkingAll ? `Checking prices, ${done} of ${shown.length}…` : 'Check all prices'}
        </button>
      </PageHeader>
      <div className="toolbar" role="toolbar" aria-label="Find and view">
        <label className="field-glass">
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <span className="sr-only">Filter your wantlist</span>
          <input type="search" placeholder="Filter your wantlist" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="seg glass" role="group" aria-label="View">
          <button aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setV('grid')}><svg viewBox="0 0 24 24" aria-hidden><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg></button>
          <button aria-pressed={view === 'list'} aria-label="List view" onClick={() => setV('list')}><svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        </div>
      </div>
      {wants.isLoading && <Loading />}
      <ErrorBox error={wants.error} />
      {wants.data && !items.length && <Empty title="Your wantlist is empty">Add albums on Discogs, or from Discover with Add to wantlist.</Empty>}

      {view === 'grid' ? (
        <ul className="bin">
          {shown.map((w) => {
            const b = w.basic_information;
            const st = stats[w.id];
            const priced = st && typeof st === 'object' ? st : undefined;
            return (
              <li key={w.id} className="bin-item">
                <Link to={`/record/${w.id}`} className="bin-card" aria-label={`${b.title} by ${artistLine(b)}`}>
                  <Cover src={b.cover_image || b.thumb} id={b.id} />
                  <span className="bin-meta" aria-hidden>
                    <b>{b.title}</b>
                    <span>{artistLine(b)}{priced ? `, ${priced.num_for_sale ? `${priced.num_for_sale} for sale` : 'none for sale'}` : ''}</span>
                  </span>
                </Link>
                <Price id={w.id} title={b.title} st={st} check={check} />
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="rows glass">
          {shown.map((w) => {
            const b = w.basic_information;
            const st = stats[w.id];
            const priced = st && typeof st === 'object' ? st : undefined;
            const label = b.labels[0];
            return (
              <li key={w.id} className="row">
                <Cover src={b.thumb} id={b.id} />
                <span className="row-main">
                  <Link to={`/record/${w.id}`}><b>{b.title}</b></Link>
                  <span>{artistLine(b)}{b.year ? `, ${b.year}` : ''}</span>
                  <span>{label ? `${label.name.replace(/ \(\d+\)$/, '')} ${label.catno ?? ''}` : ''}{priced && !priced.num_for_sale ? `${label ? ', ' : ''}none for sale` : ''}</span>
                </span>
                <Price id={w.id} title={b.title} st={st} check={check} inline />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
