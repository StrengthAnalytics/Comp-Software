import type { Database } from '@/types/database.types';

type KitType = Database['public']['Enums']['kit_type'];
type EventType = Database['public']['Enums']['event_type'];
type CompStatus = Database['public']['Enums']['comp_status'];
type EntryStatus = Database['public']['Enums']['entry_status'];
type LiftType = Database['public']['Enums']['lift_type'];
export type RecordLift = Database['public']['Enums']['record_lift'];
export type RecordEquipment = Database['public']['Enums']['record_equipment'];

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

// A lifter has 60 seconds to declare their next attempt once the previous one is decided (IPF). The
// run screen counts this down inside the next attempt's cell from the recorded decision time.
export const NEXT_ATTEMPT_TIMER_SECONDS = 60;

// The smallest legal weight increase. Used as the automatic next-attempt jump after a good lift when
// the 60-second clock expires without a declared weight (a no lift repeats the same weight instead).
export const MIN_ATTEMPT_INCREMENT_KG = 2.5;

// Bar plus collars weight (kg): the fixed load on the bar before any plates. House standard is a
// 20 kg bar with 2.5 kg collars each side (= 25 kg), used for every lifter regardless of sex. The
// loading-crew plate breakdown loads (total − this) ÷ 2 of plates on each side.
export const BAR_AND_COLLARS_KG = 25;

// IPF calibrated competition plates (kg), largest first, that the loading crew has on hand. Each
// denomination can be loaded any number of times per side; the change plates down to 0.25 kg let the
// crew make any legal 0.5 kg-granular attempt. Used by the plate-math breakdown only.
export const IPF_PLATE_WEIGHTS_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25] as const;

// The denominations in IPF_PLATE_WEIGHTS_KG as a union — the single source the loading display's
// colour/height maps are typed against, so a plate added or removed here is a compile error until the
// maps are updated (rather than silently rendering with a fallback size/colour).
export type IpfPlateWeight = (typeof IPF_PLATE_WEIGHTS_KG)[number];

// Kilograms-to-pounds factor, for the secondary lbs figure shown beside a kg weight on the crew
// display. Powerlifting weighs and loads in kg; lbs is informational only.
export const KG_TO_LBS = 2.204_622_621_8;

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

// UK records vocabulary -------------------------------------------------------------------------
//
// Standalone, app-global reference data (the regional/national records browser). These categories
// are deliberately separate from the competition vocabulary above: records use the British
// Powerlifting record nomenclature (bench_press / total as record lifts, M1-M4 master classes,
// 'M'/'F' gender) and the source dataset (StrengthAnalytics/BPRecords), not the comp enums. Keeping
// them apart means a change to the comp model can never silently alter the records dataset.

// Record gender is stored as 'M'/'F' to match the source data and the admins' Google Sheet exports.
export const RECORD_GENDERS = ['M', 'F'] as const;
export type RecordGender = (typeof RECORD_GENDERS)[number];

export const RECORD_GENDER_LABELS: Record<RecordGender, string> = {
  M: 'Male',
  F: 'Female',
};

// The five record lifts (note these differ from the comp lift_type: the bench is named bench_press,
// and there are bench_press_ac (assisted/competition) and total disciplines).
export const RECORD_LIFT_LABELS: Record<RecordLift, string> = {
  squat: 'Squat',
  bench_press: 'Bench Press',
  bench_press_ac: 'Bench Press A/C',
  deadlift: 'Deadlift',
  total: 'Total',
};

export const RECORD_EQUIPMENT_LABELS: Record<RecordEquipment, string> = {
  equipped: 'Equipped',
  unequipped: 'Unequipped',
};

export const RECORD_LIFTS = Object.keys(RECORD_LIFT_LABELS) as RecordLift[];
export const RECORD_EQUIPMENTS = Object.keys(RECORD_EQUIPMENT_LABELS) as RecordEquipment[];

// Record age categories, in age order (British Powerlifting record nomenclature: M1-M4, not the
// comp's "Masters 1-4" division labels).
export const RECORD_AGE_CATEGORIES: readonly string[] = [
  'Sub-Junior',
  'Junior',
  'Open',
  'M1',
  'M2',
  'M3',
  'M4',
];

// IPF/BP bodyweight categories used for records, per gender (includes the youth-only lightest class).
// Stored as free text on the row; these drive the UI dropdowns and import-preview warnings rather
// than being a hard DB constraint, so a legitimate historical class is never rejected outright.
export const RECORD_WEIGHT_CLASSES: Record<RecordGender, readonly string[]> = {
  M: ['53kg', '59kg', '66kg', '74kg', '83kg', '93kg', '105kg', '120kg', '120+kg'],
  F: ['43kg', '47kg', '52kg', '57kg', '63kg', '69kg', '76kg', '84kg', '84+kg'],
};

// Suggested regions for the admin dropdown. The `region` column is free text (the tier — British /
// home nation / sub-national — is implied by the value), so this list is a convenience only and an
// operator can enter any region not listed here.
export const SUGGESTED_RECORD_REGIONS: readonly string[] = [
  'British',
  'England',
  'Scotland',
  'Wales',
  'Northern Ireland',
  'North East',
  'North West',
  'Yorkshire',
  'East Midlands',
  'West Midlands',
  'East',
  'London',
  'South East',
  'South West',
];
