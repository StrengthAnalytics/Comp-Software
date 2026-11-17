import { describe, expect, it } from 'vitest';
import { buildScheduleSchema } from '@/types/schedule';

const valid = {
  competitionId: '11111111-1111-4111-8111-111111111111',
  platforms: ['Platform A'],
  sessions: [
    {
      platformIndex: 0,
      date: '2026-07-11',
      name: 'Session 1',
      liftOffTime: '09:30',
      weighInTime: '07:30',
      flightCount: 2,
    },
  ],
};

describe('buildScheduleSchema', () => {
  it('accepts a schedule the builder would send', () => {
    expect(buildScheduleSchema.safeParse(valid).success).toBe(true);
  });

  it('allows a session without times yet', () => {
    const parsed = buildScheduleSchema.safeParse({
      ...valid,
      sessions: [{ ...valid.sessions[0], liftOffTime: '', weighInTime: '' }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.sessions[0]).toMatchObject({ liftOffTime: null, weighInTime: null });
  });

  it('rejects a session pointing at a platform that was not sent', () => {
    const parsed = buildScheduleSchema.safeParse({
      ...valid,
      sessions: [{ ...valid.sessions[0], platformIndex: 1 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects two platforms with the same name', () => {
    expect(buildScheduleSchema.safeParse({ ...valid, platforms: ['Platform A', 'platform a'] }).success).toBe(false);
  });

  it('rejects an empty schedule and an unnamed session', () => {
    expect(buildScheduleSchema.safeParse({ ...valid, sessions: [] }).success).toBe(false);
    expect(
      buildScheduleSchema.safeParse({ ...valid, sessions: [{ ...valid.sessions[0], name: '  ' }] }).success,
    ).toBe(false);
  });

  it('refuses a session with no flights or a silly number of them', () => {
    expect(
      buildScheduleSchema.safeParse({ ...valid, sessions: [{ ...valid.sessions[0], flightCount: 0 }] }).success,
    ).toBe(false);
    expect(
      buildScheduleSchema.safeParse({ ...valid, sessions: [{ ...valid.sessions[0], flightCount: 99 }] }).success,
    ).toBe(false);
  });
});
