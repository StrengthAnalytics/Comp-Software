// Escapes a value for use in a PostgREST like/ilike pattern so it matches LITERALLY.
//
// Three characters are special: % and _ are SQL LIKE wildcards (backslash-escaped to match
// literally), and \ is the escape character itself. PostgREST additionally translates * to %
// before the query runs, so a literal * is escaped too — after translation it arrives as \%,
// which can no longer widen the match (the safe failure mode: a name containing * may fail to
// match, never over-match).
//
// This matters most where the matched value is PUBLIC input: an entry-form submission's name must
// never be able to widen an ilike lookup into matching a different lifter's row.
export function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('%', String.raw`\%`)
    .replaceAll('_', String.raw`\_`)
    .replaceAll('*', String.raw`\*`);
}
