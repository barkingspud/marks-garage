import { describe, expect, it } from 'vitest';
import { gradeLabels, kindOf, mediaKind } from './formats';

describe('media kinds', () => {
  it('recognizes vinyl, CDs and cassettes in every way Discogs writes them', () => {
    expect(mediaKind(['Vinyl', 'LP', 'Album'])).toBe('vinyl');
    expect(mediaKind(['CD', 'Album'])).toBe('cd');
    expect(mediaKind(['SACD', 'Hybrid'])).toBe('cd');
    expect(mediaKind('Cassette, Album')).toBe('cassette');
    expect(mediaKind('LP, Album, RE')).toBe('vinyl');
    expect(mediaKind('7", Single')).toBe('vinyl');
    expect(mediaKind(['8-Track Cartridge'])).toBe('other');
    expect(mediaKind([])).toBe('other');
    expect(mediaKind(undefined)).toBe('other');
  });

  it('goes by the first recognizable format, so a box set of LPs is vinyl', () => {
    expect(kindOf({ formats: [{ name: 'Box Set' }, { name: 'Vinyl' }, { name: 'CD' }] })).toBe('vinyl');
    expect(kindOf({ formats: [{ name: 'CD' }, { name: 'DVD' }] })).toBe('cd');
  });

  it('names the grades for each kind', () => {
    expect(gradeLabels('vinyl')).toEqual({ media: 'Vinyl', sleeve: 'Sleeve' });
    expect(gradeLabels('cd')).toEqual({ media: 'Disc', sleeve: 'Case' });
    expect(gradeLabels('cassette')).toEqual({ media: 'Tape', sleeve: 'Case' });
    expect(gradeLabels('other').media).toBe('Media');
  });
});
