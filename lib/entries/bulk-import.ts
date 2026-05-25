import type { Lifts } from '@/lib/constants';

// Bulk registration via copy-paste: the operator copies these headers into a Google Sheet, fills a
// row per lifter, then pastes the cells back. Google Sheets copies as tab-separated text, so this
// module turns that text into validated rows. Pure functions only — shared by the preview UI and
// the server action so both parse identically.

export type BulkImportField =
  | 'firstName'
  | 'surname'
  | 'gender'
  | 'dateOfBirth'
  | 'membership'
  | 'club'
  | 'country'
  | 'divisionName'
  | 'weightClassName'
  | 'lot'
  | 'bodyweight'
  | 'openerSquat'
  | 'openerBench'
  | 'openerDeadlift';

export type BulkImportColumn = { key: BulkImportField; label: string };

const BASE_COLUMNS: BulkImportColumn[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'surname', label: 'Surname' },
  { key: 'gender', label: 'Gender' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'membership', label: 'Membership number' },
  { key: 'club', label: 'Club' },
  { key: 'country', label: 'Country' },
  { key: 'divisionName', label: 'Division' },
  { key: 'weightClassName', label: 'Weight class' },
  { key: 'lot', label: 'Lot' },
  { key: 'bodyweight', label: 'Bodyweight' },
];

// Opener columns only appear for the lifts the event actually contests.
export function bulkImportColumns(lifts: Lifts): BulkImportColumn[] {
  const columns = [...BASE_COLUMNS];
  if (lifts.squat) {
    columns.push({ key: 'openerSquat', label: 'Opening squat' });
  }
  if (lifts.bench) {
    columns.push({ key: 'openerBench', label: 'Opening bench' });
  }
  if (lifts.deadlift) {
    columns.push({ key: 'openerDeadlift', label: 'Opening deadlift' });
  }
  return columns;
}

export function bulkImportHeader(lifts: Lifts): string {
  return bulkImportColumns(lifts)
    .map((column) => column.label)
    .join('\t');
}

export type ParsedImportRow = {
  line: number;
  firstName: string;
  surname: string;
  gender: 'male' | 'female' | null;
  dateOfBirth: string | null;
  membership: string | null;
  club: string | null;
  country: string | null;
  divisionName: string | null;
  weightClassName: string | null;
  lot: number | null;
  bodyweight: number | null;
  openerSquat: number | null;
  openerBench: number | null;
  openerDeadlift: number | null;
  errors: string[];
};

function normalizeGender(raw: string): 'male' | 'female' | null {
  const value = raw.trim().toLowerCase();
  if (value === 'm' || value === 'male') {
    return 'male';
  }
  if (value === 'f' || value === 'female') {
    return 'female';
  }
  return null;
}

// ISO (YYYY-MM-DD) and day-first formats (DD/MM/YYYY, D-M-YYYY) common in UK spreadsheets.
function parseFlexibleDate(raw: string): { value: string | null; ok: boolean } {
  const value = raw.trim();
  if (value === '') {
    return { value: null, ok: true };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value, ok: true };
  }
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return { value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, ok: true };
    }
  }
  return { value: null, ok: false };
}

function optionalText(raw: string): string | null {
  const value = raw.trim();
  return value === '' ? null : value;
}

function parsePositiveNumber(raw: string): { value: number | null; ok: boolean } {
  const value = raw.trim();
  if (value === '') {
    return { value: null, ok: true };
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { value: null, ok: false };
  }
  return { value: Math.round(parsed * 10) / 10, ok: true };
}

function parsePositiveInt(raw: string): { value: number | null; ok: boolean } {
  const value = raw.trim();
  if (value === '') {
    return { value: null, ok: true };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { value: null, ok: false };
  }
  return { value: parsed, ok: true };
}

// Google Sheets pastes as tab-separated; fall back to commas if the block has no tabs at all.
function detectDelimiter(text: string): string {
  return text.includes('\t') ? '\t' : ',';
}

function cellAt(cells: string[], indexByKey: Map<BulkImportField, number>, key: BulkImportField): string {
  const columnIndex = indexByKey.get(key);
  return columnIndex === undefined ? '' : (cells[columnIndex] ?? '');
}

export function parseBulkImport(text: string, lifts: Lifts): ParsedImportRow[] {
  const columns = bulkImportColumns(lifts);
  const indexByKey = new Map(columns.map((column, index) => [column.key, index]));
  const delimiter = detectDelimiter(text);
  const rows: ParsedImportRow[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (rawLine.trim() === '') {
      continue;
    }

    const cells = rawLine.split(delimiter);

    // Skip the header row if the operator pasted it back along with the data.
    if (cells[0]?.trim().toLowerCase() === 'first name') {
      continue;
    }

    const errors: string[] = [];

    const firstName = cellAt(cells, indexByKey, 'firstName').trim();
    const surname = cellAt(cells, indexByKey, 'surname').trim();
    if (firstName === '') {
      errors.push('First name is required.');
    }
    if (surname === '') {
      errors.push('Surname is required.');
    }

    const genderRaw = cellAt(cells, indexByKey, 'gender');
    const gender = normalizeGender(genderRaw);
    if (genderRaw.trim() === '') {
      errors.push('Gender is required.');
    } else if (gender === null) {
      errors.push(`Unrecognised gender "${genderRaw.trim()}".`);
    }

    const dateOfBirth = parseFlexibleDate(cellAt(cells, indexByKey, 'dateOfBirth'));
    if (!dateOfBirth.ok) {
      errors.push('Invalid date of birth.');
    }

    const lot = parsePositiveInt(cellAt(cells, indexByKey, 'lot'));
    if (!lot.ok) {
      errors.push('Lot must be a positive whole number.');
    }

    const bodyweight = parsePositiveNumber(cellAt(cells, indexByKey, 'bodyweight'));
    if (!bodyweight.ok) {
      errors.push('Bodyweight must be a positive number.');
    }

    const openerSquat = parsePositiveNumber(cellAt(cells, indexByKey, 'openerSquat'));
    if (!openerSquat.ok) {
      errors.push('Opening squat must be a positive number.');
    }
    const openerBench = parsePositiveNumber(cellAt(cells, indexByKey, 'openerBench'));
    if (!openerBench.ok) {
      errors.push('Opening bench must be a positive number.');
    }
    const openerDeadlift = parsePositiveNumber(cellAt(cells, indexByKey, 'openerDeadlift'));
    if (!openerDeadlift.ok) {
      errors.push('Opening deadlift must be a positive number.');
    }

    rows.push({
      line: index + 1,
      firstName,
      surname,
      gender,
      dateOfBirth: dateOfBirth.value,
      membership: optionalText(cellAt(cells, indexByKey, 'membership')),
      club: optionalText(cellAt(cells, indexByKey, 'club')),
      country: optionalText(cellAt(cells, indexByKey, 'country')),
      divisionName: optionalText(cellAt(cells, indexByKey, 'divisionName')),
      weightClassName: optionalText(cellAt(cells, indexByKey, 'weightClassName')),
      lot: lot.value,
      bodyweight: bodyweight.value,
      openerSquat: openerSquat.value,
      openerBench: openerBench.value,
      openerDeadlift: openerDeadlift.value,
      errors,
    });
  }

  return rows;
}
