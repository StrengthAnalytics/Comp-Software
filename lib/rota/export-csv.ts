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

// RFC-4180: a field containing a comma, double-quote, or newline is wrapped in double-quotes with any
// internal quote doubled.
function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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
