// Display name as "Surname, First". Some lifters are mononymous, or imported data carries only one
// name, so a blank surname falls back to the first name alone rather than rendering a stray comma.
export function formatLifterName(surname: string, firstName: string): string {
  return surname.trim() === '' ? firstName.trim() : `${surname}, ${firstName}`;
}

// Re-orders a "Surname, First" display name (as produced by formatLifterName) into "First Surname".
// A name with no "Surname, First" comma — mononymous, or a blank surname — is returned unchanged. Lets
// a display flip the name order without needing the first/surname parts plumbed through separately.
export function flipLifterName(name: string): string {
  const separator = name.indexOf(', ');
  if (separator === -1) {
    return name;
  }
  return `${name.slice(separator + 2)} ${name.slice(0, separator)}`;
}
