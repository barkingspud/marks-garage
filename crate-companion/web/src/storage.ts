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
export function remove(key: string) {
  try { localStorage.removeItem(`crate:${key}`); } catch { /* ignore */ }
}

/** "just now", "12 minutes ago", "yesterday", "November 3" */
export function whenText(at: number, now = Date.now()) {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = new Date(at);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 1) return 'yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}
