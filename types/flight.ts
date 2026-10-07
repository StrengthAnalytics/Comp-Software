import { z } from 'zod';
import { MAX_FLIGHTS_PER_SESSION } from '@/lib/constants';

// Blank string → null so optional date/time fields clear cleanly when the operator empties them.
const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
    .nullable(),
);

// Accepts HH:MM or HH:MM:SS — an <input type="time"> emits the former; Postgres `time` takes both.
export const optionalTime = z.preprocess(
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

// No sort order: the server keeps sessions in time order (lib/sessions/sequence.ts). `flightCount`
// creates that many lettered flights with the session, so adding a session is one step.
export const sessionInputSchema = z.object({
  competitionId: z.uuid(),
  name: name(80),
  sessionDate: optionalDate,
  weighInTime: optionalTime,
  liftOffTime: optionalTime,
  platformId: optionalUuid,
  flightCount: z.number().int().min(0).max(MAX_FLIGHTS_PER_SESSION).default(0),
});

// No sort order: sessions are kept in time order by the server (lib/sessions/sequence.ts).
export const sessionUpdateSchema = z.object({
  id: z.uuid(),
  name: name(80),
  sessionDate: optionalDate,
  weighInTime: optionalTime,
  liftOffTime: optionalTime,
  platformId: optionalUuid,
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
});

// Moves a flight one place earlier or later within its session (swapping with its neighbour).
export const moveFlightSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  direction: z.enum(['up', 'down']),
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
