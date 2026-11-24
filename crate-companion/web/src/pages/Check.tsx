import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MEDIA_GRADES } from '../../../shared/conditions';
import { gradeLabels, mediaKind } from '../../../shared/formats';
import type { SearchResult } from '../../../shared/discogs-types';
import { api, native } from '../api';
import { Cover } from '../components/Cover';
import { ICONS } from '../components/Layout';
import { DiscProgress, Empty, ErrorBox, Loading, PageHeader, money } from '../components/ui';
import { AiGate, Sparkle, useAiStatus } from '../components/Ai';
import type { IdentifyResult } from '../../../shared/ai-types';
import { toPhoto } from '../photo';
import { useRoom } from '../room';
import { useJob } from '../useJob';

const split = (t: string) => { const i = t.indexOf(' - '); return i > 0 ? { artist: t.slice(0, i).replace(/\*$/, '').replace(/ \(\d+\)$/, ''), title: t.slice(i + 3) } : { artist: '', title: t }; };

/** In a shop: find the exact pressing, see if you own or want it, and judge the asking price. */
export function Check() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [query, setQuery] = useState<{ q?: string; barcode?: string } | null>(null);
  const [pick, setPick] = useState<SearchResult | null>(null);
  const [allPressings, setAllPressings] = useState(false);
  const [price, setPrice] = useState('');
  const [media, setMedia] = useState('VG+');
  const [sleeve, setSleeve] = useState('VG+');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  /** Where the pressings on screen came from: a typed or scanned search, or the AI reading photos. */
  const [source, setSource] = useState<'search' | 'ai'>('search');
  const ai = useJob<IdentifyResult>('ai-identify');
  const aiOn = useAiStatus().data?.configured;
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  async function identifyPhotos(files: FileList | null) {
    setPhotoError(null);
    if (!files?.length) return;
    try {
      const photos = await Promise.all([...files].slice(0, 4).map((f) => toPhoto(f)));
      setSource('ai');
      void ai.start({ photos });
    } catch {
      setPhotoError("Couldn't read that photo. Try another one.");
    }
  }
  /** The app uses Google's native scanner; browsers fall back to the camera in the page. */
  async function scan() {
    setScanError(null);
    if (!native?.scanBarcode) { setScanning(true); return; }
    try {
      const code = await native.scanBarcode();
      if (code) { setText(code); submit(code); }
    } catch (e) {
      setScanError((e as Error).message);
    }
  }

  const coll = useQuery({ queryKey: ['collection', 0], queryFn: () => api.collection(0) });
  const wants = useQuery({ queryKey: ['wants'], queryFn: api.wants });
  const search = useQuery({ queryKey: ['check', query], queryFn: () => api.searchReleases(query!), enabled: !!query });
  const stats = useQuery({ queryKey: ['stats', pick?.id], queryFn: () => api.stats(pick!.id), enabled: !!pick });
  const bought = useMutation({
    mutationFn: () => api.addToCollection(pick!.id, wantedThis),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['collection'] }); void qc.invalidateQueries({ queryKey: ['wants'] }); },
  });
  useRoom(pick ? pick.cover_image || pick.thumb : null, 232);

  const aiFound = useMemo(() => (source === 'ai' && ai.result ? { total: ai.result.candidates.length, results: ai.result.candidates } : undefined), [source, ai.result]);
  const found = source === 'ai' ? aiFound : search.data;
  // `pick` is set by an effect, so for one render after a new search or photo it can still be
  // the old result's: only show it while it's among the current results.
  const shown = pick && found?.results.some((r) => r.id === pick.id) ? found : undefined;
  useEffect(() => { setPick(found?.results[0] ?? null); setAllPressings(false); }, [found]);
  // "Added to your collection" belongs to the pressing it was said about.
  useEffect(() => { bought.reset(); }, [pick?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(value = text) {
    const v = value.trim();
    if (!v) return;
    const digits = v.replace(/[\s-]/g, '');
    setSource('search');
    setQuery(/^\d{8,14}$/.test(digits) ? { barcode: digits } : { q: v });
  }

  // Until both lists have loaded, "not in your collection" would be a guess.
  const listsLoading = coll.isLoading || wants.isLoading;
  const listsFailed = !listsLoading && (coll.isError || wants.isError);
  const ownershipKnown = coll.isSuccess && wants.isSuccess;
  const ownedIds = new Set(coll.data?.items.map((i) => i.id));
  const ownedMasters = new Set(coll.data?.items.map((i) => i.basic_information.master_id).filter(Boolean));
  const wantIds = new Set(wants.data?.items.map((w) => w.id));
  const wantMasters = new Set(wants.data?.items.map((w) => w.basic_information.master_id).filter(Boolean));
  const ownThis = !!pick && ownedIds.has(pick.id);
  const ownOther = !!pick && !ownThis && !!pick.master_id && ownedMasters.has(pick.master_id);
  const wantedThis = !!pick && wantIds.has(pick.id);
  const wantedOther = !!pick && !wantedThis && !!pick.master_id && wantMasters.has(pick.master_id);

  const asking = Number(price.replace(/[^\d.]/g, ''));
  const low = stats.data?.lowest_price;
  const diff = low && asking > 0 ? asking - low.value : null;
  const head = pick ? split(pick.title) : null;
  const gradeNames = gradeLabels(mediaKind(pick?.format));

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHeader title="Check an album" sub="In a shop? Find the pressing in your hand and see if the price is fair." />

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); submit(); }} role="search">
        <label className="field-glass">
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <span className="sr-only">Artist and title, catalog number or barcode</span>
          <input type="search" inputMode="search" placeholder="Artist and title, cat# or barcode" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="button" className="btn icon" aria-label="Scan barcode" onClick={() => void scan()}>
          <svg viewBox="0 0 24 24" aria-hidden><path d={ICONS.barcode} /></svg>
        </button>
        {aiOn && (
          <button type="button" className="btn icon" aria-label="Identify from photos" onClick={() => photoInput.current?.click()}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!text.trim()}>Find</button>
      </form>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void identifyPhotos(e.target.files); e.target.value = ''; }} />
      {!aiOn && <AiGate what="identify the exact pressing from photos of the cover, label or runout">{null}</AiGate>}
      {aiOn && source === 'search' && !search.data && !search.isFetching && (
        <p className="sub small ai-hint"><Sparkle />Tap the camera to identify a pressing from photos: the cover, the label, the barcode or the runout (up to 4).</p>
      )}
      <ErrorBox error={photoError} />
      {source === 'ai' && ai.progress && <section className="glass panel"><DiscProgress {...ai.progress} /></section>}
      {source === 'ai' && <ErrorBox error={ai.error} />}
      {source === 'ai' && ai.result && !ai.running && <AiVerdict r={ai.result} />}
      <ErrorBox error={scanError} />
      {scanning && <Scanner onCode={(c) => { setScanning(false); setText(c); submit(c); }} onClose={() => setScanning(false)} />}

      {source === 'search' && search.isFetching && <Loading label="Searching Discogs…" />}
      {source === 'search' && <ErrorBox error={search.error} />}
      {source === 'search' && search.data && !search.data.results.length && <Empty title="No releases found">Try the catalog number from the spine or label, or the barcode digits.</Empty>}

      {pick && head && shown && (
        <>
          <div className="check-found">
            <Cover src={pick.cover_image || pick.thumb} id={pick.id} alt={`Cover of ${head.title}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ fontSize: 24 }}>{head.title}</h2>
              <span className="sub">{head.artist}{pick.year ? `, ${pick.year}` : ''}</span>
              <div className="status-row">
                {ownThis && <span className="status yes">You own this pressing</span>}
                {ownOther && <span className="status yes">You own another pressing</span>}
                {wantedThis && <span className="status yes">On your wantlist</span>}
                {wantedOther && <span className="status yes">Another pressing is on your wantlist</span>}
                {ownershipKnown && !ownThis && !ownOther && !wantedThis && !wantedOther && <span className="status">Not in your collection or wantlist</span>}
                {listsLoading && <span className="status">Checking your collection…</span>}
                {listsFailed && (
                  <button className="status status-retry" onClick={() => { void coll.refetch(); void wants.refetch(); }}>
                    Couldn't check. Try again
                  </button>
                )}
              </div>
            </div>
          </div>

          <fieldset className="glass panel" style={{ margin: 0 }}>
            <legend className="sr-only">Which pressing is in your hand?</legend>
            <h3 aria-hidden>Which pressing is in your hand?</h3>
            {(allPressings ? shown.results : shown.results.slice(0, 6)).map((r) => (
              <label key={r.id} className="pressing">
                <input type="radio" name="pressing" checked={pick.id === r.id} onChange={() => setPick(r)} />
                <span><b>{[r.label?.[0], r.catno].filter(Boolean).join(' ') || split(r.title).title}</b>
                  <small>{[r.country, r.year, r.format?.slice(0, 3).join(', ')].filter(Boolean).join(', ')}</small></span>
              </label>
            ))}
            {!allPressings && shown.results.length > 6 && (
              <button type="button" className="link-button" onClick={() => setAllPressings(true)}>
                Show all {shown.results.length} pressings
              </button>
            )}
            <p className="sub small" style={{ marginTop: 10 }}>
              {shown.total > shown.results.length ? `${shown.total} releases match; showing the first ${shown.results.length}. ` : shown.total > 6 ? `${shown.total} releases match. ` : ''}Many pressings share a catalog number: compare the runout etched near the label.
            </p>
          </fieldset>

          <section className="glass panel" aria-labelledby="h-fair">
            <h2 id="h-fair">Is it a fair price?</h2>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <label className="field">Shop price<input className="input" inputMode="decimal" placeholder="12.00" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
              <label className="field">{gradeNames.media}<select className="input" value={media} onChange={(e) => setMedia(e.target.value)}>{MEDIA_GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
              <label className="field">{gradeNames.sleeve}<select className="input" value={sleeve} onChange={(e) => setSleeve(e.target.value)}>{MEDIA_GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite">
              {stats.isLoading && <Loading label="Checking Discogs…" />}
              {stats.isError && (
                <div className="price-error">
                  <ErrorBox error={stats.error} />
                  <button className="btn small" onClick={() => void stats.refetch()}>Try again</button>
                </div>
              )}
              {stats.data && (low && stats.data.num_for_sale ? (
                <>
                  <div className="verdict"><b>{money(low.value, low.currency)}</b><span>cheapest of {stats.data.num_for_sale} on Discogs</span></div>
                  {diff !== null && (
                    <p>{Math.abs(diff) < 0.5 ? 'About the same as the cheapest listing.'
                      : diff > 0 ? `This shop is asking ${money(diff, low.currency)} more than the cheapest listing. Online copies add shipping, so it may still be worth it.`
                      : `This shop is ${money(-diff, low.currency)} cheaper than any copy on Discogs.`}</p>
                  )}
                  <p className="sub small">Listings are asking prices for any grade, not sales. Your copy is {media}/{sleeve}.</p>
                </>
              ) : <p className="sub">No copies of this pressing are listed on Discogs right now, so there's nothing to compare with.</p>)}
            </div>
          </section>

          <div className="page-actions">
            {ownershipKnown && !ownThis && <button className="btn primary" disabled={bought.isPending || bought.isSuccess} onClick={() => bought.mutate()}>{bought.isSuccess ? 'Added to your collection' : 'I bought it'}</button>}
            {stats.data?.num_for_sale ? <a className="btn" href={`https://www.discogs.com/sell/release/${pick.id}`} target="_blank" rel="noreferrer">See the listings</a> : null}
            {ownThis && <Link className="btn" to={`/record/${pick.id}`}>Open your copy</Link>}
          </div>
          {bought.isSuccess && <p className="sub">Added to your Discogs collection{wantedThis ? ' and removed from your wantlist' : ''}.</p>}
          <ErrorBox error={bought.error} />
        </>
      )}
    </div>
  );
}

