import type { Lifts } from '@/lib/constants';
import { roundToOneDecimal, roundToTwoDecimals } from '@/lib/number-input';

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
  | 'ageCategoryName'
  | 'division'
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
  { key: 'ageCategoryName', label: 'Age category' },
  { key: 'division', label: 'Division' },
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
  ageCategoryName: string | null;
  division: string | null;
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
  return { value: roundToOneDecimal(parsed), ok: true };
}

// Bodyweight keeps 2 dp (IPF weigh-in precision), unlike the openers which round to one decimal.
function parseBodyweight(raw: string): { value: number | null; ok: boolean } {
  const value = raw.trim();
  if (value === '') {
    return { value: null, ok: true };
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { value: null, ok: false };
  }
  return { value: roundToTwoDecimals(parsed), ok: true };
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

// Maps each known column to the position it actually occupies in a pasted header row, by matching the
// header label (case- and whitespace-insensitively). Lets the parser align by name rather than fixed
// position, so a sheet whose columns are reordered — or whose layout predates a column, e.g. an older
// export with no "Division" column — still lands each value in the right field instead of silently
// shifting. A header column the layout doesn't know is ignored; a known column the header omits is left
// unmapped (its cells read as blank).
function deriveColumnIndex(
  headerCells: string[],
  labelToKey: Map<string, BulkImportField>,
): Map<BulkImportField, number> {
  const indexByKey = new Map<BulkImportField, number>();
  for (const [columnIndex, cell] of headerCells.entries()) {
    const key = labelToKey.get(cell.trim().toLowerCase());
    if (key !== undefined && !indexByKey.has(key)) {
      indexByKey.set(key, columnIndex);
    }
  }
  return indexByKey;
}

// The reverse of the import: dump current registrations as the same tab-separated layout so the
// operator can pull them back into a sheet, edit, and re-import. Round-trips with parseBulkImport.
export type ExportRow = {
  firstName: string;
  surname: string;
  gender: string;
  dateOfBirth: string | null;
  membership: string | null;
  club: string | null;
  country: string | null;
  ageCategoryName: string | null;
  division: string | null;
  weightClassName: string | null;
  lot: number | null;
  bodyweight: number | null;
  openerSquat: number | null;
  openerBench: number | null;
  openerDeadlift: number | null;
};

function exportGender(gender: string): string {
  if (gender === 'male') {
    return 'Male';
  }
  if (gender === 'female') {
    return 'Female';
  }
  return gender;
}

function numberCell(value: number | null): string {
  return value === null ? '' : String(value);
}

function exportValue(row: ExportRow, key: BulkImportField): string {
  switch (key) {
    case 'firstName': {
      return row.firstName;
    }
    case 'surname': {
      return row.surname;
    }
    case 'gender': {
      return exportGender(row.gender);
    }
    case 'dateOfBirth': {
      return row.dateOfBirth ?? '';
    }
    case 'membership': {
      return row.membership ?? '';
    }
    case 'club': {
      return row.club ?? '';
    }
    case 'country': {
      return row.country ?? '';
    }
    case 'ageCategoryName': {
      return row.ageCategoryName ?? '';
    }
    case 'division': {
      return row.division ?? '';
    }
    case 'weightClassName': {
      return row.weightClassName ?? '';
    }
    case 'lot': {
      return numberCell(row.lot);
    }
    case 'bodyweight': {
      return numberCell(row.bodyweight);
    }
    case 'openerSquat': {
      return numberCell(row.openerSquat);
    }
    case 'openerBench': {
      return numberCell(row.openerBench);
    }
    case 'openerDeadlift': {
      return numberCell(row.openerDeadlift);
    }
  }
}

export function formatBulkExport(rows: ExportRow[], lifts: Lifts): string {
  const columns = bulkImportColumns(lifts);
  const header = columns.map((column) => column.label).join('\t');
  const body = rows.map((row) => columns.map((column) => exportValue(row, column.key)).join('\t'));
  return [header, ...body].join('\n');
}

export function parseBulkImport(text: string, lifts: Lifts): ParsedImportRow[] {
  const columns = bulkImportColumns(lifts);
  const delimiter = detectDelimiter(text);

  // Default to the fixed layout positions; if the paste includes the header row, remap columns by their
  // actual header position so a reordered or older-layout sheet aligns by name rather than position.
  let indexByKey = new Map<BulkImportField, number>(columns.map((column, index) => [column.key, index]));
  const labelToKey = new Map(columns.map((column) => [column.label.trim().toLowerCase(), column.key]));
  const headerRow = text
    .split(/\r?\n/)
    .find((line) => line.split(delimiter)[0]?.trim().toLowerCase() === 'first name');
  if (headerRow) {
    indexByKey = deriveColumnIndex(headerRow.split(delimiter), labelToKey);
  }

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
    // Surname is optional (mononymous lifters / sparse imported data); only the first name is required.
    const surname = cellAt(cells, indexByKey, 'surname').trim();
    if (firstName === '') {
      errors.push('First name is required.');
    }

    const genderRaw = cellAt(cells, indexByKey, 'gender');
    const gender = normalizeGender(genderRaw);
    if (genderRaw.trim() === '') {
      errors.push('Gender is required.');
    } else if (gender === null) {
      errors.push(`Unrecognised gender "${genderRaw.trim()}".`);
    }

    // Date of birth is required: the age category is assigned from (competition year − birth year),
    // so a lifter cannot be registered without it.
    const dateOfBirth = parseFlexibleDate(cellAt(cells, indexByKey, 'dateOfBirth'));
    if (!dateOfBirth.ok) {
      errors.push('Invalid date of birth.');
    } else if (dateOfBirth.value === null) {
      errors.push('Date of birth is required.');
    }

    const lot = parsePositiveInt(cellAt(cells, indexByKey, 'lot'));
    if (!lot.ok) {
      errors.push('Lot must be a positive whole number.');
    }

    const bodyweight = parseBodyweight(cellAt(cells, indexByKey, 'bodyweight'));
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
      ageCategoryName: optionalText(cellAt(cells, indexByKey, 'ageCategoryName')),
      division: optionalText(cellAt(cells, indexByKey, 'division')),
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
