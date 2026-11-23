// Discogs grading scale (Goldmine standard), best → worst.
export const MEDIA_GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const;
export type Grade = (typeof MEDIA_GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  M: 'Mint (M)',
  NM: 'Near Mint (NM or M-)',
  'VG+': 'Very Good Plus (VG+)',
  VG: 'Very Good (VG)',
  'G+': 'Good Plus (G+)',
  G: 'Good (G)',
  F: 'Fair (F)',
  P: 'Poor (P)',
};

/** Sleeve values that aren't on the grade scale. */
export type SleeveSpecial = 'Generic' | 'Not Graded' | 'No Cover';

/** Parse a Discogs condition string into a grade, or null for non-graded values. */
export function parseGrade(condition: string | undefined | null): Grade | null {
  if (!condition) return null;
  const m = condition.match(/\(([^)]+)\)\s*$/);
  const code = (m?.[1] ?? condition).trim();
  if (code.startsWith('NM') || code === 'M-') return 'NM';
  return (MEDIA_GRADES as readonly string[]).includes(code) ? (code as Grade) : null;
}

/** Higher is better: M = 7 … P = 0. Unknown = -1. */
export function gradeRank(g: Grade | null): number {
  return g ? MEDIA_GRADES.length - 1 - MEDIA_GRADES.indexOf(g) : -1;
}

/** True if `condition` is at least as good as `minimum`. */
export function meetsGrade(condition: string | undefined, minimum: Grade): boolean {
  return gradeRank(parseGrade(condition)) >= gradeRank(minimum);
}
