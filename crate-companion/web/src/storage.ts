/** localStorage helpers that never throw (private mode, blocked storage, etc). */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`crate:${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(`crate:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}
