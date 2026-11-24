import type { MediaKind } from '../../../shared/formats';
import { Cover } from './Cover';

interface HeroProps {
  src?: string | null; id: number; artist: string; title: string; label?: string; className?: string;
  /** Vinyl (the default), a CD or a cassette: each has its own case and media. */
  kind?: MediaKind;
}

/**
 * The app's signature: the cover in front, the media sliding out behind it, warm light
 * pooling underneath. Vinyl: the sleeve, and the record slowly turning, its label printed
 * with the artist and title. CD: the jewel case, and a silver disc with a turning sheen.
 * Cassette: the case, and the cassette with its label and turning reels.
 * Scales with its container (sizes use container query units).
 */
export function RecordHero(p: HeroProps) {
  if (p.kind === 'cd') return <CdHero {...p} />;
  if (p.kind === 'cassette') return <CassetteHero {...p} />;
  return <VinylHero {...p} />;
}

function VinylHero({ src, id, artist, title, label, className = '' }: HeroProps) {
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

function CdHero({ src, id, artist, title, className = '' }: HeroProps) {
  return (
    <div className={`hero hero-cd ${className}`}>
      <div className="hero-pool" aria-hidden />
      <div className="cd-disc" aria-hidden>
        <div className="cd-iris" />
        <div className="hero-warm" />
        <div className="hero-shade" />
      </div>
      <div className="hero-sleeve cd-case">
        <Cover src={src} id={id} alt={`Cover of ${title} by ${artist}`} />
        <div className="cd-hinge" aria-hidden />
        <div className="cd-gloss" aria-hidden />
      </div>
    </div>
  );
}

function CassetteHero({ src, id, artist, title, className = '' }: HeroProps) {
  return (
    <div className={`hero hero-cassette ${className}`}>
      <div className="hero-pool" aria-hidden />
      <div className="tape-shell" aria-hidden>
        <div className="tape-label">
          <span className="tape-label-text">
            <span className="hero-label-small">{artist}</span>
            <span className="tape-label-title">{title}</span>
          </span>
          <div className="tape-window">
            <span className="tape-reel left"><span className="tape-hub" /></span>
            <span className="tape-reel right"><span className="tape-hub" /></span>
          </div>
        </div>
        <div className="tape-foot" />
        <div className="tape-screw s1" /><div className="tape-screw s2" /><div className="tape-screw s3" /><div className="tape-screw s4" />
        <div className="hero-shade" />
      </div>
      <div className="tape-case">
        <Cover src={src} id={id} alt={`Cover of ${title} by ${artist}`} />
        <div className="cd-gloss" aria-hidden />
      </div>
    </div>
  );
}
