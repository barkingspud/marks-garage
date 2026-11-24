/**
 * Discogs notes use their own markup: [a=Artist], [a123], [l=Label], [r123], [url=…]text[/url],
 * [b]bold[/b]. Turn it into plain text.
 */
export function plainNotes(s: string): string {
  return s
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[(?:a|l|m|r)=([^\]]+)\]/gi, '$1')
    .replace(/\[(?:a|l|m|r)\d+\]/gi, '')
    .replace(/\[\/?(?:b|i|u|s)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Ken Scott (2)" → "Ken Scott"; "Supertramp*" → "Supertramp". Uses the name as credited when given. */
export function creditName(c: { name: string; anv?: string }): string {
  return (c.anv || c.name).replace(/ \(\d+\)$/, '').replace(/\*$/, '');
}

/** Group credits by role: [["Producer", ["Ken Scott"]], …], keeping Discogs's order. */
export function groupCredits(credits: { name: string; anv?: string; role: string; tracks?: string }[]) {
  const m = new Map<string, string[]>();
  for (const c of credits) {
    const role = c.role.trim() || 'Credit';
    const who = creditName(c) + (c.tracks ? ` (${c.tracks})` : '');
    const list = m.get(role) ?? [];
    if (!list.includes(who)) list.push(who);
    m.set(role, list);
  }
  return [...m.entries()];
}
