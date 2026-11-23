/** Release thumbnail, or a generated "record label" placeholder when Discogs has none. */
export function Cover({ src, id, size = 56 }: { src?: string; id: number; size?: number }) {
  if (src && !src.includes('spacer.gif')) {
    return <img className="cover" src={src} alt="" width={size} height={size} loading="lazy" />;
  }
  const hue = (id * 47) % 360;
  return (
    <div className="cover cover-ph" style={{ width: size, height: size, ['--h' as string]: hue }} aria-hidden>
      <span />
    </div>
  );
}
