import { z } from 'zod';

const teamName = z.string().trim().min(1, 'Name is required.').max(60, 'Name is too long.');
const sortOrder = z.number().int().min(0);

// The three team roles. Mirrors the lift_type enum; a team has one member per value.
export const TEAM_LIFTS = ['squat', 'bench', 'deadlift'] as const;
export type TeamLift = (typeof TEAM_LIFTS)[number];

export const teamInputSchema = z.object({
  competitionId: z.uuid(),
  name: teamName,
  sortOrder: sortOrder.default(0),
});

export const teamUpdateSchema = z.object({
  id: z.uuid(),
  name: teamName,
  sortOrder,
});

// Assigning an entry to a team role, or clearing it (both null). The team and lift move together to
// satisfy the entries_team_role_together check: a member is never half-assigned.
export const assignTeamSchema = z
  .object({
    entryId: z.uuid(),
    competitionId: z.uuid(),
    teamId: z.uuid().nullable(),
    teamLift: z.enum(TEAM_LIFTS).nullable(),
  })
  .refine((data) => (data.teamId === null) === (data.teamLift === null), {
    message: 'A team assignment needs both a team and a lift.',
  });

export type TeamInput = z.infer<typeof teamInputSchema>;
