import { describe, expect, it } from 'vitest';
import { meetsGrade, parseGrade } from './conditions';

describe('parseGrade', () => {
  it('parses Discogs condition strings', () => {
    expect(parseGrade('Mint (M)')).toBe('M');
    expect(parseGrade('Near Mint (NM or M-)')).toBe('NM');
    expect(parseGrade('Very Good Plus (VG+)')).toBe('VG+');
    expect(parseGrade('Good Plus (G+)')).toBe('G+');
    expect(parseGrade('Poor (P)')).toBe('P');
  });
  it('returns null for non-graded sleeves', () => {
    expect(parseGrade('Generic')).toBeNull();
    expect(parseGrade('Not Graded')).toBeNull();
    expect(parseGrade('No Cover')).toBeNull();
    expect(parseGrade('')).toBeNull();
  });
});

describe('meetsGrade', () => {
  it('compares against a minimum', () => {
    expect(meetsGrade('Near Mint (NM or M-)', 'VG+')).toBe(true);
    expect(meetsGrade('Very Good Plus (VG+)', 'VG+')).toBe(true);
    expect(meetsGrade('Very Good (VG)', 'VG+')).toBe(false);
    expect(meetsGrade('Generic', 'P')).toBe(false);
  });
});
