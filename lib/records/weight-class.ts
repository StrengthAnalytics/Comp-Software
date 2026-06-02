// Normalises a free-text weight class to the seeded IPF format used across the app:
//   "83kg" / "83 kg" / "-83kg"  → "-83 kg"   (an upper-bound class)
//   "120+kg" / "120kg+" / "120+" → "120 kg+"  (the unlimited top class)
// so a class entered in any common shorthand matches the canonical list and isn't falsely flagged as
// "unusual" on import or in the editor. A value with no number is returned unchanged (it will still
// surface as a warning if it isn't a recognised class). Idempotent: a value already in the canonical
// form maps to itself. Pure — shared by the records Zod schema and the bulk-import parser so the
// single-record and bulk paths normalise identically.
export function normalizeRecordWeightClass(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  const match = /\d+(?:\.\d+)?/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  // A "+" anywhere marks the unlimited top class; otherwise it is an upper-bound class.
  return trimmed.includes('+') ? `${match[0]} kg+` : `-${match[0]} kg`;
}
