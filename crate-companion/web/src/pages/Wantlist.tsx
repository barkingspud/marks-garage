import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { MarketplaceStats } from '../../../shared/discogs-types';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { Empty, ErrorBox, Loading, PageHeader, Sticker, artistLine, discogsUrl } from '../components/ui';

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
      <PageHeader title="Wantlist" sub={wants.data ? `${items.length} records you're after` : undefined}>
        <button className="primary" onClick={checkAll} disabled={checkingAll || !items.length}>
          {checkingAll ? 'Checking prices…' : 'Check all prices'}
        </button>
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Filter wantlist" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {wants.isLoading && <Loading />}
      <ErrorBox error={wants.error ?? remove.error} />
      {wants.data && items.length === 0 && (
        <Empty title="Your wantlist is empty">
          Add records on Discogs, or pick some from Discover with the Want button.
        </Empty>
      )}
      <ul className="bin">
        {shown.map((w) => {
          const b = w.basic_information;
          const st = stats[w.id];
          const url = discogsUrl('release', b.id);
          const shop = `https://www.discogs.com/sell/release/${w.id}`;
          const priced = st && typeof st === 'object' ? st : undefined;
          return (
            <li key={w.id} className="bin-item">
              <a className="bin-cover" href={url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden>
                <Cover src={b.cover_image || b.thumb} id={b.id} fill />
              </a>
              {priced?.lowest_price && priced.num_for_sale > 0 && (
                <a className="sticker-link" href={shop} target="_blank" rel="noreferrer"
                  aria-label={`${priced.num_for_sale} for sale on Discogs, from ${priced.lowest_price.value.toFixed(2)} ${priced.lowest_price.currency}`}>
                  <Sticker value={priced.lowest_price.value} currency={priced.lowest_price.currency} label="from" />
                </a>
              )}
              <div className="bin-text">
                <a href={url} target="_blank" rel="noreferrer" className="bin-title">{b.title}</a>
                <div className="bin-artist">{artistLine(b)}</div>
                <div className="bin-meta">{b.year || null}</div>
                <div className="bin-actions">
                  {st === undefined && <button className="small" onClick={() => check(w.id)}>Check price</button>}
                  {st === 'loading' && <span className="spinner" aria-label="Checking price" />}
                  {st === 'error' && <span className="price-note">Price unavailable. <button className="ghost small" onClick={() => check(w.id)}>Try again</button></span>}
                  {priced && (
                    <a className="price-note" href={shop} target="_blank" rel="noreferrer">
                      {priced.num_for_sale ? `${priced.num_for_sale} for sale` : 'None for sale'}
                    </a>
                  )}
                  <button className="ghost small danger" disabled={remove.isPending} onClick={() => remove.mutate(w.id)}
                    aria-label={`Remove ${b.title} from wantlist`}>Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
