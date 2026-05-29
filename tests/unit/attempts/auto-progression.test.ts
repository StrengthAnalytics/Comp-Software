import { describe, expect, it } from 'vitest';
import { autoNextAttemptWeight, nextAttemptCountdown } from '@/lib/attempts/auto-progression';
import { MIN_ATTEMPT_INCREMENT_KG, NEXT_ATTEMPT_TIMER_SECONDS } from '@/lib/constants';

describe('autoNextAttemptWeight', () => {
  it('adds the minimum increment after a good lift', () => {
    expect(autoNextAttemptWeight('good_lift', 100)).toBe(100 + MIN_ATTEMPT_INCREMENT_KG);
    expect(autoNextAttemptWeight('good_lift', 102.5)).toBe(105);
  });

  it('repeats the same weight after a no lift', () => {
    expect(autoNextAttemptWeight('no_lift', 100)).toBe(100);
    expect(autoNextAttemptWeight('no_lift', 87.5)).toBe(87.5);
  });

  it('rounds to one decimal place', () => {
    // 60.1 + 2.5 = 62.6 exactly, but guard against float drift on other values.
    expect(autoNextAttemptWeight('good_lift', 60.1)).toBe(62.6);
  });

  it('has no default for a non-decision or undeclared previous attempt', () => {
    expect(autoNextAttemptWeight('pending', 100)).toBeNull();
    expect(autoNextAttemptWeight('not_taken', 100)).toBeNull();
    expect(autoNextAttemptWeight('withdrawn', 100)).toBeNull();
    expect(autoNextAttemptWeight('good_lift', null)).toBeNull();
    expect(autoNextAttemptWeight(null, 100)).toBeNull();
  });
});

describe('nextAttemptCountdown', () => {
  const decidedAt = '2026-05-29T10:00:00.000Z';
  const expectedDeadline = Date.parse(decidedAt) + NEXT_ATTEMPT_TIMER_SECONDS * 1000;

  it('counts down the next attempt after a decided good lift', () => {
    const result = nextAttemptCountdown(
      { result: 'good_lift', weightKg: 100, decidedAt },
      { weightKg: null },
    );
    expect(result).toEqual({ autoWeight: 102.5, deadlineMs: expectedDeadline });
  });

  it('repeats the weight after a decided no lift', () => {
    const result = nextAttemptCountdown({ result: 'no_lift', weightKg: 140, decidedAt }, { weightKg: null });
    expect(result).toEqual({ autoWeight: 140, deadlineMs: expectedDeadline });
  });

  it('does not count down when the next attempt is already declared', () => {
    expect(
      nextAttemptCountdown({ result: 'good_lift', weightKg: 100, decidedAt }, { weightKg: 105 }),
    ).toBeNull();
  });

  it('does not count down until the previous attempt is decided', () => {
    expect(
      nextAttemptCountdown({ result: 'good_lift', weightKg: 100, decidedAt: null }, { weightKg: null }),
    ).toBeNull();
    expect(nextAttemptCountdown(undefined, { weightKg: null })).toBeNull();
  });

  it('does not count down when the previous result has no automatic default', () => {
    expect(
      nextAttemptCountdown({ result: 'pending', weightKg: 100, decidedAt }, { weightKg: null }),
    ).toBeNull();
  });

  it('returns null for an unparseable decision timestamp', () => {
    expect(
      nextAttemptCountdown({ result: 'good_lift', weightKg: 100, decidedAt: 'not-a-date' }, { weightKg: null }),
    ).toBeNull();
  });
});
