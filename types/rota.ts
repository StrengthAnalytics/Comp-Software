import { z } from 'zod';
import { MAX_ROTA_SLOT_CAPACITY } from '@/lib/constants';

// Schemas for the volunteer staff rota: the admin-built structure (sections + roles), the per-comp
// rota settings (the open toggle + the withdrawal-contact line), and the public sign-up. The sign-up
// always asks for exactly name + email + mobile — unlike the entry form, whose fields are
// comp-configurable — so its schema is static rather than built from a design.

// Field caps — kept inline here as in types/entry-form.ts; these are validation guards, not business
// rules, so they live with the schema rather than in lib/constants.ts.
export const ROTA_SECTION_TITLE_MAX = 80;
export const ROTA_SECTION_DAY_LABEL_MAX = 40;
export const ROTA_SECTION_SUBTITLE_MAX = 200;
export const ROTA_ROLE_TITLE_MAX = 80;
export const ROTA_ARRIVE_BY_MAX = 40;
export const ROTA_SIGNUP_NAME_MAX = 80;
export const ROTA_SIGNUP_EMAIL_MAX = 254;
export const ROTA_SIGNUP_PHONE_MIN = 6;
export const ROTA_SIGNUP_PHONE_MAX = 30;
export const ROTA_WITHDRAWAL_CONTACT_MAX = 300;

// Blank and absent both read as "not given": an optional text field stores null. Local copy, as in
// types/entry-form.ts, so the rota schemas stay self-contained.
const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

const competitionId = z.uuid();

// --- Rota settings (competitions.rota_open / rota_withdrawal_contact) ------------------------------

// The master "accepting volunteers" toggle, flipped on its own (optimistic) control like the entry
// form's open switch.
export const setRotaOpenSchema = z.object({
  competitionId,
  open: z.boolean(),
});
export type SetRotaOpenInput = z.infer<typeof setRotaOpenSchema>;

// The "email/message … to withdraw or change your slot" line shown on the public board. Blank clears
// it (admin-only edits mean there is no self-service cancel, so this line is how a volunteer reaches
// the organiser).
export const rotaWithdrawalContactSchema = z.object({
  competitionId,
  withdrawalContact: z.preprocess(
    blankToNull,
    z.string().trim().max(ROTA_WITHDRAWAL_CONTACT_MAX, 'That contact line is too long.').nullable(),
  ),
});
export type RotaWithdrawalContactInput = z.infer<typeof rotaWithdrawalContactSchema>;

// --- Structure: sections (a column of the rota grid) ----------------------------------------------

const sectionTitle = z
  .string({ message: 'Enter a heading for this column.' })
  .trim()
  .min(1, 'Enter a heading for this column.')
  .max(ROTA_SECTION_TITLE_MAX, 'That heading is too long.');

const dayLabel = z.preprocess(
  blankToNull,
  z.string().trim().max(ROTA_SECTION_DAY_LABEL_MAX, 'That day label is too long.').nullable(),
);

const subtitle = z.preprocess(
  blankToNull,
  z.string().trim().max(ROTA_SECTION_SUBTITLE_MAX, 'That subtitle is too long.').nullable(),
);

export const rotaSectionCreateSchema = z.object({
  competitionId,
  dayLabel,
  title: sectionTitle,
  subtitle,
});
export type RotaSectionCreateInput = z.infer<typeof rotaSectionCreateSchema>;

export const rotaSectionUpdateSchema = z.object({
  id: z.uuid(),
  dayLabel,
  title: sectionTitle,
  subtitle,
});
export type RotaSectionUpdateInput = z.infer<typeof rotaSectionUpdateSchema>;

// --- Structure: roles (a job within a section, with a slot capacity) ------------------------------

const roleTitle = z
  .string({ message: 'Enter a role title.' })
  .trim()
  .min(1, 'Enter a role title.')
  .max(ROTA_ROLE_TITLE_MAX, 'That role title is too long.');

const arriveBy = z.preprocess(
  blankToNull,
  z.string().trim().max(ROTA_ARRIVE_BY_MAX, 'That arrive-by time is too long.').nullable(),
);

// How many volunteers the role needs (the green slots). Clients send a number; a blank input is
// converted before calling, as with the entry form's kg totals.
const capacity = z
  .number({ message: 'Enter how many people this role needs.' })
  .int('Enter a whole number.')
  .min(1, 'A role needs at least one slot.')
  .max(MAX_ROTA_SLOT_CAPACITY, `A role can have at most ${MAX_ROTA_SLOT_CAPACITY} slots.`);

export const rotaRoleCreateSchema = z.object({
  competitionId,
  sectionId: z.uuid(),
  title: roleTitle,
  arriveBy,
  capacity,
});
export type RotaRoleCreateInput = z.infer<typeof rotaRoleCreateSchema>;

export const rotaRoleUpdateSchema = z.object({
  id: z.uuid(),
  title: roleTitle,
  arriveBy,
  capacity,
});
export type RotaRoleUpdateInput = z.infer<typeof rotaRoleUpdateSchema>;

// --- Public sign-up (rota_signups) ----------------------------------------------------------------

