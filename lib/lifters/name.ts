// Display name as "Surname, First". Some lifters are mononymous, or imported data carries only one
// name, so a blank surname falls back to the first name alone rather than rendering a stray comma.
export function formatLifterName(surname: string, firstName: string): string {
  return surname.trim() === '' ? firstName.trim() : `${surname}, ${firstName}`;
}
