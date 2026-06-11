import { z } from 'zod';
import {
  BP_DIVISIONS,
  ENTRY_FORM_EVENT_CHOICES,
  ENTRY_FORM_FIELD_STATES,
  ENTRY_FORM_FIELDS,
  ENTRY_FORM_KIT_CHOICES,
  type EntryFormFieldState,
} from '@/lib/constants';
import { isRealIsoDate } from '@/lib/dates';
import { roundToOneDecimal } from '@/lib/number-input';
import { GENDER_VALUES } from '@/types/entry';

// The public entry form's two shapes: the per-comp form design (competitions.entry_form, jsonb)
// and the lifter's submission (entry_submissions). The design decides which optional fields the
// submission asks for and which it requires, so the submission schema is BUILT FROM the design
// (buildSubmissionSchema) — the two can't disagree about what a comp collects.

export const SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const DISCLAIMER_MAX_LENGTH = 5000;

// --- Form design (competitions.entry_form) -------------------------------------------------------

const fieldState = z.enum(ENTRY_FORM_FIELD_STATES);

// Blank and absent both read as "not given": optional fields store null, required fields reject
// with their own message rather than a generic type error.
const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

// Strict shape for the designer's save action: every field must carry a valid state. The tolerant
// read side is parseEntryFormConfig below.
export const entryFormConfigSchema = z.object({
  fields: z.object({
    club: fieldState,
    ipf_member_id: fieldState,
    division: fieldState,
    weight_class: fieldState,
    predicted_total: fieldState,
    recent_best_total: fieldState,
    kit: fieldState,
    event: fieldState,
    instagram: fieldState,
    email: fieldState,
    phone: fieldState,
  }),
  // The declaration the lifter must tick. Null/blank = no disclaimer on this comp's form.
  disclaimer: z.preprocess(
    blankToNull,
    z.string().trim().max(DISCLAIMER_MAX_LENGTH, 'The disclaimer is too long.').nullable(),
  ),
});

export type EntryFormConfig = z.infer<typeof entryFormConfigSchema>;

// What a fresh comp's form asks for until the admin designs it: contactable (email) plus the
// commonly wanted optional details; the comp-specific questions (division, kit, event, instagram,
// phone) start switched off.
export const ENTRY_FORM_DEFAULTS: EntryFormConfig = {
  fields: {
    club: 'optional',
    ipf_member_id: 'optional',
    division: 'off',
    weight_class: 'optional',
    predicted_total: 'optional',
    recent_best_total: 'off',
    kit: 'off',
    event: 'off',
    instagram: 'off',
    email: 'required',
    phone: 'off',
  },
  disclaimer: null,
};

// Reads the entry_form jsonb column. Tolerant per field: the column predates any design ('{}'),
// and a legacy/corrupt value must read as the defaults rather than breaking the public form or
// the designer. Strictness belongs on the write side (entryFormConfigSchema).
export function parseEntryFormConfig(value: unknown): EntryFormConfig {
  const fields = { ...ENTRY_FORM_DEFAULTS.fields };
  let disclaimer: EntryFormConfig['disclaimer'] = ENTRY_FORM_DEFAULTS.disclaimer;

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // Narrowed to a plain object by the checks above; properties are then re-checked individually.
    const raw = value as Record<string, unknown>;
    const rawFields =
      typeof raw.fields === 'object' && raw.fields !== null && !Array.isArray(raw.fields)
        ? // Same plain-object narrowing as above.
          (raw.fields as Record<string, unknown>)
        : {};

    for (const field of ENTRY_FORM_FIELDS) {
      const state = rawFields[field];
      if (typeof state === 'string' && (ENTRY_FORM_FIELD_STATES as readonly string[]).includes(state)) {
        // The includes() check above proves state is one of the field-state literals.
        fields[field] = state as EntryFormFieldState;
      }
    }

    if (typeof raw.disclaimer === 'string' && raw.disclaimer.trim() !== '') {
      disclaimer = raw.disclaimer.trim().slice(0, DISCLAIMER_MAX_LENGTH);
    }
  }

  return { fields, disclaimer };
}

// --- Submission (entry_submissions) ---------------------------------------------------------------

// A toggleable free-text field: 'off' ignores whatever was sent (always null, so a forged value on
// a switched-off field is never stored), 'optional' stores blank as null, 'required' must be filled.
function toggledText(state: EntryFormFieldState, max: number, tooLong: string, requiredMessage: string) {
  if (state === 'off') {
    return z.preprocess(() => null, z.null());
  }
  if (state === 'required') {
    return z.preprocess(
      blankToNull,
      z.string({ message: requiredMessage }).trim().min(1, requiredMessage).max(max, tooLong),
    );
  }
  return z.preprocess(blankToNull, z.string().trim().max(max, tooLong).nullable());
}

// A toggleable fixed-choice field (division / kit / event), same off/optional/required semantics.
function toggledEnum<const T extends readonly [string, ...string[]]>(
  state: EntryFormFieldState,
  values: T,
  requiredMessage: string,
) {
  if (state === 'off') {
    return z.preprocess(() => null, z.null());
  }
  if (state === 'required') {
    return z.preprocess(blankToNull, z.enum(values, { message: requiredMessage }));
  }
  return z.preprocess(blankToNull, z.enum(values, { message: requiredMessage }).nullable());
}

