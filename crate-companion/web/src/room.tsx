import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from './api';

/**
 * The "room": every screen is a dim room tinted by the record in focus.
 * A page calls useRoom(coverUrl) and the shell's background shifts to a deep,
 * desaturated version of that cover's main colour.
 */

type Hsl = { h: number; s: number; l: number };
const DEFAULT: Hsl = { h: 210, s: 40, l: 50 }; // steel blue

const RoomContext = createContext<(c: Hsl | null) => void>(() => {});

export function RoomProvider({ children }: { children: (style: CSSProperties) => ReactNode }) {
  const [tint, setTint] = useState<Hsl | null>(null);
  return <RoomContext.Provider value={setTint}>{children(roomStyle(tint ?? DEFAULT))}</RoomContext.Provider>;
}

/** CSS variables for the room background, from a hue and saturation. */
export function roomStyle({ h, s }: Hsl): CSSProperties {
  const sat = Math.max(14, Math.min(46, s * 0.6));
  return {
    ['--room-0' as string]: `hsl(${h} ${sat}% 24%)`,
    ['--room-1' as string]: `hsl(${h} ${sat}% 15%)`,
    ['--room-2' as string]: `hsl(${h} ${sat}% 9%)`,
    ['--room-3' as string]: `hsl(${h} ${Math.max(10, sat - 8)}% 5%)`,
  };
}

/** Tint the room from a cover image (or a fixed hue for screens without one). */
export function useRoom(cover?: string | null, fallbackHue?: number) {
  const setTint = useContext(RoomContext);
  useEffect(() => {
    let alive = true;
    if (cover) {
      dominantColor(cover).then((c) => { if (alive) setTint(c ?? (fallbackHue !== undefined ? { h: fallbackHue, s: 40, l: 50 } : null)); });
    } else {
      setTint(fallbackHue !== undefined ? { h: fallbackHue, s: 40, l: 50 } : null);
    }
    return () => { alive = false; };
  }, [cover, fallbackHue, setTint]);
}

const cache = new Map<string, Promise<Hsl | null>>();

/** The cover's main colour, favouring saturated pixels over greys. */
export function dominantColor(src: string): Promise<Hsl | null> {
  let p = cache.get(src);
  if (!p) {
    p = api.coverPixelsUrl(src).then((url) => (!url ? null : new Promise<Hsl | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, 24, 24);
          const d = ctx.getImageData(0, 0, 24, 24).data;
          let x = 0, y = 0, sw = 0, wsum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const { h, s, l } = toHsl(d[i]!, d[i + 1]!, d[i + 2]!);
            if (l < 8 || l > 94) continue;
            const w = 0.15 + s / 100; // saturated pixels count more
            x += Math.cos((h * Math.PI) / 180) * w; y += Math.sin((h * Math.PI) / 180) * w;
            sw += s * w; wsum += w;
          }
          if (!wsum) return resolve(null);
          const h = (Math.atan2(y, x) * 180) / Math.PI;
          resolve({ h: Math.round((h + 360) % 360), s: Math.round(sw / wsum), l: 50 });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    })));
    cache.set(src, p);
  }
  return p;
}

function toHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}
