import { useEffect, useState } from 'react';

/** True on screens wide enough for side panels (matches the CSS breakpoint). */
export function useWide(minWidth = 1181) {
  const q = `(min-width: ${minWidth}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}
