import type { Database } from '@/types/database.types';

type KitType = Database['public']['Enums']['kit_type'];
type EventType = Database['public']['Enums']['event_type'];
type CompStatus = Database['public']['Enums']['comp_status'];
type EntryStatus = Database['public']['Enums']['entry_status'];
type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

export type Gender = 'male' | 'female';

// Human-readable labels for the comp enums. Used by selects and read-only displays so the
// label text lives in one place rather than being re-derived per screen.
export const KIT_TYPE_LABELS: Record<KitType, string> = {
  classic: 'Classic',
  equipped: 'Equipped',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  full_power: 'Full Power (SBD)',
  bench_only: 'Bench Only',
  deadlift_only: 'Deadlift Only',
};

export const COMP_STATUS_LABELS: Record<CompStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  active: 'Active',
  completed: 'Completed',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
};

export const LIFT_LABELS: Record<LiftType, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
};

// Live scorekeeping vocabulary ----------------------------------------------------------------

// Three attempts per lift (3 squats, 3 benches, 3 deadlifts). A lifter's "round" is the attempt
// number they are on; within a round the platform runs in rising-bar order (weight ascending).
export const ATTEMPTS_PER_LIFT = 3;

export const ATTEMPT_RESULT_LABELS: Record<AttemptResult, string> = {
  pending: 'Pending',
  good_lift: 'Good lift',
  no_lift: 'No lift',
  not_taken: 'Not taken',
  withdrawn: 'Withdrawn',
};

// Squat rack position and bench spotting choices, captured at weigh-in (or later at the platform).
// The tuples mirror the matching Postgres enums; labels render in the all-caps house style.
export const SQUAT_RACK_SETTINGS = ['in', 'out', 'left_in', 'right_in'] as const;
export type SquatRackSetting = (typeof SQUAT_RACK_SETTINGS)[number];

export const SQUAT_RACK_SETTING_LABELS: Record<SquatRackSetting, string> = {
  in: 'IN',
  out: 'OUT',
  left_in: 'LEFT IN',
  right_in: 'RIGHT IN',
};

export const BENCH_SPOTTINGS = ['self', 'hand_out'] as const;
export type BenchSpotting = (typeof BENCH_SPOTTINGS)[number];

export const BENCH_SPOTTING_LABELS: Record<BenchSpotting, string> = {
  self: 'SELF',
  hand_out: 'HAND OUT',
};

// Entry lifecycle, in the order an entry moves through a meet day.
export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  registered: 'Registered',
  checked_in: 'Checked in',
  weighed_in: 'Weighed in',
  lifting: 'Lifting',
  finished: 'Finished',
  withdrawn: 'Withdrawn',
  disqualified: 'Disqualified',
};

// Operational cap on flight size. IPF flights run ~8-14 lifters; past this the flight is too long
// to run smoothly, so the flights screen warns the operator to rebalance.
export const MAX_FLIGHT_SIZE = 14;

// Which of the three lifts a competition contests, by event type. Drives which opener and rack
// fields a registration screen shows. Bench-only and deadlift-only meets omit the others.
export type Lifts = { squat: boolean; bench: boolean; deadlift: boolean };

export const LIFTS_FOR_EVENT: Record<EventType, Lifts> = {
  full_power: { squat: true, bench: true, deadlift: true },
  bench_only: { squat: false, bench: true, deadlift: false },
  deadlift_only: { squat: false, bench: false, deadlift: true },
};

// Object.keys() widens to string[], but each label map is keyed by exactly its enum's members,
// so narrowing the result back to the enum union is sound.
export const KIT_TYPES = Object.keys(KIT_TYPE_LABELS) as KitType[];
export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];
export const COMP_STATUSES = Object.keys(COMP_STATUS_LABELS) as CompStatus[];
export const GENDERS = Object.keys(GENDER_LABELS) as Gender[];
export const ENTRY_STATUSES = Object.keys(ENTRY_STATUS_LABELS) as EntryStatus[];

// Default IPF age divisions, in competition running order. Used by the "seed defaults" action.
export const DEFAULT_DIVISIONS: readonly string[] = [
  'Sub-Junior',
  'Junior',
  'Open',
  'Masters 1',
  'Masters 2',
  'Masters 3',
  'Masters 4',
];

export type WeightClassSeed = {
  name: string;
  gender: Gender;
  // lower_kg is an exclusive lower bound, upper_kg an inclusive upper bound. upper_kg null = unlimited.
  lower_kg: number;
  upper_kg: number | null;
};

// Default IPF classic open weight classes, in running order per gender.
export const DEFAULT_WEIGHT_CLASSES: readonly WeightClassSeed[] = [
  { name: '-59 kg', gender: 'male', lower_kg: 0, upper_kg: 59 },
  { name: '-66 kg', gender: 'male', lower_kg: 59, upper_kg: 66 },
  { name: '-74 kg', gender: 'male', lower_kg: 66, upper_kg: 74 },
  { name: '-83 kg', gender: 'male', lower_kg: 74, upper_kg: 83 },
  { name: '-93 kg', gender: 'male', lower_kg: 83, upper_kg: 93 },
  { name: '-105 kg', gender: 'male', lower_kg: 93, upper_kg: 105 },
  { name: '-120 kg', gender: 'male', lower_kg: 105, upper_kg: 120 },
  { name: '120 kg+', gender: 'male', lower_kg: 120, upper_kg: null },
  { name: '-47 kg', gender: 'female', lower_kg: 0, upper_kg: 47 },
  { name: '-52 kg', gender: 'female', lower_kg: 47, upper_kg: 52 },
  { name: '-57 kg', gender: 'female', lower_kg: 52, upper_kg: 57 },
  { name: '-63 kg', gender: 'female', lower_kg: 57, upper_kg: 63 },
  { name: '-69 kg', gender: 'female', lower_kg: 63, upper_kg: 69 },
  { name: '-76 kg', gender: 'female', lower_kg: 69, upper_kg: 76 },
  { name: '-84 kg', gender: 'female', lower_kg: 76, upper_kg: 84 },
  { name: '84 kg+', gender: 'female', lower_kg: 84, upper_kg: null },
];
