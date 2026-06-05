import { z } from 'zod';
import { BENCH_SPOTTINGS, SQUAT_RACK_SETTINGS } from '@/lib/constants';
import { roundToOneDecimal, roundToTwoDecimals } from '@/lib/number-input';

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
// Lift weights (openers) are numeric(5,1) — up to 9999.9, one decimal place, 0.5 kg increments.
const optionalWeightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(9999.9, 'Weight is too large.')
  .transform(roundToOneDecimal)
  .nullable();

// Bodyweight is numeric(5,2) — IPF weigh-in precision (0.01 kg), up to 999.99 — so a class boundary is
// unambiguous (83.00 kg is -83, 83.01 kg is -93). Distinct from openers, which stay at one decimal.
const optionalBodyweightKg = z
  .number()
  .gt(0, 'Weight must be greater than zero.')
  .max(999.99, 'Weight is too large.')
  .transform(roundToTwoDecimals)
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

// Reassigning an entry's weight class on its own (the weigh-in screen moves a lifter up/down a class
// once their bodyweight is recorded). Kept separate from the full entry update so it touches nothing
// else. weightClassId null clears the class.
export const assignWeightClassSchema = z.object({
  entryId: z.uuid(),
  competitionId: z.uuid(),
  weightClassId: z.uuid().nullable(),
});

export const entryUpdateSchema = z.object({
  id: z.uuid(),
  competitionId: z.uuid(),
  weightClassId: optionalUuid,
  divisionId: optionalUuid,
  lotNumber: optionalLotNumber,
  bodyweightKg: optionalBodyweightKg,
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
  bodyweightKg: optionalBodyweightKg,
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

// Editing one lift's rack settings on its own — the run screen lets the head table adjust rack heights
// and settings live without leaving the scoresheet. Kept narrow (like assignWeightClassSchema) and
// keyed by lift so a squat edit touches only the squat rack columns and a bench edit only the bench
// ones; nothing else on the entry is at risk. A null value clears that field.
export const rackSettingsSchema = z.discriminatedUnion('lift', [
  z.object({
    entryId: z.uuid(),
    competitionId: z.uuid(),
    lift: z.literal('squat'),
    rackHeightSquat: optionalRackHeight,
    squatRackSetting: optionalSquatRackSetting,
  }),
  z.object({
    entryId: z.uuid(),
    competitionId: z.uuid(),
    lift: z.literal('bench'),
    rackHeightBench: optionalRackHeight,
    benchSafetyHeight: optionalRackHeight,
    benchSpotting: optionalBenchSpotting,
  }),
]);

export type RackSettingsInput = z.infer<typeof rackSettingsSchema>;

// Recording a lifter's rack heights from the dedicated rack-heights screen (the warm-up room). Like
// weighInSchema this is a deliberate subset of the entry update — only the squat/bench rack columns
// plus the `racks_set` completion marker — so the screen can't clobber the weight class, division, lot
// or weigh-in data. Both lifts are written together (unlike the per-lift rackSettingsSchema the run
// screen uses); a lift the entry doesn't contest comes through as null and is cleared.
export const rackHeightsSchema = z.object({
  entryId: z.uuid(),
  competitionId: z.uuid(),
  rackHeightSquat: optionalRackHeight,
  squatRackSetting: optionalSquatRackSetting,
  rackHeightBench: optionalRackHeight,
  benchSafetyHeight: optionalRackHeight,
  benchSpotting: optionalBenchSpotting,
  racksSet: z.boolean(),
});

export type RackHeightsInput = z.infer<typeof rackHeightsSchema>;