/** What the AI made of the photos: its best match, how sure it is, and what to check. */
function AiVerdict({ r }: { r: IdentifyResult }) {
  const seen = [r.seen.artist, r.seen.title].filter(Boolean).join(', ');
  const codes = [...r.seen.catalogNumbers, ...(r.seen.barcode ? [r.seen.barcode] : []), ...r.seen.runout];
  return (
    <section className="glass panel ai-verdict" aria-labelledby="h-ai-verdict">
      <h2 id="h-ai-verdict"><Sparkle />{r.bestReleaseId ? 'Best match' : 'No sure match'}
        {r.bestReleaseId && <span className={`status ${r.confidence === 'high' ? 'yes' : ''}`}>{r.confidence === 'high' ? 'Confident' : r.confidence === 'medium' ? 'Fairly sure' : 'Not sure'}</span>}
      </h2>
      <p>{r.reasoning}</p>
      {r.check && <p className="sub">{r.check}</p>}
      {(seen || codes.length > 0) && <p className="sub small">Read from the photos: {[seen, ...codes].filter(Boolean).join(' · ')}</p>}
    </section>
  );
}

/** Camera barcode scanning where the browser supports it (Chrome on Android); typing always works. */
function Scanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('Point the camera at the barcode.');
  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!window.isSecureContext) { setMsg('The camera only works over a secure (https) connection. Type the numbers under the barcode instead, or use the Android app.'); return; }
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { setMsg("This browser can't scan barcodes. Type the numbers under the barcode instead."); return; }
    let stream: MediaStream | undefined; let timer = 0; let stopped = false;
    const detector = new Detector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s;
      if (stopped || !video.current) return;
      video.current.srcObject = s; void video.current.play();
      const tick = async () => {
        if (stopped || !video.current) return;
        const codes = await detector.detect(video.current).catch(() => []);
        if (codes[0]) onCode(codes[0].rawValue); else timer = window.setTimeout(tick, 300);
      };
      void tick();
    }).catch(() => setMsg('Camera access was blocked. Type the numbers under the barcode instead.'));
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <div className="glass panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 280, objectFit: 'cover' }} />
      <p className="sub">{msg}</p>
      <button className="btn" onClick={onClose}>Close camera</button>
    </div>
  );
}
