import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { MarketplaceStats } from '../../../shared/discogs-types';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { ErrorBox, Loading, PageHeader, artistLine, discogsUrl, formatLine } from '../components/ui';

export function Wantlist() {
  const qc = useQueryClient();
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<Record<number, MarketplaceStats | 'loading' | 'error'>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  const remove = useMutation({
    mutationFn: api.removeWant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wants'] }),
  });

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
  // Sequential on purpose: each check is one Discogs API call (60/min budget).
  async function checkAll() {
    setCheckingAll(true);
    for (const w of shown) if (!stats[w.id] || stats[w.id] === 'error') await check(w.id);
    setCheckingAll(false);
  }

  return (
    <>
      <PageHeader title="Wantlist" sub={wants.data ? `${items.length} releases wanted` : undefined}>
        <button onClick={checkAll} disabled={checkingAll || !items.length}>
          {checkingAll ? 'Checking prices…' : 'Check marketplace prices'}
        </button>
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Filter wantlist" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {wants.isLoading && <Loading />}
      <ErrorBox error={wants.error ?? remove.error} />
      <ul className="list">
        {shown.map((w) => {
          const b = w.basic_information;
          const st = stats[w.id];
          return (
            <li key={w.id} className="row">
              <Cover src={b.thumb} id={b.id} />
              <div className="row-main">
                <a href={discogsUrl('release', b.id)} target="_blank" rel="noreferrer" className="row-title">{b.title}</a>
                <div>{artistLine(b)}</div>
                <div className="muted small">{[b.year || null, formatLine(b)].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="row-side">
                {st === undefined && <button className="ghost small" onClick={() => check(w.id)}>Price?</button>}
                {st === 'loading' && <span className="spinner" />}
                {st === 'error' && <span className="muted small">unavailable</span>}
                {st && typeof st === 'object' && (
                  <a href={`https://www.discogs.com/sell/release/${w.id}`} target="_blank" rel="noreferrer" className="small">
                    {st.num_for_sale ? <>{st.num_for_sale} for sale<br />from {st.lowest_price?.value.toFixed(2)} {st.lowest_price?.currency}</> : 'none for sale'}
                  </a>
                )}
                <button className="ghost small danger" disabled={remove.isPending} onClick={() => remove.mutate(w.id)} title="Remove from wantlist">✕</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
