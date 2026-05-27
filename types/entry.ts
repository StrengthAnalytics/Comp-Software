import { z } from 'zod';
import { BENCH_SPOTTINGS, SQUAT_RACK_SETTINGS } from '@/lib/constants';

// Blank string → null, so optional text fields clear cleanly when the operator empties them.
function optionalText(max: number, tooLong: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, tooLong).nullable(),
  );
}

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .nullable(),
);

// Clients convert blank inputs to null before calling, so these accept a number or null directly.
// numeric(5,1) in the schema: up to 9999.9, stored to one decimal place.
const optionalWeightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(9999.9, 'Weight is too large.')
  .transform((value) => Math.round(value * 10) / 10)
  .nullable();

const optionalLotNumber = z
  .number()
  .int('Lot number must be a whole number.')
  .positive('Lot number must be positive.')
  .nullable();

// Rack and bench heights are hole numbers on the rack — positive whole numbers. Clients convert
// blank inputs to null before calling.
const optionalRackHeight = z
  .number()
  .int('Height must be a whole number.')
  .positive('Height must be positive.')
  .nullable();

const optionalSquatRackSetting = z.enum(SQUAT_RACK_SETTINGS).nullable();
const optionalBenchSpotting = z.enum(BENCH_SPOTTINGS).nullable();

const optionalUuid = z.uuid().nullable();

export const GENDER_VALUES = ['male', 'female'] as const;

const ENTRY_STATUS_VALUES = [
  'registered',
  'checked_in',
  'weighed_in',
  'lifting',
  'finished',
  'withdrawn',
  'disqualified',
] as const;

// The persistent person. Membership number lives here (relabelled in the UI); it changes year to
// year and is overwritten when the lifter re-registers, so only the current value is retained.
export const lifterInputSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.').max(80, 'First name is too long.'),
  // Surname is optional: some lifters are mononymous and older imported data may lack one. Stored as
  // an empty string (the column is NOT NULL); the first name remains required so every lifter has one.
  surname: z.string().trim().max(80, 'Surname is too long.'),
  gender: z.enum(GENDER_VALUES),
  date_of_birth: optionalDate,
  ipf_member_id: optionalText(40, 'Membership number is too long.'),
  club: optionalText(120, 'Club name is too long.'),
  country: optionalText(80, 'Country is too long.'),
});

export type LifterInput = z.infer<typeof lifterInputSchema>;

export const lifterUpdateSchema = lifterInputSchema.extend({
  id: z.uuid(),
});

export const lifterSearchSchema = z.object({
  query: z.string().trim().min(1, 'Enter a surname to search.').max(80, 'Search term is too long.'),
});

// Registering a lifter for a comp. Only the link is required at this point; class, division, lot
// and weigh-in details are filled in afterwards on the same screen via the update schema.
export const createEntrySchema = z.object({
  competitionId: z.uuid(),
  lifterId: z.uuid(),
});

export const entryUpdateSchema = z.object({
  id: z.uuid(),
  competitionId: z.uuid(),
  weightClassId: optionalUuid,
  divisionId: optionalUuid,
  lotNumber: optionalLotNumber,
  bodyweightKg: optionalWeightKg,
  openerSquatKg: optionalWeightKg,
  openerBenchKg: optionalWeightKg,
  openerDeadliftKg: optionalWeightKg,
  rackHeightSquat: optionalRackHeight,
  squatRackSetting: optionalSquatRackSetting,
  rackHeightBench: optionalRackHeight,
  benchSafetyHeight: optionalRackHeight,
  benchSpotting: optionalBenchSpotting,
  status: z.enum(ENTRY_STATUS_VALUES),
});

export type EntryUpdateInput = z.infer<typeof entryUpdateSchema>;

// Recording a lifter's weigh-in. Deliberately a subset of the entry update: it touches only the
// fields captured at the scale (bodyweight, openers, rack heights, status) so the weigh-in screen
// cannot clobber the weight class, division or lot set during registration.
export const weighInSchema = z.object({
  id: z.uuid(),
  competitionId: z.uuid(),
  bodyweightKg: optionalWeightKg,
  openerSquatKg: optionalWeightKg,
  openerBenchKg: optionalWeightKg,
  openerDeadliftKg: optionalWeightKg,
  rackHeightSquat: optionalRackHeight,
  squatRackSetting: optionalSquatRackSetting,
  rackHeightBench: optionalRackHeight,
  benchSafetyHeight: optionalRackHeight,
  benchSpotting: optionalBenchSpotting,
  status: z.enum(ENTRY_STATUS_VALUES),
});

export type WeighInInput = z.infer<typeof weighInSchema>;
