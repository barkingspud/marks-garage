import { Cover } from './Cover';

/**
 * The app's signature: the sleeve in front, the record sliding out behind it and slowly
 * turning, its label printed with the artist and title, warm light pooling underneath.
 * Scales with its container (sizes use container query units).
 */
export function RecordHero({ src, id, artist, title, label, className = '' }: {
  src?: string | null; id: number; artist: string; title: string; label?: string; className?: string;
}) {
  return (
    <div className={`hero ${className}`}>
      <div className="hero-pool" aria-hidden />
      <div className="hero-disc" aria-hidden>
        <div className="hero-spin">
          <div className="hero-label">
            <span className="hero-label-small">{artist}</span>
            <span className="hero-label-title">{title}</span>
            <span className="hero-hole" />
            {label && <span className="hero-label-small">{label}</span>}
          </div>
        </div>
        <div className="hero-warm" />
        <div className="hero-shade" />
        <div className="hero-sheen" />
      </div>
      <div className="hero-sleeve">
        <Cover src={src} id={id} alt={`Cover of ${title} by ${artist}`} />
        <div className="hero-sleeve-light" aria-hidden />
      </div>
    </div>
  );
}
