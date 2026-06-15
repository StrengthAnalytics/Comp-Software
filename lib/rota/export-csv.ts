// Builds the CSV the admin downloads from the rota's volunteer contact list. Pure (no DOM) so the
// escaping is unit-tested; the rota builder wraps the result in a Blob download.

export type RotaContactRow = {
  day: string | null;
  section: string;
  role: string;
  arriveBy: string | null;
  name: string;
  email: string;
  phone: string;
  signedUpAt: string | null;
};

const HEADERS = ['Day', 'Column', 'Role', 'Arrive by', 'Name', 'Email', 'Phone', 'Signed up at'] as const;

// A cell beginning with one of these is treated as a formula by Excel / Sheets / LibreOffice, so a
// volunteer-supplied value like `=HYPERLINK(...)` could execute when the admin opens the export. We
// neutralise it by prefixing a single quote (OWASP CSV-injection guidance), which forces text —
// spreadsheets hide the quote, so a phone like "+44…" still reads cleanly (and stays text rather than
// being mangled into scientific notation).
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutraliseFormula(value: string): string {
  return value.length > 0 && FORMULA_TRIGGERS.has(value[0]) ? `'${value}` : value;
}

// Neutralise formula injection first, then apply RFC-4180 quoting (a field containing a comma,
// double-quote, or newline is wrapped in double-quotes with any internal quote doubled).
function escapeCsvField(value: string): string {
  const safe = neutraliseFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function buildRotaContactsCsv(rows: RotaContactRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.day ?? '',
        row.section,
        row.role,
        row.arriveBy ?? '',
        row.name,
        row.email,
        row.phone,
        row.signedUpAt ?? '',
      ]
        .map((field) => escapeCsvField(field))
        .join(','),
    );
  }
  return lines.join('\r\n');
}
