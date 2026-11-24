import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { imageUrl } from './Cover';

/**
 * Full-screen album artwork: every image Discogs has for the release (front, back, labels,
 * inserts…). Swipe between them; pinch or double-tap to zoom, drag to look around. Android's
 * Back button (or Escape) closes it.
 */
export function ImageViewer({ images, start = 0, title, onClose }: {
  images: string[]; start?: number; title: string; onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const strip = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);

  // Back closes the viewer instead of leaving the album: the viewer takes a history entry.
  useEffect(() => {
    window.history.pushState({ ...(window.history.state ?? {}), imageViewer: true }, '');
    const onPop = () => { closing.current = true; onClose(); };
    window.addEventListener('popstate', onPop);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => { window.removeEventListener('popstate', onPop); document.body.style.overflow = overflow; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { if (!closing.current) { closing.current = true; window.history.back(); } };

  const go = (i: number) => {
    const n = Math.max(0, Math.min(images.length - 1, i));
    strip.current?.scrollTo({ left: n * (strip.current?.clientWidth ?? 0), behavior: 'smooth' });
  };
  useEffect(() => {
    strip.current?.scrollTo({ left: start * (strip.current?.clientWidth ?? 0) });
  }, [start]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Images of ${title}`}>
      <div className="viewer-top">
        <span className="viewer-count" aria-live="polite">{images.length > 1 ? `${index + 1} of ${images.length}` : ''}</span>
        <button ref={closeBtn} className="viewer-close" onClick={close} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div
        ref={strip}
        className="viewer-strip"
        onScroll={(e) => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
      >
        {images.map((src, i) => (
          <div key={src + i} className="viewer-slide">
            <ZoomImage src={imageUrl(src) ?? src} alt={`${title}, image ${i + 1} of ${images.length}`} active={i === index} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button className="viewer-nav prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button className="viewer-nav next" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label="Next image">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="viewer-dots" aria-hidden>{images.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}</div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** One image: pinch (two fingers) or double-tap to zoom (up to 4×), drag to pan when zoomed. */
function ZoomImage({ src, alt, active }: { src: string; alt: string; active: boolean }) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => { if (!active) setT({ scale: 1, x: 0, y: 0 }); }, [active]);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const clampScale = (s: number) => Math.max(1, Math.min(4, s));

  function down(e: RPointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), scale: t.scale };
      drag.current = null;
    } else if (pointers.current.size === 1 && t.scale > 1) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
    }
  }
  function move(e: RPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const scale = clampScale(pinch.current.scale * (distance() / Math.max(1, pinch.current.dist)));
      setT((p) => (scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...p, scale }));
    } else if (drag.current) {
      const d = drag.current;
      setT((p) => ({ ...p, x: d.tx + (e.clientX - d.x), y: d.ty + (e.clientY - d.y) }));
    }
  }
  function up(e: RPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  const zoomed = t.scale > 1;
  return (
    <img
      className="viewer-img"
      src={src}
      alt={alt}
      draggable={false}
      // Not zoomed: sideways swipes go to the strip. Zoomed: every gesture pans the image.
      style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, touchAction: zoomed ? 'none' : 'pan-x', cursor: zoomed ? 'grab' : 'zoom-in' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      // Double-tap (phones send it as a double-click) or double-click: zoom in to 2.5×, or back out.
      onDoubleClick={() => setT((p) => (p.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))}
    />
  );
}
