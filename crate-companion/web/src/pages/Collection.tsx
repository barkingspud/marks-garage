import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CollectionItem } from '../../../shared/discogs-types';
import { api } from '../api';
import { Cover } from '../components/Cover';
import { RecordHero } from '../components/RecordHero';
import { Empty, ErrorBox, GradeChip, Loading, PageHeader, artistLine } from '../components/ui';
import { myGrades } from '../grades';
import { useRoom } from '../room';
import { load, save } from '../storage';
import { useWide } from '../useWide';

type Sort = 'added' | 'artist' | 'title' | 'year' | 'rating';
const SORTS: [Sort, string][] = [['added', 'Newest first'], ['artist', 'Artist'], ['title', 'Title'], ['year', 'Year'], ['rating', 'My rating']];

export function Collection() {
  const [folder, setFolder] = useState(0);
  const [q, setQ] = useState('');
  const [style, setStyle] = useState('');
  const [sort, setSort] = useState<Sort>('added');
  const [view, setView] = useState<'grid' | 'list'>(() => load('view', { v: 'grid' as 'grid' | 'list' }).v);
  const [selected, setSelected] = useState<number | null>(null);
  const wide = useWide();
  const navigate = useNavigate();
  const folders = useQuery({ queryKey: ['folders'], queryFn: api.folders });
  const coll = useQuery({ queryKey: ['collection', folder], queryFn: () => api.collection(folder) });
  const fields = useQuery({ queryKey: ['fields'], queryFn: api.fields });

  const items = coll.data?.items ?? [];
  const styles = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of items) for (const s of i.basic_information.styles ?? []) n.set(s, (n.get(s) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = items.filter((i) => {
      const b = i.basic_information;
      if (style && !b.styles?.includes(style)) return false;
      if (!needle) return true;
      return [b.title, artistLine(b), ...b.labels.map((l) => `${l.name} ${l.catno ?? ''}`)].join(' ').toLowerCase().includes(needle);
    });
    const by: Record<Sort, (a: CollectionItem, b: CollectionItem) => number> = {
      added: (a, b) => b.date_added.localeCompare(a.date_added),
      artist: (a, b) => artistLine(a.basic_information).localeCompare(artistLine(b.basic_information)),
      title: (a, b) => a.basic_information.title.localeCompare(b.basic_information.title),
      year: (a, b) => (a.basic_information.year || 9999) - (b.basic_information.year || 9999),
      rating: (a, b) => b.rating - a.rating,
    };
    return out.sort(by[sort]);
  }, [items, q, style, sort]);

  const current = wide ? (shown.find((i) => i.instance_id === selected) ?? shown[0]) : undefined;
  useRoom(current ? current.basic_information.cover_image || current.basic_information.thumb : null, 215);

  const open = (i: CollectionItem) => (wide ? setSelected(i.instance_id) : navigate(`/record/${i.id}`));
  const setV = (v: 'grid' | 'list') => { setView(v); save('view', { v }); };

  return (
    <div className="page">
      <PageHeader title="My collection" sub={coll.data ? `${items.length.toLocaleString()} records${shown.length !== items.length ? `, ${shown.length} shown` : ''}` : undefined}>
        {(folders.data?.folders.length ?? 0) > 2 && (
          <select className="input" style={{ width: 'auto' }} value={folder} onChange={(e) => setFolder(Number(e.target.value))} aria-label="Folder">
            {folders.data!.folders.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.count})</option>)}
          </select>
        )}
      </PageHeader>

      <div className="toolbar" role="toolbar" aria-label="Find and sort">
        <label className="field-glass">
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <span className="sr-only">Search your collection</span>
          <input type="search" placeholder="Search artist, title, label or cat#" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input glass" style={{ width: 'auto', borderRadius: 22, minHeight: 44 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="seg glass" role="group" aria-label="View">
          <button aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setV('grid')}><svg viewBox="0 0 24 24" aria-hidden><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg></button>
          <button aria-pressed={view === 'list'} aria-label="List view" onClick={() => setV('list')}><svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
        </div>
      </div>
      {styles.length > 0 && (
        <div className="chip-row" role="group" aria-label="Filter by style">
          <button className="chip" aria-pressed={!style} onClick={() => setStyle('')}>All</button>
          {styles.slice(0, 6).map(([s, n]) => (
            <button key={s} className="chip" aria-pressed={style === s} onClick={() => setStyle(style === s ? '' : s)}>{s} {n}</button>
          ))}
        </div>
      )}

      {coll.isLoading && <Loading label="Loading your collection (big collections take a moment)…" />}
      <ErrorBox error={coll.error} />
      {coll.data && !items.length && <Empty title="This folder is empty">Records you add to it on Discogs show up here.</Empty>}
      {coll.data && items.length > 0 && !shown.length && <Empty title="Nothing matches">Try a shorter search, or choose All styles.</Empty>}

      <div className="with-panel">
        <div>
          {view === 'grid' ? (
            <ul className="bin">
              {shown.map((i) => {
                const b = i.basic_information;
                return (
                  <li key={i.instance_id}>
                    <button className={`bin-card${current?.instance_id === i.instance_id ? ' selected' : ''}`} onClick={() => open(i)}
                      aria-label={`${b.title} by ${artistLine(b)}`}>
                      <Cover src={b.cover_image || b.thumb} id={b.id} />
                      <span className="bin-meta" aria-hidden><b>{b.title}</b><span>{artistLine(b)}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="rows glass">
              {shown.map((i) => {
                const b = i.basic_information;
                return (
                  <li key={i.instance_id} className="row">
                    <Cover src={b.thumb} id={b.id} />
                    <span className="row-main">
                      <Link to={`/record/${b.id}`}><b>{b.title}</b></Link>
                      <span>{artistLine(b)}{b.year ? `, ${b.year}` : ''}</span>
                      <span>{b.labels[0] ? `${b.labels[0].name} ${b.labels[0].catno ?? ''}` : ''}</span>
                    </span>
                    {i.rating > 0 && <span className="sub" aria-label={`Your rating ${i.rating} of 5`}>{'★'.repeat(i.rating)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {current && <SidePanel item={current} fields={fields.data?.fields} />}
      </div>
    </div>
  );
}

function SidePanel({ item, fields }: { item: CollectionItem; fields: Parameters<typeof myGrades>[1] }) {
  const b = item.basic_information;
  const g = myGrades(item, fields);
  return (
    <aside className="detail-panel glass" aria-label="Selected record">
      <RecordHero src={b.cover_image || b.thumb} id={b.id} artist={artistLine(b)} title={b.title} />
      <div>
        <h2 style={{ fontSize: 28 }}>{b.title}</h2>
        <p className="sub" style={{ marginTop: 6 }}>{artistLine(b)}{b.year ? `, ${b.year}` : ''}</p>
        <p className="sub small" style={{ marginTop: 4 }}>{b.labels[0] ? `${b.labels[0].name} ${b.labels[0].catno ?? ''}, ` : ''}added {new Date(item.date_added).toLocaleDateString()}</p>
      </div>
      {(g.media || g.sleeve) && (
        <div className="chip-row">
          {g.media && <GradeChip label="Record" grade={g.media.grade} />}
          {g.sleeve && <GradeChip label="Sleeve" grade={g.sleeve.grade} />}
        </div>
      )}
      <div className="chip-row">{(b.styles ?? []).map((s) => <span key={s} className="chip static">{s}</span>)}</div>
      <div className="page-actions">
        <Link to={`/record/${b.id}`} className="btn primary">Open record</Link>
        <a className="btn" href={`https://www.discogs.com/release/${b.id}`} target="_blank" rel="noreferrer">On Discogs</a>
      </div>
    </aside>
  );
}
