import { describe, expect, it } from 'vitest';
import { buildRotaContactsCsv, type RotaContactRow } from '@/lib/rota/export-csv';

const row: RotaContactRow = {
  day: 'Sat',
  section: 'AM',
  role: 'MC',
  arriveBy: '9:30am',
  name: 'Mike R',
  email: 'mike@example.com',
  phone: '07700900000',
  signedUpAt: '2026-06-15T10:00:00Z',
};

describe('buildRotaContactsCsv', () => {
  it('starts with the header row', () => {
    expect(buildRotaContactsCsv([])).toBe('Day,Column,Role,Arrive by,Name,Email,Phone,Signed up at');
  });

  it('writes one line per contact, with nulls as empty fields', () => {
    const csv = buildRotaContactsCsv([{ ...row, day: null, arriveBy: null, signedUpAt: null }]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(',AM,MC,,Mike R,mike@example.com,07700900000,');
  });

  it('quotes fields containing a comma, quote or newline (doubling internal quotes)', () => {
    const csv = buildRotaContactsCsv([{ ...row, name: 'Smith, John', role: 'Say "hi"', section: 'Line1\nLine2' }]);
    const line = csv.split('\r\n')[1];
    expect(line).toContain('"Smith, John"');
    expect(line).toContain('"Say ""hi"""');
    expect(line).toContain('"Line1\nLine2"');
  });
});
