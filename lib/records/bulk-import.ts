import {
  RECORD_AGE_CATEGORIES,
  RECORD_WEIGHT_CLASSES,
  type RecordEquipment,
  type RecordGender,
  type RecordLift,
} from '@/lib/constants';
import { roundToOneDecimal } from '@/lib/number-input';

// Bulk records entry via copy-paste: the admin keeps records in a Google Sheet (the same nine
// columns the source BPRecords dataset uses), then pastes the cells here. Google Sheets copies as
// tab-separated text, so this module turns that text into validated rows. Pure functions only —
// shared by the preview UI and the server action so both parse identically.

export type RecordImportField =
  | 'region'
  | 'name'
  | 'weightClass'
  | 'gender'
  | 'lift'
  | 'ageCategory'
  | 'record'
  | 'dateSet'
  | 'equipment';

export type RecordImportColumn = { key: RecordImportField; label: string };

// Fixed column order, matching the source dataset's CSV columns so an admin can paste their existing
// sheet unchanged.
export const RECORD_IMPORT_COLUMNS: readonly RecordImportColumn[] = [
  { key: 'region', label: 'Region' },
  { key: 'name', label: 'Name' },
  { key: 'weightClass', label: 'Weight Class' },
  { key: 'gender', label: 'Gender' },
  { key: 'lift', label: 'Lift' },
  { key: 'ageCategory', label: 'Age Category' },
  { key: 'record', label: 'Record' },
  { key: 'dateSet', label: 'Date Set' },
  { key: 'equipment', label: 'Equipment' },
];

export function recordImportHeader(): string {
  return RECORD_IMPORT_COLUMNS.map((column) => column.label).join('\t');
}

export type ParsedRecordRow = {
  line: number;
  region: string;
  name: string;
  weightClass: string;
  gender: RecordGender | null;
  lift: RecordLift | null;
  ageCategory: string;
  weightKg: number | null;
  dateSet: string | null;
  equipment: RecordEquipment | null;
  // Non-blocking notices (an unknown weight class / age category still imports), mirroring the
  // entries import: the category columns are free text, so an unrecognised value is flagged, not refused.
  warnings: string[];
  // Blocking problems — a row with any error is skipped on import.
  errors: string[];
};

function normalizeGender(raw: string): RecordGender | null {
  const value = raw.trim().toLowerCase();
  if (value === 'm' || value === 'male') {
    return 'M';
  }
  if (value === 'f' || value === 'female') {
    return 'F';
  }
  return null;
}

function normalizeLift(raw: string): RecordLift | null {
  // Collapse separators/parentheses so "Bench Press", "bench_press", "Bench Press (A/C)" and
  // "bench press a/c" all match.
  const value = raw
    .trim()
    .toLowerCase()
    .replaceAll(/[()]/g, '')
    .replaceAll(/[\s_]+/g, ' ')
    .trim();
  switch (value) {
    case 'squat': {
      return 'squat';
    }
    case 'bench': {
      return 'bench_press';
    }
    case 'bench press': {
      return 'bench_press';
    }
    case 'bench press ac':
    case 'bench press a/c':
    case 'bench press a c': {
      return 'bench_press_ac';
    }
    case 'deadlift': {
      return 'deadlift';
    }
    case 'total': {
      return 'total';
    }
    default: {
      return null;
    }
  }
}

