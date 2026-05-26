import { z } from 'zod';

// Blank string → null so optional date/time fields clear cleanly when the operator empties them.
const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .nullable(),
);

// Accepts HH:MM or HH:MM:SS — an <input type="time"> emits the former; Postgres `time` takes both.
const optionalTime = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Enter a valid time.')
    .nullable(),
);

const optionalUuid = z.uuid().nullable();
const sortOrder = z.number().int().min(0);
const name = (max: number) => z.string().trim().min(1, 'Name is required.').max(max, 'Name is too long.');

export const platformInputSchema = z.object({
  competitionId: z.uuid(),
  name: name(60),
});

export const platformUpdateSchema = z.object({
  id: z.uuid(),
  name: name(60),
});

export const sessionInputSchema = z.object({
  competitionId: z.uuid(),
  name: name(80),
  sessionDate: optionalDate,
  startTime: optionalTime,
  platformId: optionalUuid,
  sortOrder: sortOrder.default(0),
});

export const sessionUpdateSchema = z.object({
  id: z.uuid(),
  name: name(80),
  sessionDate: optionalDate,
  startTime: optionalTime,
  platformId: optionalUuid,
  sortOrder,
});

export const flightInputSchema = z.object({
  competitionId: z.uuid(),
  sessionId: z.uuid(),
  name: name(60),
  sortOrder: sortOrder.default(0),
});

export const flightUpdateSchema = z.object({
  id: z.uuid(),
  name: name(60),
  sortOrder,
});

// flightId null = move the lifter back to Unassigned.
export const assignFlightSchema = z.object({
  entryId: z.uuid(),
  competitionId: z.uuid(),
  flightId: z.uuid().nullable(),
});

// Team competitions assign whole teams to flights: every member's entry moves together. flightId
// null = back to Unassigned.
export const assignTeamFlightSchema = z.object({
  teamId: z.uuid(),
  competitionId: z.uuid(),
  flightId: z.uuid().nullable(),
});

export type SessionInput = z.infer<typeof sessionInputSchema>;
export type FlightInput = z.infer<typeof flightInputSchema>;
