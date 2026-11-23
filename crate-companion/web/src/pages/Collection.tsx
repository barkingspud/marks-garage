import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { Empty, ErrorBox, Loading, PageHeader, artistLine, discogsUrl } from '../components/ui';

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
      <PageHeader title="Collection" sub={coll.data ? (shown.length === items.length ? `${items.length} records` : `${shown.length} of ${items.length} records`) : undefined}>
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
      {coll.data && items.length === 0 && (
        <Empty title="This folder is empty">Records you add to this folder on Discogs show up here.</Empty>
      )}
      {coll.data && items.length > 0 && shown.length === 0 && (
        <Empty title="Nothing matches">Try a shorter search, or set the style back to All styles.</Empty>
      )}
      <ul className="bin">
        {shown.map((i) => {
          const b = i.basic_information;
          const url = discogsUrl('release', b.id);
          return (
            <li key={i.instance_id} className="bin-item">
              <a className="bin-cover" href={url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden>
                <Cover src={b.cover_image || b.thumb} id={b.id} fill />
              </a>
              <div className="bin-text">
                <a href={url} target="_blank" rel="noreferrer" className="bin-title">{b.title}</a>
                <div className="bin-artist">{artistLine(b)}</div>
                <div className="bin-meta">
                  {[b.year || null, b.labels[0] && `${b.labels[0].name} ${b.labels[0].catno ?? ''}`.trim()].filter(Boolean).join(', ')}
                </div>
                {i.rating > 0 && <div className="rating" aria-label={`Your rating: ${i.rating} out of 5`}>{'★'.repeat(i.rating)}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