// Instagram handles are commonly pasted with the leading @ — strip it and validate the rest. A
// required field's blank submission arrives as null (blankToNull), so the base string schema's
// message doubles as the required-field message.
function instagramHandle(requiredMessage: string) {
  return z
    .string({ message: requiredMessage })
    .trim()
    .transform((value) => value.replace(/^@+/, ''))
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .max(60, 'Instagram handle is too long.')
        .regex(/^[\w.]+$/, 'Enter just the handle — letters, numbers, dots and underscores.'),
    );
}

function toggledInstagram(state: EntryFormFieldState) {
  if (state === 'off') {
    return z.preprocess(() => null, z.null());
  }
  if (state === 'required') {
    return z.preprocess(blankToNull, instagramHandle('Enter your Instagram handle.'));
  }
  return z.preprocess(blankToNull, instagramHandle('Enter your Instagram handle.').nullable());
}

// A toggleable kg-total question (predicted total / best recent total), named so each field's
// messages read naturally.
function toggledTotalKg(state: EntryFormFieldState, noun: string) {
  if (state === 'off') {
    return z.preprocess(() => null, z.null());
  }
  const capitalised = noun.charAt(0).toUpperCase() + noun.slice(1);
  // Kg to 1 dp like every lift weight; clients convert a blank input to null before calling.
  const total = z
    .number({ message: `Enter your ${noun} in kg.` })
    .gt(0, `${capitalised} must be greater than zero.`)
    .max(9999.9, `${capitalised} is too large.`)
    .transform(roundToOneDecimal);
  return state === 'required'
    ? z.preprocess(blankToNull, total)
    : z.preprocess(blankToNull, total.nullable());
}

function toggledEmail(state: EntryFormFieldState) {
  if (state === 'off') {
    return z.preprocess(() => null, z.null());
  }
  // A required field's blank submission arrives as null (blankToNull), which this message also
  // covers — "enter a valid email address" reads right for both blank and malformed.
  const email = z
    .email({ message: 'Enter a valid email address.' })
    .max(254, 'Email address is too long.');
  return state === 'required'
    ? z.preprocess(blankToNull, email)
    : z.preprocess(blankToNull, email.nullable());
}

// The lifter's date of birth drives age-category auto-assignment at approval, so it must be a real,
// non-future calendar date — mirroring the ipfAgeCategory guard against typo'd years.
const dateOfBirth = z
  .string({ message: 'Enter your date of birth.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth.')
  .refine(isRealIsoDate, 'Enter a valid date of birth.')
  .refine(
    (iso) => iso <= new Date().toISOString().slice(0, 10),
    'Date of birth cannot be in the future.',
  );

// Builds the Zod schema for one comp's public submission from its form design, so the server
// validates exactly what the admin chose to ask: a required field blocks submission when blank, an
// optional one stores blank as null, and a switched-off one is never stored even if sent. The
// weight-class value is the chosen class's display name; whether it matches one of the comp's
// actual classes is checked in the submit action (which has the comp's data), not here.
export function buildSubmissionSchema(config: EntryFormConfig) {
  const f = config.fields;

  return z.object({
    competitionId: z.uuid(),

    // Always collected — the minimum the registration path needs. Surname may be blank for
    // mononymous lifters, matching lifters.surname.
    firstName: z
      .string({ message: 'Enter your first name.' })
      .trim()
      .min(1, 'Enter your first name.')
      .max(80, 'First name is too long.'),
    surname: z.string().trim().max(80, 'Surname is too long.').default(''),
    gender: z.enum(GENDER_VALUES, { message: 'Choose male or female.' }),
    dateOfBirth,

    club: toggledText(f.club, 120, 'Club name is too long.', 'Enter your club.'),
    ipfMemberId: toggledText(
      f.ipf_member_id,
      40,
      'Membership number is too long.',
      'Enter your membership number.',
    ),
    division: toggledEnum(f.division, BP_DIVISIONS, 'Choose your division.'),
    weightClass: toggledText(f.weight_class, 40, 'Weight class is too long.', 'Choose a weight class.'),
    predictedTotalKg: toggledTotalKg(f.predicted_total, 'predicted total'),
    recentBestTotalKg: toggledTotalKg(f.recent_best_total, 'best total from the last 12 months'),
    kitChoice: toggledEnum(f.kit, ENTRY_FORM_KIT_CHOICES, 'Choose Raw or Equipped.'),
    eventChoice: toggledEnum(f.event, ENTRY_FORM_EVENT_CHOICES, 'Choose your event.'),
    instagram: toggledInstagram(f.instagram),
    email: toggledEmail(f.email),
    phone: toggledText(f.phone, 40, 'Phone number is too long.', 'Enter your phone number.'),

    // When the form carries a disclaimer the tick is mandatory; without one the flag is ignored.
    disclaimerAccepted:
      config.disclaimer === null
        ? z.boolean().optional()
        : z.literal(true, { message: 'Please confirm you accept the declaration.' }),
  });
}

export type EntrySubmissionInput = z.infer<ReturnType<typeof buildSubmissionSchema>>;