// A volunteer claims a slot. All three contact fields are required — the organiser must be able to
// reach every volunteer — and the name shows publicly while email + phone stay admin-only.
export const rotaSignupSchema = z.object({
  competitionId,
  roleId: z.uuid(),
  name: z
    .string({ message: 'Enter your name.' })
    .trim()
    .min(1, 'Enter your name.')
    .max(ROTA_SIGNUP_NAME_MAX, 'That name is too long.'),
  email: z
    .email({ message: 'Enter a valid email address.' })
    .max(ROTA_SIGNUP_EMAIL_MAX, 'That email address is too long.'),
  phone: z
    .string({ message: 'Enter your mobile number.' })
    .trim()
    .min(ROTA_SIGNUP_PHONE_MIN, 'Enter a valid mobile number.')
    .max(ROTA_SIGNUP_PHONE_MAX, 'That mobile number is too long.')
    .regex(/^[+()\d\s-]+$/, 'Enter a valid mobile number.'),
  // Honeypot: a hidden field real volunteers leave blank. The submit action treats any value as a
  // bot and reports success without storing anything (mirrors the entry form's `website` trap).
  website: z.string().trim().optional(),
});
export type RotaSignupInput = z.infer<typeof rotaSignupSchema>;

// --- Admin add (the rota grid's "+ Add" on an open slot) ------------------------------------------

// Blank optional email/mobile read as null, otherwise they must be valid — the same rules as the
// public sign-up, just not required.
const optionalEmail = z.preprocess(
  blankToNull,
  z.email({ message: 'Enter a valid email address.' }).max(ROTA_SIGNUP_EMAIL_MAX, 'That email address is too long.').nullable(),
);

const optionalPhone = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .min(ROTA_SIGNUP_PHONE_MIN, 'Enter a valid mobile number.')
    .max(ROTA_SIGNUP_PHONE_MAX, 'That mobile number is too long.')
    .regex(/^[+()\d\s-]+$/, 'Enter a valid mobile number.')
    .nullable(),
);

// The admin putting someone in a slot themselves: a name is enough (a regular helper who won't fill
// in a form); email and mobile are optional.
export const rotaAdminSignupSchema = z.object({
  competitionId,
  roleId: z.uuid(),
  name: z
    .string({ message: 'Enter a name.' })
    .trim()
    .min(1, 'Enter a name.')
    .max(ROTA_SIGNUP_NAME_MAX, 'That name is too long.'),
  email: optionalEmail,
  phone: optionalPhone,
});
export type RotaAdminSignupInput = z.infer<typeof rotaAdminSignupSchema>;

// Moving a volunteer to another slot (admin-only).
export const moveRotaSignupSchema = z.object({
  id: z.uuid(),
  roleId: z.uuid(),
});
export type MoveRotaSignupInput = z.infer<typeof moveRotaSignupSchema>;

// Adding the same job to every column at once (the edit-layout "Add a role to every column" form).
export const rotaRoleForAllSchema = z.object({
  competitionId,
  title: roleTitle,
  capacity,
});
export type RotaRoleForAllInput = z.infer<typeof rotaRoleForAllSchema>;

// --- Change requests (the public board's "Request a change" form) ---------------------------------

export const ROTA_CHANGE_CONTACT_MAX = 254;
export const ROTA_CHANGE_MESSAGE_MAX = 1000;

export const ROTA_CHANGE_KINDS = ['drop_out', 'swap', 'other'] as const;
export type RotaChangeKind = (typeof ROTA_CHANGE_KINDS)[number];

export const ROTA_CHANGE_KIND_LABELS: Record<RotaChangeKind, string> = {
  drop_out: 'Drop out of a slot',
  swap: 'Swap to a different slot',
  other: 'Something else',
};

// A volunteer asking the organiser to change their slot — volunteers can't edit the rota
// themselves. The slot is optional ("several slots / not sure"); a swap or "something else" needs a
// message saying what they'd like.
export const rotaChangeRequestSchema = z
  .object({
    competitionId,
    roleId: z.preprocess(blankToNull, z.uuid().nullable()),
    name: z
      .string({ message: 'Enter your name.' })
      .trim()
      .min(1, 'Enter your name.')
      .max(ROTA_SIGNUP_NAME_MAX, 'That name is too long.'),
    contact: z
      .string({ message: 'Enter your email or mobile so the organisers can reply.' })
      .trim()
      .min(ROTA_SIGNUP_PHONE_MIN, 'Enter your email or mobile so the organisers can reply.')
      .max(ROTA_CHANGE_CONTACT_MAX, 'That is too long.'),
    kind: z.enum(ROTA_CHANGE_KINDS, { message: 'Choose what you need.' }),
    message: z.preprocess(
      blankToNull,
      z.string().trim().max(ROTA_CHANGE_MESSAGE_MAX, 'That message is too long.').nullable(),
    ),
    // Honeypot, as on the sign-up form.
    website: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind !== 'drop_out' && value.message === null) {
      context.addIssue({
        code: 'custom',
        path: ['message'],
        message: value.kind === 'swap' ? 'Tell us which slot you would like instead.' : 'Tell us what you need.',
      });
    }
  });
export type RotaChangeRequestInput = z.infer<typeof rotaChangeRequestSchema>;
