import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BasicInformation, ReleaseDetails, Track } from '../../../shared/discogs-types';
import { api } from '../api';
import { RecordHero } from '../components/RecordHero';
import { ImageViewer } from '../components/ImageViewer';
import { ICONS } from '../components/Layout';
import { gradeLabels, kindOf, type MediaKind } from '../../../shared/formats';
import { RateRecord } from '../components/Stars';
import { Empty, ErrorBox, GradeMeter, Loading, artistLine, discogsUrl, formatLine, money } from '../components/ui';
import { groupCredits, plainNotes } from '../discogs-text';
import { myGrades } from '../grades';
import { useRoom } from '../room';
import { AiGate, Sparkle, useAiStatus } from '../components/Ai';
import { modelInfo } from '../../../shared/ai-models';
import type { AlbumNotes } from '../../../shared/ai-types';
import { load, save } from '../storage';

/**
 * One record: yours (rating, grades), wanted (what it costs right now), or any other
 * pressing. Every record shows its track listing, credits and the details that identify
 * the pressing (barcode, runout etchings).
 */
export function Record() {
  const id = Number(useParams().releaseId);
  const qc = useQueryClient();
  const [viewing, setViewing] = useState(false);
  const coll = useQuery({ queryKey: ['collection', 0], queryFn: () => api.collection(0) });
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const fields = useQuery({ queryKey: ['fields'], queryFn: api.fields });
  const rel = useQuery({ queryKey: ['release', id], queryFn: () => api.release(id), staleTime: 60 * 60_000 });

  const owned = coll.data?.items.find((i) => i.id === id);
  const wanted = wants.data?.items.find((w) => w.id === id);
  const d = rel.data;
  const b: Pick<BasicInformation, 'id' | 'title' | 'year' | 'artists' | 'labels' | 'formats' | 'styles' | 'cover_image' | 'thumb'> | undefined =
    owned?.basic_information ?? wanted?.basic_information ?? (d && {
      id: d.id, title: d.title, year: d.year ?? 0, artists: d.artists, labels: d.labels, formats: d.formats, styles: d.styles,
      cover_image: d.images?.find((i) => i.type === 'primary')?.uri ?? d.images?.[0]?.uri ?? '', thumb: d.thumb ?? '',
    });
  const stats = useQuery({ queryKey: ['stats', id], queryFn: () => api.stats(id), enabled: !owned && !!b });
  const remove = useMutation({
    mutationFn: () => api.removeWant(id),
    onSuccess: () => { addWant.reset(); void qc.invalidateQueries({ queryKey: ['wants'] }); },
  });
  const addWant = useMutation({
    mutationFn: () => api.addWant({ releaseId: id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wants'] }),
  });
  // Bought it: into the Discogs collection, and off the wantlist if it was there.
  const addCopy = useMutation({
    mutationFn: (fromWantlist: boolean) => api.addToCollection(id, fromWantlist),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['collection'] }); void qc.invalidateQueries({ queryKey: ['wants'] }); },
  });
  useRoom(b ? b.cover_image || b.thumb : null);

  if (coll.isLoading || wants.isLoading || (rel.isLoading && !owned && !wanted)) return <Loading />;
  if (!b) {
    return (
      <div className="page">
        <BackButton />
        <Empty title="Couldn't load this album">
          <a href={discogsUrl('release', id)} target="_blank" rel="noreferrer">See it on Discogs</a>
        </Empty>
        <ErrorBox error={rel.error} />
      </div>
    );
  }
  const g = myGrades(owned, fields.data?.fields);
  const kind = kindOf(b);
  // Every image Discogs has for the release (front, back, labels…), or at least the cover.
  const images = d?.images?.length ? d.images.map((i) => i.uri).filter(Boolean) : b?.cover_image ? [b.cover_image] : [];
  const names = gradeLabels(kind);
  const label = (d?.labels ?? b.labels)[0];
  const format = d ? formatLine({ formats: d.formats }) + formatText(d) : formatLine(b);
  const forSale = stats.data?.num_for_sale ?? 0;

  return (
    <div className="page">
      <BackButton />
      <div className="detail">
        <RecordHero kind={kind} src={b.cover_image || b.thumb} id={b.id} artist={artistLine(b)} title={b.title} label={label?.name}
          onOpen={images.length ? () => setViewing(true) : undefined} imageCount={images.length} />
        {viewing && <ImageViewer images={images} title={b.title} onClose={() => setViewing(false)} />}
        <div className="detail-info">
          <div>
            <h1>{b.title}</h1>
            <p className="sub" style={{ fontSize: 19, marginTop: 8 }}>{artistLine(b)}{b.year ? `, ${b.year}` : ''}</p>
          </div>
          {owned ? (
            <span className="owned-pill glass">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12l4 4 10-10" /></svg>
              In your collection since {new Date(owned.date_added).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          ) : wanted ? (
            <span className="owned-pill glass" style={{ color: 'var(--amber)' }}>On your wantlist</span>
          ) : (
            <span className="owned-pill glass">Not in your collection</span>
          )}

          {owned && (
            <section className="glass panel" aria-labelledby="h-copy">
              <h2 id="h-copy">Your copy</h2>
              <div className="copy-rating">
                <span className="sub">Your rating</span>
                <RateRecord item={owned} />
              </div>
              {g.media || g.sleeve ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {g.media && <GradeMeter label={names.media} grade={g.media.grade} text={g.media.text} />}
                  {g.sleeve && <GradeMeter label={names.sleeve} grade={g.sleeve.grade} text={g.sleeve.text} />}
                </div>
              ) : (
                <p className="sub" style={{ marginTop: 10 }}>No grades yet. Add them in your collection on Discogs (Media and Sleeve Condition) and they'll show here.</p>
              )}
            </section>
          )}

          {!owned && (
            <section className="glass panel" aria-labelledby="h-market">
              <h2 id="h-market">On the Discogs marketplace</h2>
              {stats.isLoading && <Loading label="Checking prices…" />}
              <ErrorBox error={stats.error} />
              {stats.data && (forSale && stats.data.lowest_price ? (
                <div className="verdict">
                  <b>{money(stats.data.lowest_price.value, stats.data.lowest_price.currency)}</b>
                  <span>cheapest of {forSale} for sale</span>
                </div>
              ) : <p className="sub">None for sale right now.</p>)}
            </section>
          )}

          <dl className="facts">
            {label && <div><dt>Label</dt><dd>{label.name.replace(/ \(\d+\)$/, '')}</dd></div>}
            {label?.catno && <div><dt>Catalog no.</dt><dd>{label.catno}</dd></div>}
            <div><dt>Format</dt><dd>{format}</dd></div>
            {(d?.released_formatted || b.year > 0) && <div><dt>Released</dt><dd>{d?.released_formatted || b.year}</dd></div>}
            {d?.country && <div><dt>Country</dt><dd>{d.country}</dd></div>}
            {d?.genres?.length ? <div><dt>Genre</dt><dd>{d.genres.join(', ')}</dd></div> : null}
          </dl>
          {(b.styles?.length ?? 0) > 0 && <div className="chip-row">{b.styles!.map((s) => <span key={s} className="chip static">{s}</span>)}</div>}
          {d?.community && <Community c={d.community} />}

          {/* One main action as a pill; the rest as a quiet row of icon buttons. */}
          <div className="album-actions">
            {!owned && forSale > 0 && (
              <a className="btn primary" href={`https://www.discogs.com/sell/release/${id}`} target="_blank" rel="noreferrer">See the {forSale} listing{forSale === 1 ? '' : 's'}</a>
            )}
            {!owned && forSale === 0 && (
              <button className="btn primary" disabled={addCopy.isPending || addCopy.isSuccess} onClick={() => addCopy.mutate(!!wanted)}>
                {addCopy.isSuccess ? 'Added to your collection' : addCopy.isPending ? 'Adding…' : 'Add to collection'}
              </button>
            )}
            <div className="action-row">
              {!owned && forSale > 0 && (
                <button className={`action-icon${addCopy.isSuccess ? ' on' : ''}`} disabled={addCopy.isPending || addCopy.isSuccess} onClick={() => addCopy.mutate(!!wanted)}>
                  <span className="action-disc"><svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg></span>
                  {addCopy.isSuccess ? 'Added' : 'Collection'}
                </button>
              )}
              {!owned && (
                <button
                  className={`action-icon${wanted || addWant.isSuccess ? ' on' : ''}`}
                  aria-pressed={!!wanted || addWant.isSuccess}
                  disabled={addWant.isPending || remove.isPending}
                  onClick={() => {
                    if (wanted) { if (confirm(`Remove ${b.title} from your wantlist?`)) remove.mutate(); }
                    else addWant.mutate();
                  }}
                >
                  <span className="action-disc"><svg className="fill-on" viewBox="0 0 24 24" aria-hidden><path d={ICONS.wantlist} /></svg></span>
                  {wanted || addWant.isSuccess ? 'Wanted' : 'Want it'}
                </button>
              )}
              {wanted && !owned && (
                <Link className="action-icon" to="/match">
                  <span className="action-disc"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 10l1.5-5h13L20 10M4 10h16M4 10v1a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0v-1M5.5 13.5V20h13v-6.5M10 20v-4h4v4" /></svg></span>
                  Shops
                </Link>
              )}
              <a className="action-icon" href={discogsUrl('release', id)} target="_blank" rel="noreferrer">
                <span className="action-disc"><svg viewBox="0 0 24 24" aria-hidden><path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" /></svg></span>
                Discogs
              </a>
            </div>
          </div>
          {addCopy.isSuccess && <p className="sub" aria-live="polite">Added to your Discogs collection{addCopy.variables ? ' and removed from your wantlist' : ''}.</p>}
          <ErrorBox error={remove.error ?? addWant.error ?? addCopy.error} />
        </div>
      </div>

      <AiNotes id={id} kind={kind} />
      {rel.isLoading && <Loading label="Loading the track listing…" />}
      {rel.error && !d ? <ErrorBox error={rel.error} /> : null}
      {d && <ReleaseSections d={d} />}
    </div>
  );
}

