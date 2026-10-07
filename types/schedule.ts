import { z } from 'zod';
import {
  MAX_FLIGHTS_PER_SESSION,
  MAX_SCHEDULE_DAYS,
  MAX_SCHEDULE_PLATFORMS,
  MAX_SESSIONS_PER_DAY,
} from '@/lib/constants';
import { optionalTime } from '@/types/flight';

// The guided schedule builder's one-shot create: the platforms to run and every session (with how
// many flights it starts with). Bounded so a crafted request can't create thousands of rows.
const MAX_SCHEDULE_SESSIONS = MAX_SCHEDULE_DAYS * MAX_SCHEDULE_PLATFORMS * MAX_SESSIONS_PER_DAY;

export const buildScheduleSchema = z
  .object({
    competitionId: z.uuid(),
    platforms: z
      .array(z.string().trim().min(1, 'Name each platform.').max(60, 'Platform name is too long.'))
      .min(1)
      .max(MAX_SCHEDULE_PLATFORMS),
    sessions: z
      .array(
        z.object({
          platformIndex: z.number().int().min(0).max(MAX_SCHEDULE_PLATFORMS - 1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.'),
          name: z.string().trim().min(1, 'Name each session.').max(80, 'Session name is too long.'),
          liftOffTime: optionalTime,
          weighInTime: optionalTime,
          flightCount: z.number().int().min(1).max(MAX_FLIGHTS_PER_SESSION),
        }),
      )
      .min(1, 'Add at least one session.')
      .max(MAX_SCHEDULE_SESSIONS),
  })
  .refine((value) => value.sessions.every((session) => session.platformIndex < value.platforms.length), {
    message: 'Choose a platform for every session.',
    path: ['sessions'],
  })
  .refine(
    (value) =>
      new Set(value.platforms.map((name) => name.trim().toLowerCase())).size === value.platforms.length,
    { message: 'Give each platform a different name.', path: ['platforms'] },
  );

export type BuildScheduleInput = z.input<typeof buildScheduleSchema>;
