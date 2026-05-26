import { describe, expect, it } from 'vitest';
import { assignTeamSchema, teamInputSchema } from '@/types/team';

const UUID = '00000000-0000-0000-0000-000000000000';
const OTHER_UUID = '11111111-1111-4111-8111-111111111111';

describe('teamInputSchema', () => {
  it('defaults sort order to 0', () => {
    const result = teamInputSchema.safeParse({ competitionId: UUID, name: 'City Barbell A' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('rejects an empty name', () => {
    expect(teamInputSchema.safeParse({ competitionId: UUID, name: '  ' }).success).toBe(false);
  });
});

describe('assignTeamSchema', () => {
  it('accepts a full assignment', () => {
    expect(
      assignTeamSchema.safeParse({ entryId: UUID, competitionId: OTHER_UUID, teamId: OTHER_UUID, teamLift: 'squat' })
        .success,
    ).toBe(true);
  });

  it('accepts a full clear (both null)', () => {
    expect(
      assignTeamSchema.safeParse({ entryId: UUID, competitionId: OTHER_UUID, teamId: null, teamLift: null }).success,
    ).toBe(true);
  });

  it('rejects a team without a lift', () => {
    expect(
      assignTeamSchema.safeParse({ entryId: UUID, competitionId: OTHER_UUID, teamId: OTHER_UUID, teamLift: null })
        .success,
    ).toBe(false);
  });

  it('rejects a lift without a team', () => {
    expect(
      assignTeamSchema.safeParse({ entryId: UUID, competitionId: OTHER_UUID, teamId: null, teamLift: 'bench' }).success,
    ).toBe(false);
  });

  it('rejects an unknown lift', () => {
    expect(
      assignTeamSchema.safeParse({ entryId: UUID, competitionId: OTHER_UUID, teamId: OTHER_UUID, teamLift: 'curl' })
        .success,
    ).toBe(false);
  });
});
