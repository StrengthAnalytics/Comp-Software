import { z } from 'zod';
import { RECORD_EQUIPMENTS, RECORD_GENDERS, RECORD_LIFTS } from '@/lib/constants';
import { normalizeRecordWeightClass } from '@/lib/records/weight-class';
import { roundToOneDecimal } from '@/lib/number-input';

// Blank string → null, so the optional date clears cleanly when the operator empties the field.
const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .nullable(),
);

const optionalNotes = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(500, 'Notes are too long.').nullable(),
);

// numeric(6,1) in the schema: up to 99999.9, stored to one decimal place. A record always has a
// weight, so this is required (not nullable) unlike the comp opener/bodyweight fields.
const weightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(99_999.9, 'Weight is too large.')
  .transform(roundToOneDecimal);

// The shared shape of a record. weight_class and age_category are validated only as non-empty
// strings here (not against the constant lists) so a legitimate historical or non-standard category
// is never rejected at the boundary; the admin UI and the bulk-import preview surface unknown values
// as warnings, mirroring how the entries bulk import treats unmatched division/class names.
export const recordInputSchema = z.object({
  region: z.string().trim().min(1, 'Region is required.').max(80, 'Region is too long.'),
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
  gender: z.enum(RECORD_GENDERS),
  // Normalised to the seeded format ("83kg" → "-83 kg") so a class entered in shorthand still matches
  // the canonical list and is stored consistently.
  weightClass: z
    .string()
    .trim()
    .min(1, 'Weight class is required.')
    .max(20, 'Weight class is too long.')
    .transform(normalizeRecordWeightClass),
  ageCategory: z
    .string()
    .trim()
    .min(1, 'Age category is required.')
    .max(40, 'Age category is too long.'),
  lift: z.enum(RECORD_LIFTS),
  equipment: z.enum(RECORD_EQUIPMENTS),
  weightKg,
  dateSet: optionalDate,
  notes: optionalNotes,
});

export type RecordInput = z.infer<typeof recordInputSchema>;

export const recordUpdateSchema = recordInputSchema.extend({
  id: z.uuid(),
});

export type RecordUpdateInput = z.infer<typeof recordUpdateSchema>;

export const recordDeleteSchema = z.object({
  id: z.uuid(),
});
