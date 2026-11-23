import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { ErrorBox, Loading, PageHeader, artistLine, discogsUrl, formatLine } from '../components/ui';

type Sort = 'added' | 'artist' | 'title' | 'year' | 'rating';

export function Collection() {
  const [folder, setFolder] = useState(0);
  const [q, setQ] = useState('');
  const [style, setStyle] = useState('');
  const [sort, setSort] = useState<Sort>('added');
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const coll = useQuery({ queryKey: ['collection', folder], queryFn: () => api.collection(folder) });

  const items = coll.data?.items ?? [];
  const styles = useMemo(
    () => [...new Set(items.flatMap((i) => i.basic_information.styles ?? []))].sort(),
    [items],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = items.filter((i) => {
      const b = i.basic_information;
      if (style && !b.styles?.includes(style)) return false;
      if (!needle) return true;
      return [b.title, artistLine(b), ...b.labels.map((l) => `${l.name} ${l.catno ?? ''}`)].join(' ').toLowerCase().includes(needle);
    });
    const by: Record<Sort, (a: typeof out[number], b: typeof out[number]) => number> = {
      added: (a, b) => b.date_added.localeCompare(a.date_added),
      artist: (a, b) => artistLine(a.basic_information).localeCompare(artistLine(b.basic_information)),
      title: (a, b) => a.basic_information.title.localeCompare(b.basic_information.title),
      year: (a, b) => (a.basic_information.year || 9999) - (b.basic_information.year || 9999),
      rating: (a, b) => b.rating - a.rating,
    };
    return out.sort(by[sort]);
  }, [items, q, style, sort]);

  return (
    <>
      <PageHeader title="Collection" sub={coll.data ? `${shown.length} of ${items.length} releases` : undefined}>
        <select value={folder} onChange={(e) => setFolder(Number(e.target.value))} aria-label="Folder">
          {(folders.data?.folders ?? [{ id: 0, name: 'All', count: 0 }]).map((f) => (
            <option key={f.id} value={f.id}>{f.name}{f.count ? ` (${f.count})` : ''}</option>
          ))}
        </select>
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search artist, title, label, cat#" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style">
          <option value="">All styles</option>
          {styles.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="added">Recently added</option>
          <option value="artist">Artist</option>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="rating">My rating</option>
        </select>
      </div>
      {coll.isLoading && <Loading label="Loading collection (large collections take a moment)…" />}
      <ErrorBox error={coll.error} />
      <ul className="list">
        {shown.map((i) => {
          const b = i.basic_information;
          return (
            <li key={i.instance_id} className="row">
              <Cover src={b.thumb} id={b.id} />
              <div className="row-main">
                <a href={discogsUrl('release', b.id)} target="_blank" rel="noreferrer" className="row-title">{b.title}</a>
                <div>{artistLine(b)}</div>
                <div className="muted small">
                  {[b.labels[0] && `${b.labels[0].name} ${b.labels[0].catno ?? ''}`, b.year || null, formatLine(b)].filter(Boolean).join(' · ')}
                </div>
                <div className="chips">{(b.styles ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</div>
              </div>
              {i.rating > 0 && <div className="rating" title={`Rated ${i.rating}/5`}>{'★'.repeat(i.rating)}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
