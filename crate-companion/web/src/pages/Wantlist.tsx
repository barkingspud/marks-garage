import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceStats } from '../../../shared/discogs-types';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { Empty, ErrorBox, Loading, PageHeader, artistLine, money } from '../components/ui';
import { useRoom } from '../room';

export function Wantlist() {
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<Record<number, MarketplaceStats | 'loading' | 'error'>>({});
  const [checkingAll, setCheckingAll] = useState(false);
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
      <PageHeader title="Wantlist" sub={wants.data ? `${items.length} records you're after` : undefined}>
        <button className="btn primary" onClick={checkAll} disabled={checkingAll || !items.length}>
          {checkingAll ? `Checking prices, ${done} of ${shown.length}…` : 'Check all prices'}
        </button>
      </PageHeader>
      <label className="field-glass">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
        <span className="sr-only">Filter your wantlist</span>
        <input type="search" placeholder="Filter your wantlist" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {wants.isLoading && <Loading />}
      <ErrorBox error={wants.error} />
      {wants.data && !items.length && <Empty title="Your wantlist is empty">Add records on Discogs, or from Discover with Add to wantlist.</Empty>}

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
              {priced?.lowest_price && priced.num_for_sale > 0 ? (
                <a className="tag" href={`https://www.discogs.com/sell/release/${w.id}`} target="_blank" rel="noreferrer"
                  aria-label={`${priced.num_for_sale} for sale from ${money(priced.lowest_price.value, priced.lowest_price.currency)}`}>
                  from <b>{money(priced.lowest_price.value, priced.lowest_price.currency)}</b>
                </a>
              ) : st === 'loading' ? (
                <span className="tag" role="status"><span className="mini-disc" style={{ width: 16, height: 16 }} aria-hidden /><span className="sr-only">Checking price</span></span>
              ) : st === 'error' ? (
                <button className="tag tag-btn" onClick={() => check(w.id)}>Try again</button>
              ) : !priced ? (
                <button className="tag tag-btn" onClick={() => check(w.id)} aria-label={`Check price of ${b.title}`}>Check price</button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