function normalizeEquipment(raw: string): RecordEquipment | null {
  const value = raw.trim().toLowerCase();
  if (value === 'equipped') {
    return 'equipped';
  }
  // Common aliases for unequipped lifting.
  if (value === 'unequipped' || value === 'raw' || value === 'classic') {
    return 'unequipped';
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

// Google Sheets pastes as tab-separated; fall back to commas if the block has no tabs at all.
function detectDelimiter(text: string): string {
  return text.includes('\t') ? '\t' : ',';
}

function cellAt(cells: string[], index: number): string {
  return cells[index] ?? '';
}

export function parseRecordsImport(text: string): ParsedRecordRow[] {
  const delimiter = detectDelimiter(text);
  const rows: ParsedRecordRow[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (rawLine.trim() === '') {
      continue;
    }

    const cells = rawLine.split(delimiter);

    // Skip the header row if the admin pasted it back along with the data.
    if (cells[0]?.trim().toLowerCase() === 'region') {
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const region = cellAt(cells, 0).trim();
    if (region === '') {
      errors.push('Region is required.');
    }

    const name = cellAt(cells, 1).trim();
    if (name === '') {
      errors.push('Name is required.');
    }

    const weightClass = cellAt(cells, 2).trim();
    if (weightClass === '') {
      errors.push('Weight class is required.');
    }

    const genderRaw = cellAt(cells, 3);
    const gender = normalizeGender(genderRaw);
    if (genderRaw.trim() === '') {
      errors.push('Gender is required.');
    } else if (gender === null) {
      errors.push(`Unrecognised gender "${genderRaw.trim()}".`);
    }

    const liftRaw = cellAt(cells, 4);
    const lift = normalizeLift(liftRaw);
    if (liftRaw.trim() === '') {
      errors.push('Lift is required.');
    } else if (lift === null) {
      errors.push(`Unrecognised lift "${liftRaw.trim()}".`);
    }

    const ageCategory = cellAt(cells, 5).trim();
    if (ageCategory === '') {
      errors.push('Age category is required.');
    }

    const recordRaw = cellAt(cells, 6);
    const weight = parsePositiveNumber(recordRaw);
    if (recordRaw.trim() === '') {
      errors.push('Record weight is required.');
    } else if (!weight.ok) {
      errors.push('Record must be a positive number.');
    }

    const dateSet = parseFlexibleDate(cellAt(cells, 7));
    if (!dateSet.ok) {
      errors.push('Invalid date set.');
    }

    const equipmentRaw = cellAt(cells, 8);
    const equipment = normalizeEquipment(equipmentRaw);
    if (equipmentRaw.trim() === '') {
      errors.push('Equipment is required.');
    } else if (equipment === null) {
      errors.push(`Unrecognised equipment "${equipmentRaw.trim()}".`);
    }

    // Category warnings (non-blocking): flag values outside the known sets so a typo is visible, but
    // still import them since the columns are free text and historical categories are legitimate.
    if (gender !== null && weightClass !== '' && !RECORD_WEIGHT_CLASSES[gender].includes(weightClass)) {
      warnings.push(`Unusual weight class "${weightClass}" for ${gender === 'M' ? 'male' : 'female'}.`);
    }
    if (ageCategory !== '' && !RECORD_AGE_CATEGORIES.includes(ageCategory)) {
      warnings.push(`Unusual age category "${ageCategory}".`);
    }

    rows.push({
      line: index + 1,
      region,
      name,
      weightClass,
      gender,
      lift,
      ageCategory,
      weightKg: weight.value,
      dateSet: dateSet.value,
      equipment,
      warnings,
      errors,
    });
  }

  return rows;
}

// The natural key that identifies one record (matches the table's unique constraint). Used to detect
// created-vs-updated on import and to de-duplicate within a single paste.
export function recordNaturalKey(row: {
  region: string;
  gender: string;
  weightClass: string;
  ageCategory: string;
  lift: string;
  equipment: string;
}): string {
  return [
    row.region.trim().toLowerCase(),
    row.gender,
    row.weightClass.trim().toLowerCase(),
    row.ageCategory.trim().toLowerCase(),
    row.lift,
    row.equipment,
  ].join('|');
}

// The reverse of the import: dump current records as the same tab-separated layout so the admin can
// pull them into a sheet, edit, and re-import. Round-trips with parseRecordsImport.
export type RecordExportRow = {
  region: string;
  name: string;
  weightClass: string;
  gender: RecordGender;
  lift: RecordLift;
  ageCategory: string;
  weightKg: number;
  dateSet: string | null;
  equipment: RecordEquipment;
};

const LIFT_EXPORT: Record<RecordLift, string> = {
  squat: 'Squat',
  bench_press: 'Bench Press',
  bench_press_ac: 'Bench Press (A/C)',
  deadlift: 'Deadlift',
  total: 'Total',
};

const EQUIPMENT_EXPORT: Record<RecordEquipment, string> = {
  equipped: 'Equipped',
  unequipped: 'Unequipped',
};

function exportValue(row: RecordExportRow, key: RecordImportField): string {
  switch (key) {
    case 'region': {
      return row.region;
    }
    case 'name': {
      return row.name;
    }
    case 'weightClass': {
      return row.weightClass;
    }
    case 'gender': {
      return row.gender;
    }
    case 'lift': {
      return LIFT_EXPORT[row.lift];
    }
    case 'ageCategory': {
      return row.ageCategory;
    }
    case 'record': {
      return String(row.weightKg);
    }
    case 'dateSet': {
      return row.dateSet ?? '';
    }
    case 'equipment': {
      return EQUIPMENT_EXPORT[row.equipment];
    }
  }
}

export function formatRecordsExport(rows: RecordExportRow[]): string {
  const body = rows.map((row) => RECORD_IMPORT_COLUMNS.map((column) => exportValue(row, column.key)).join('\t'));
  return [recordImportHeader(), ...body].join('\n');
}
