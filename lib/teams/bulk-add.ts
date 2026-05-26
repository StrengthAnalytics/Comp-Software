// Bulk add teams by pasting one name per line. Pure parser shared by the preview UI and the server
// action so both count names identically. Tolerates an accidental extra column (takes the text
// before the first tab) and drops blank lines; order is preserved.
export function parseTeamNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => (line.split('\t')[0] ?? '').trim())
    .filter((name) => name !== '');
}
