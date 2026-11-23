import { useState } from 'react';

/**
 * Release artwork, or a drawn record label when Discogs has none or the image fails to load.
 * `alt` describes the record (artist and title). Leave it empty when the same text is
 * already right next to the image, so screen readers don't read it twice.
 */
export function Cover({ src, id, size = 56, alt = '', fill = false }: {
  src?: string; id: number; size?: number; alt?: string; fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dims = fill ? {} : { width: size, height: size };
  if (src && !src.includes('spacer.gif') && !failed) {
    return (
      <img className="cover" src={src} alt={alt} {...dims} loading="lazy" decoding="async"
        onError={() => setFailed(true)} />
    );
  }
  const hue = (id * 47) % 360;
  return (
    <div
      className="cover cover-ph"
      style={{ ...(fill ? {} : { width: size, height: size }), ['--h' as string]: hue }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    />
  );
}
