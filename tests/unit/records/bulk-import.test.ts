import { describe, expect, it } from 'vitest';
import {
  formatRecordsExport,
  parseRecordsImport,
  recordImportHeader,
  recordNaturalKey,
  type RecordExportRow,
} from '@/lib/records/bulk-import';

function tsv(rows: string[][]): string {
  return rows.map((cells) => cells.join('\t')).join('\n');
}

const header = recordImportHeader();

describe('parseRecordsImport', () => {
  it('parses a valid tab-separated block and normalises the enum columns', () => {
    const text = tsv([
      header.split('\t'),
      ['England', 'John Smith', '-83 kg', 'M', 'Squat', 'Open', '280.5', '2024-01-15', 'Unequipped'],
      ['Scotland', 'Emma Wilson', '-63 kg', 'Female', 'Deadlift', 'Open', '195', '2023-11-20', 'Equipped'],
    ]);

    const rows = parseRecordsImport(text);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      region: 'England',
      name: 'John Smith',
      weightClass: '-83 kg',
      gender: 'M',
      lift: 'squat',
      ageCategory: 'Open',
      weightKg: 280.5,
      dateSet: '2024-01-15',
      equipment: 'unequipped',
      errors: [],
    });
    expect(rows[0].warnings).toEqual([]);

    expect(rows[1]).toMatchObject({ gender: 'F', lift: 'deadlift', equipment: 'equipped', weightKg: 195 });
  });

  it('skips a pasted-back header row and blank lines', () => {
    const text = [header, '', '   '].join('\n');
    expect(parseRecordsImport(text)).toHaveLength(0);
  });

  it('accepts lift and equipment aliases', () => {
    const text = tsv([
      ['Wales', 'Bench Specialist', '105kg', 'm', 'Bench Press A/C', 'M1', '185', '2024-02-10', 'Raw'],
      ['Wales', 'Classic Lifter', '105kg', 'M', 'bench_press', 'Open', '180', '', 'Classic'],
      ['Wales', 'Parenthesised', '105kg', 'M', 'Bench Press (A/C)', 'Open', '175', '', 'Equipped'],
    ]);
    const rows = parseRecordsImport(text);
    expect(rows[0]).toMatchObject({ gender: 'M', lift: 'bench_press_ac', equipment: 'unequipped' });
    expect(rows[1]).toMatchObject({ lift: 'bench_press', equipment: 'unequipped', dateSet: null });
    expect(rows[2]).toMatchObject({ lift: 'bench_press_ac', equipment: 'equipped' });
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual([]);
    expect(rows[2].errors).toEqual([]);
  });

  it('flags blocking errors for missing and unrecognised values', () => {
    const text = tsv([
      ['', 'No Region', '83kg', 'M', 'Squat', 'Open', '300', '2024-01-15', 'Unequipped'],
      ['England', 'Bad Gender', '83kg', 'X', 'Squat', 'Open', '300', '2024-01-15', 'Unequipped'],
      ['England', 'Bad Lift', '83kg', 'M', 'Clean', 'Open', '300', '2024-01-15', 'Unequipped'],
      ['England', 'Bad Weight', '83kg', 'M', 'Squat', 'Open', 'heavy', '2024-01-15', 'Unequipped'],
      ['England', 'Bad Date', '83kg', 'M', 'Squat', 'Open', '300', '32/13/2024', 'Unequipped'],
    ]);
    const rows = parseRecordsImport(text);
    expect(rows[0].errors).toContain('Region is required.');
    expect(rows[1].errors).toContain('Unrecognised gender "X".');
    expect(rows[2].errors).toContain('Unrecognised lift "Clean".');
    expect(rows[3].errors).toContain('Record must be a positive number.');
    expect(rows[4].errors).toContain('Invalid date set.');
  });

  it('warns (without blocking) on an unusual weight class or age category', () => {
    const text = tsv([
      ['England', 'Odd Class', '999kg', 'M', 'Squat', 'Veteran', '300', '2024-01-15', 'Unequipped'],
    ]);
    const [row] = parseRecordsImport(text);
    expect(row.errors).toEqual([]);
    expect(row.warnings).toEqual([
      'Unusual weight class "999kg" for male.',
      'Unusual age category "Veteran".',
    ]);
  });

  it('parses day-first dates common in UK spreadsheets', () => {
    const text = tsv([
      ['England', 'Day First', '83kg', 'M', 'Total', 'Open', '700', '15/01/2024', 'Unequipped'],
    ]);
    expect(parseRecordsImport(text)[0].dateSet).toBe('2024-01-15');
  });

  it('falls back to comma-separated when there are no tabs', () => {
    const text = 'England,Comma Sep,83kg,M,Squat,Open,300,2024-01-15,Unequipped';
    expect(parseRecordsImport(text)[0]).toMatchObject({ name: 'Comma Sep', lift: 'squat', weightKg: 300 });
  });
});

describe('recordNaturalKey', () => {
  it('is case- and whitespace-insensitive on the text columns and ignores the holder name', () => {
    const a = recordNaturalKey({
      region: 'England',
      gender: 'M',
      weightClass: '83kg',
      ageCategory: 'Open',
      lift: 'squat',
      equipment: 'unequipped',
    });
    const b = recordNaturalKey({
      region: '  england ',
      gender: 'M',
      weightClass: '83KG',
      ageCategory: 'open',
      lift: 'squat',
      equipment: 'unequipped',
    });
    expect(a).toBe(b);
  });
});

describe('formatRecordsExport', () => {
  it('round-trips through parseRecordsImport', () => {
    const rows: RecordExportRow[] = [
      {
        region: 'England',
        name: 'John Smith',
        weightClass: '83kg',
        gender: 'M',
        lift: 'bench_press_ac',
        ageCategory: 'Open',
        weightKg: 200.5,
        dateSet: '2024-01-15',
        equipment: 'equipped',
      },
      {
        region: 'Scotland',
        name: 'Emma Wilson',
        weightClass: '63kg',
        gender: 'F',
        lift: 'total',
        ageCategory: 'M1',
        weightKg: 460,
        dateSet: null,
        equipment: 'unequipped',
      },
    ];

    const parsed = parseRecordsImport(formatRecordsExport(rows));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      region: 'England',
      name: 'John Smith',
      gender: 'M',
      lift: 'bench_press_ac',
      weightKg: 200.5,
      dateSet: '2024-01-15',
      equipment: 'equipped',
      errors: [],
    });
    expect(parsed[1]).toMatchObject({ gender: 'F', lift: 'total', weightKg: 460, dateSet: null, equipment: 'unequipped' });
  });
});
