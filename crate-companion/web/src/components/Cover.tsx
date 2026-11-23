import { useState } from 'react';
import { api } from '../api';

export const imageUrl = api.coverUrl;

/**
 * Album artwork, square, filling its container. When there's no image or it fails to load,
 * a drawn record label stands in, tinted from the release id so covers stay distinguishable.
 * `alt` describes the record; leave it empty when the title is already printed beside it.
 */
export function Cover({ src, id, alt = '', className = '' }: { src?: string | null; id: number; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src);
  if (url && !failed) {
    return <img className={`cover ${className}`} src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <div className={`cover cover-ph ${className}`} style={{ ['--h' as string]: (id * 47) % 360 }}
      role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} />
  );
}