/** The AI's notes on the album and this pressing, kept on the device once written. */
function AiNotes({ id, kind }: { id: number; kind: MediaKind }) {
  const storeKey = `ai-notes-${id}`;
  const [saved, setSaved] = useState(() => load<{ n?: AlbumNotes; model?: string }>(storeKey, {}));
  const notes = saved.n ?? null;
  const status = useAiStatus().data;
  const model = status?.model;
  // Notes are shared per pressing: if anyone already wrote them, show them without a tap (free).
  const shared = useQuery({
    queryKey: ['shared-notes', id],
    queryFn: () => api.ai.sharedNotes(id),
    enabled: !notes && !!status?.included,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (!notes && shared.data) { const v = { n: shared.data, model: 'claude-haiku-5-5' }; setSaved(v); save(storeKey, v); }
  }, [shared.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = useMutation({
    mutationFn: () => api.ai.notes(id),
    onSuccess: (n) => { const v = { n, model: status?.ownKey ? model : 'claude-haiku-5-5' }; setSaved(v); save(storeKey, v); },
  });
  const writtenBy = modelInfo(saved.model ?? '')?.name;
  const current = modelInfo(model ?? '');
  return (
    <section className="glass panel ai-notes" aria-labelledby="h-ai-notes">
      <h2 id="h-ai-notes"><Sparkle />About this album</h2>
      <AiGate what="write notes on this album and pressing">
        {notes ? (
          <>
            <p>{notes.about}</p>
            {notes.listenFor.length > 0 && (
              <>
                <h3>Listen for</h3>
                <ul>{notes.listenFor.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
            <h3>{kind === 'vinyl' ? 'This pressing' : 'This edition'}</h3>
            <p>{notes.thisPressing}</p>
            {notes.caveat && <p className="sub small">{notes.caveat}</p>}
            <p className="sub small">Written by AI{writtenBy ? ` (${writtenBy})` : ''} from what it knows and the Discogs data. It can be wrong.</p>
            {current && saved.model && saved.model !== current.id && (
              <button className="btn small" style={{ marginTop: 10 }} disabled={write.isPending} onClick={() => write.mutate()}>
                {write.isPending ? 'Writing…' : `Write again with ${current.name}`}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="sub">Why the album matters, what to listen for, and what's notable about this pressing.</p>
            <button className="btn primary" style={{ marginTop: 10 }} disabled={write.isPending} onClick={() => write.mutate()}>
              {write.isPending ? 'Writing…' : 'Write notes with AI'}
            </button>
          </>
        )}
        <ErrorBox error={write.error} />
      </AiGate>
    </section>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button className="btn back" onClick={() => navigate(-1)}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>Back
    </button>
  );
}

/** Free-text format details Discogs keeps apart, like "Gatefold" or "180g". */
function formatText(d: ReleaseDetails) {
  const t = d.formats.map((f) => f.text).filter(Boolean);
  return t.length ? `, ${t.join(', ')}` : '';
}

function Community({ c }: { c: NonNullable<ReleaseDetails['community']> }) {
  const r = c.rating;
  return (
    <p className="sub community">
      {r && r.count > 0 && <><span className="amber">★ {r.average.toFixed(1)}</span> from {r.count.toLocaleString()} Discogs rating{r.count === 1 ? '' : 's'}. </>}
      {c.have.toLocaleString()} members have it, {c.want.toLocaleString()} want it.
    </p>
  );
}

function ReleaseSections({ d }: { d: ReleaseDetails }) {
  const credits = groupCredits(d.extraartists ?? []);
  const ids = d.identifiers ?? [];
  const notes = d.notes ? plainNotes(d.notes) : '';
  return (
    <div className="release-sections">
      {d.tracklist.length > 0 && (
        <section className="glass panel" aria-labelledby="h-tracks">
          <div className="panel-head">
            <h2 id="h-tracks">Tracks</h2>
            <span className="sub small">{runningTime(d.tracklist)}</span>
          </div>
          <Tracklist tracks={d.tracklist} />
        </section>
      )}
      {credits.length > 0 && <Credits credits={credits} />}
      {ids.length > 0 && <Identifiers ids={ids} />}
      {notes && <Notes text={notes} />}
    </div>
  );
}

function Tracklist({ tracks, nested }: { tracks: Track[]; nested?: boolean }) {
  return (
    <ol className={`tracks${nested ? ' nested' : ''}`}>
      {tracks.map((t, i) => t.type_ === 'heading' ? (
        <li key={i} className="track-heading">{t.title}</li>
      ) : (
        <li key={i} className="track">
          <span className="track-pos">{t.position}</span>
          <span className="track-title">
            {t.title}
            {t.artists?.length ? <span className="sub"> {artistLine({ artists: t.artists })}</span> : null}
            {t.sub_tracks?.length ? <Tracklist tracks={t.sub_tracks} nested /> : null}
          </span>
          <span className="track-time">{t.duration}</span>
        </li>
      ))}
    </ol>
  );
}

/** "8 tracks, 44:15" (time only when every track has one). */
function runningTime(tracks: Track[]) {
  const real = tracks.filter((t) => t.type_ !== 'heading');
  const secs = real.map((t) => {
    const m = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(t.duration ?? '');
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  });
  const n = `${real.length} track${real.length === 1 ? '' : 's'}`;
  if (!secs.length || secs.some((s) => s === null)) return n;
  const total = secs.reduce<number>((a, s) => a + (s ?? 0), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${n}, ${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${s}`;
}

/** Release notes, cut to a few lines with "Show more" when they run long. */
function Notes({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return (
    <section className="glass panel" aria-labelledby="h-notes">
      <h2 id="h-notes">Notes</h2>
      <p ref={ref} id="release-notes" className={`notes${open ? '' : ' clamped'}`}>{text}</p>
      {(long || open) && (
        <button className="btn small" style={{ marginTop: 12 }} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="release-notes">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  );
}

const ID_PREVIEW = 3;
type Ids = NonNullable<ReleaseDetails['identifiers']>;

/**
 * The few codes that identify a pressing fastest: one barcode and the first runout etchings,
 * topped up in Discogs's order. Keeps Discogs's order.
 */
export function previewIds(ids: Ids, n = ID_PREVIEW): Ids {
  if (ids.length <= n) return ids;
  const pick = new Set<number>();
  const barcode = ids.findIndex((x) => /^barcode/i.test(x.type));
  if (barcode >= 0) pick.add(barcode);
  ids.forEach((x, i) => { if (pick.size < n && /matrix|runout/i.test(x.type)) pick.add(i); });
  ids.forEach((_, i) => { if (pick.size < n) pick.add(i); });
  return ids.filter((_, i) => pick.has(i));
}

/** Barcodes, runout etchings and other codes. Long lists start collapsed. */
function Identifiers({ ids }: { ids: Ids }) {
  const [all, setAll] = useState(false);
  const shown = all ? ids : previewIds(ids);
  return (
    <section className="glass panel" aria-labelledby="h-ids">
      <h2 id="h-ids">Identifying this pressing</h2>
      <p className="sub small" style={{ marginTop: -4, marginBottom: 10 }}>Compare these with the barcode and the numbers etched near the label (the runout).</p>
      <dl className="id-list" id="id-list">
        {shown.map((x, i) => (
          <div key={i}>
            <dt>{x.type}{x.description ? `, ${x.description}` : ''}</dt>
            <dd>{x.value}</dd>
          </div>
        ))}
      </dl>
      {ids.length > ID_PREVIEW && (
        <button className="btn small" style={{ marginTop: 12 }} onClick={() => setAll(!all)} aria-expanded={all} aria-controls="id-list">
          {all ? 'Show fewer' : `Show all ${ids.length} details`}
        </button>
      )}
    </section>
  );
}

function Credits({ credits }: { credits: [string, string[]][] }) {
  const [all, setAll] = useState(false);
  const shown = all ? credits : credits.slice(0, 8);
  return (
    <section className="glass panel" aria-labelledby="h-credits">
      <h2 id="h-credits">Credits</h2>
      <dl className="credits">
        {shown.map(([role, names]) => (
          <div key={role}><dt>{role}</dt><dd>{names.join(', ')}</dd></div>
        ))}
      </dl>
      {credits.length > 8 && (
        <button className="btn small" style={{ marginTop: 12 }} onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${credits.length} credits`}
        </button>
      )}
    </section>
  );
}
