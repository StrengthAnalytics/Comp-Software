import { describe, expect, it } from 'vitest';
import {
  bulkImportColumns,
  bulkImportHeader,
  formatBulkExport,
  parseBulkImport,
  type ExportRow,
} from '@/lib/entries/bulk-import';

const FULL_POWER = { squat: true, bench: true, deadlift: true };
const BENCH_ONLY = { squat: false, bench: true, deadlift: false };

describe('bulkImportColumns / header', () => {
  it('includes all three openers for a full-power meet', () => {
    const keys = bulkImportColumns(FULL_POWER).map((column) => column.key);
    expect(keys).toContain('openerSquat');
    expect(keys).toContain('openerBench');
    expect(keys).toContain('openerDeadlift');
  });

  it('includes only the bench opener for a bench-only meet', () => {
    const keys = bulkImportColumns(BENCH_ONLY).map((column) => column.key);
    expect(keys).toContain('openerBench');
    expect(keys).not.toContain('openerSquat');
    expect(keys).not.toContain('openerDeadlift');
  });

  it('emits a tab-separated header row', () => {
    expect(bulkImportHeader(FULL_POWER)).toBe(
      'First name\tSurname\tGender\tDate of birth\tMembership number\tClub\tCountry\tDivision\tWeight class\tLot\tBodyweight\tOpening squat\tOpening bench\tOpening deadlift',
    );
  });
});

describe('parseBulkImport', () => {
  it('parses a valid full-power row', () => {
    const text = 'Dana\tSmith\tF\t1995-04-02\tGB123\tBarbell Club\tGBR\tOpen\t-72 kg\t5\t71.5\t100\t60\t130';
    const [row] = parseBulkImport(text, FULL_POWER);
    expect(row.errors).toEqual([]);
    expect(row).toMatchObject({
      firstName: 'Dana',
      surname: 'Smith',
      gender: 'female',
      dateOfBirth: '1995-04-02',
      membership: 'GB123',
      club: 'Barbell Club',
      country: 'GBR',
      divisionName: 'Open',
      weightClassName: '-72 kg',
      lot: 5,
      bodyweight: 71.5,
      openerSquat: 100,
      openerBench: 60,
      openerDeadlift: 130,
    });
  });

  it('skips a pasted header row', () => {
    const text = `${bulkImportHeader(FULL_POWER)}\nDana\tSmith\tFemale\t\t\t\t\t\t\t\t\t\t\t`;
    const rows = parseBulkImport(text, FULL_POWER);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe('Dana');
  });

  it('normalises day-first dates to ISO', () => {
    const text = 'Dana\tSmith\tF\t02/04/1995\t\t\t\t\t\t\t\t\t\t';
    expect(parseBulkImport(text, FULL_POWER)[0].dateOfBirth).toBe('1995-04-02');
  });

  it('flags an unrecognised gender', () => {
    const text = 'Dana\tSmith\tX\t\t\t\t\t\t\t\t\t\t\t';
    expect(parseBulkImport(text, FULL_POWER)[0].errors).toContain('Unrecognised gender "X".');
  });

  it('requires a first name but allows a blank surname', () => {
    const text = '\t\tF\t\t\t\t\t\t\t\t\t\t\t';
    const [row] = parseBulkImport(text, FULL_POWER);
    expect(row.errors).toContain('First name is required.');
    expect(row.errors).not.toContain('Surname is required.');
  });

  it('accepts a row with a first name and no surname', () => {
    const text = 'Madonna\t\tF\t\t\t\t\t\t\t\t\t\t\t';
    const [row] = parseBulkImport(text, FULL_POWER);
    expect(row.errors).toEqual([]);
    expect(row.firstName).toBe('Madonna');
    expect(row.surname).toBe('');
  });

  it('flags a non-numeric bodyweight', () => {
    const text = 'Dana\tSmith\tF\t\t\t\t\t\t\tx\tabc\t\t\t';
    expect(parseBulkImport(text, FULL_POWER)[0].errors).toContain('Bodyweight must be a positive number.');
  });

  it('falls back to comma separation when there are no tabs', () => {
    const text = 'Dana,Smith,F,1995-04-02,,,,Open,-72 kg,5,71.5,100,60,130';
    const [row] = parseBulkImport(text, FULL_POWER);
    expect(row.errors).toEqual([]);
    expect(row.surname).toBe('Smith');
    expect(row.weightClassName).toBe('-72 kg');
  });
});

describe('formatBulkExport', () => {
  const row: ExportRow = {
    firstName: 'Dana',
    surname: 'Smith',
    gender: 'female',
    dateOfBirth: '1995-04-02',
    membership: 'GB123',
    club: 'Barbell Club',
    country: 'GBR',
    divisionName: 'Open',
    weightClassName: '-72 kg',
    lot: 5,
    bodyweight: 71.5,
    openerSquat: 100,
    openerBench: 60,
    openerDeadlift: 130,
  };

  it('starts with the same header row the import expects', () => {
    expect(formatBulkExport([row], FULL_POWER).split('\n')[0]).toBe(bulkImportHeader(FULL_POWER));
  });

  it('renders blank cells for null values', () => {
    const sparse: ExportRow = { ...row, dateOfBirth: null, membership: null, lot: null, bodyweight: null };
    const dataLine = formatBulkExport([sparse], FULL_POWER).split('\n')[1].split('\t');
    expect(dataLine[3]).toBe(''); // Date of birth
    expect(dataLine[9]).toBe(''); // Lot
  });

  it('round-trips back through the parser', () => {
    const text = formatBulkExport([row], FULL_POWER);
    const [parsed] = parseBulkImport(text, FULL_POWER);
    expect(parsed.errors).toEqual([]);
    expect(parsed).toMatchObject({
      firstName: 'Dana',
      surname: 'Smith',
      gender: 'female',
      dateOfBirth: '1995-04-02',
      membership: 'GB123',
      divisionName: 'Open',
      weightClassName: '-72 kg',
      lot: 5,
      bodyweight: 71.5,
      openerSquat: 100,
      openerBench: 60,
      openerDeadlift: 130,
    });
  });
});
