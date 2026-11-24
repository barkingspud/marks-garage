import { describe, expect, it } from 'vitest';
import { groupCredits, plainNotes } from './discogs-text';

describe('plainNotes', () => {
  it('turns Discogs markup into plain text', () => {
    expect(plainNotes('Mixed at [l=Trident Studios] by [a=Ken Scott (2)].\n\n\n[url=https://x.y]Liner notes[/url] [r123]'))
      .toBe('Mixed at Trident Studios by Ken Scott (2).\n\nLiner notes');
    expect(plainNotes('[b]Gatefold[/b] sleeve')).toBe('Gatefold sleeve');
  });
});

describe('groupCredits', () => {
  it('groups by role and tidies names', () => {
    expect(groupCredits([
      { name: 'Ken Scott (2)', role: 'Producer' },
      { name: 'Supertramp', role: 'Producer' },
      { name: 'Rick Davies', anv: 'R. Davies', role: 'Written-By', tracks: 'A1, B2' },
    ])).toEqual([['Producer', ['Ken Scott', 'Supertramp']], ['Written-By', ['R. Davies (A1, B2)']]]);
  });
});
