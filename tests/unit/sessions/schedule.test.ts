import { describe, expect, it } from 'vitest';
import { longDayLabel, shortDayLabel } from '@/lib/dates';
import {
  buildDraftRows,
  builderPlatformNames,
  compDays,
  defaultLiftOffTimes,
  flightNames,
  lifterPerFlightEstimate,
  minutesToTime,
  nextFlightName,
  nextPlatformName,
  nextSessionName,
  orderSessionsChronologically,
  sessionDisplayLabels,
  sessionSortOrderUpdates,
  timeToMinutes,
  weighInForLiftOff,
  withLiftOff,
} from '@/lib/sessions/schedule';

describe('times', () => {
  it('reads and writes 24-hour times', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('09:30:00')).toBe(570);
    expect(timeToMinutes('9:30')).toBeNull();
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
    expect(minutesToTime(570)).toBe('09:30');
  });

  it('opens weigh-in two hours before lift-off', () => {
    expect(weighInForLiftOff('09:30')).toBe('07:30');
    expect(weighInForLiftOff('14:00')).toBe('12:00');
    expect(weighInForLiftOff(null)).toBeNull();
  });

  it('keeps an early weigh-in on the same day rather than rolling back to yesterday', () => {
    expect(weighInForLiftOff('01:00')).toBe('00:00');
  });

  it('suggests lift-off times for the number of sessions in a day', () => {
    expect(defaultLiftOffTimes(0)).toEqual([]);
    expect(defaultLiftOffTimes(2)).toEqual(['09:30', '14:30']);
    expect(defaultLiftOffTimes(5)).toEqual(['08:00', '10:30', '13:00', '15:30', '18:00']);
  });
});

describe('compDays', () => {
  it('lists every day of the comp', () => {
    expect(compDays('2026-07-11', '2026-07-12')).toEqual(['2026-07-11', '2026-07-12']);
  });

  it('treats a missing or earlier end date as a one-day comp', () => {
    expect(compDays('2026-07-11', null)).toEqual(['2026-07-11']);
    expect(compDays('2026-07-11', '2026-07-10')).toEqual(['2026-07-11']);
  });

  it('is empty without a real start date', () => {
    expect(compDays(null, '2026-07-12')).toEqual([]);
    expect(compDays('2026-02-31', null)).toEqual([]);
  });

  it('caps a nonsense date range rather than drawing hundreds of days', () => {
    expect(compDays('2026-07-11', '2027-07-11')).toHaveLength(7);
  });

  it('labels a day for people', () => {
    expect(shortDayLabel('2026-07-11')).toBe('Sat');
    expect(longDayLabel('2026-07-11')).toBe('Saturday 11 July');
    expect(longDayLabel(null)).toBeNull();
  });
});

describe('names', () => {
  it('letters flights and numbers sessions', () => {
    expect(flightNames(3)).toEqual(['Flight A', 'Flight B', 'Flight C']);
    expect(nextSessionName([])).toBe('Session 1');
    expect(nextSessionName(['Session 1', 'Session 2'])).toBe('Session 3');
  });

  it('skips a flight name the session already uses, however it is cased', () => {
    expect(nextFlightName(['Flight A', 'flight b'])).toBe('Flight C');
    expect(nextFlightName(['Flight B'])).toBe('Flight A');
  });

  it('letters platforms, skipping a name the comp already has', () => {
    expect(nextPlatformName([])).toBe('Platform A');
    expect(nextPlatformName(['platform a', 'Main'])).toBe('Platform B');
  });

  it('gives the builder the existing platforms first, then fresh names', () => {
    expect(builderPlatformNames([], 2)).toEqual(['Platform A', 'Platform B']);
    expect(builderPlatformNames(['Platform B'], 2)).toEqual(['Platform B', 'Platform A']);
    expect(builderPlatformNames(['Main', 'Side'], 1)).toEqual(['Main']);
  });

  it('keeps a renamed session from blocking the next number', () => {
    expect(nextSessionName(['Women early', 'Session 1'])).toBe('Session 2');
  });
});

describe('the builder draft', () => {
  const days = ['2026-07-11', '2026-07-12'];

  it('makes a row per session with suggested times and flights', () => {
    const rows = buildDraftRows(days, 1, [[2], [1]]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      date: '2026-07-11',
      name: 'Session 1',
      liftOffTime: '09:30',
      weighInTime: '07:30',
      flightCount: 2,
    });
    expect(rows[2]).toMatchObject({ date: '2026-07-12', name: 'Session 1', liftOffTime: '10:00' });
  });

  it('keeps rows the operator already edited when another day changes', () => {
    const first = buildDraftRows(days, 1, [[1], [1]]);
    const edited = first.map((row) => (row.date === '2026-07-11' ? { ...row, name: 'Women' } : row));
    const next = buildDraftRows(days, 1, [[1], [2]], edited);
    expect(next.find((row) => row.date === '2026-07-11')?.name).toBe('Women');
    expect(next.filter((row) => row.date === '2026-07-12')).toHaveLength(2);
  });

  it('gives each platform its own sessions', () => {
    const rows = buildDraftRows(['2026-07-11'], 2, [[2, 1]]);
    expect(rows.map((row) => row.platformIndex)).toEqual([0, 0, 1]);
  });

  it('moves the weigh-in with the lift-off until the operator sets their own', () => {
    const [row] = buildDraftRows(['2026-07-11'], 1, [[1]]);
    expect(withLiftOff(row, '11:00').weighInTime).toBe('09:00');
    const ownTime = { ...row, weighInTime: '06:00' };
    expect(withLiftOff(ownTime, '11:00').weighInTime).toBe('06:00');
    const emptied = { ...row, weighInTime: '' };
    expect(withLiftOff(emptied, '11:00').weighInTime).toBe('09:00');
  });

  it('estimates lifters per flight', () => {
    expect(lifterPerFlightEstimate(64, 4)).toBe(16);
    expect(lifterPerFlightEstimate(64, 0)).toBeNull();
  });
});

type TestSession = {
  id: string;
  name: string;
  session_date: string | null;
  lift_off_time: string | null;
  platform_id: string | null;
};

function session(overrides: Partial<TestSession> = {}): TestSession {
  return {
    id: 'a',
    name: 'Session 1',
    session_date: '2026-07-11',
    lift_off_time: '09:30',
    platform_id: null,
    ...overrides,
  };
}

describe('session order', () => {

  it('runs sessions in date then time order', () => {
    const ordered = orderSessionsChronologically([
      session({ id: 'sun-am', session_date: '2026-07-12', lift_off_time: '09:30' }),
      session({ id: 'sat-pm', lift_off_time: '14:30' }),
      session({ id: 'sat-am', lift_off_time: '09:30' }),
    ]);
    expect(ordered.map((row) => row.id)).toEqual(['sat-am', 'sat-pm', 'sun-am']);
  });

  it('puts sessions without a date or time last', () => {
    const ordered = orderSessionsChronologically([
      session({ id: 'undated', session_date: null, lift_off_time: null }),
      session({ id: 'timed' }),
    ]);
    expect(ordered.map((row) => row.id)).toEqual(['timed', 'undated']);
  });

  it('separates two platforms running at the same time by platform name', () => {
    const platforms = new Map([
      ['p-b', 'Platform B'],
      ['p-a', 'Platform A'],
    ]);
    const ordered = orderSessionsChronologically(
      [session({ id: 'b', platform_id: 'p-b' }), session({ id: 'a', platform_id: 'p-a' })],
      platforms,
    );
    expect(ordered.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('writes a new sort order only for the sessions that moved', () => {
    const rows = [
      { ...session({ id: 'pm', lift_off_time: '14:30' }), sort_order: 0 },
      { ...session({ id: 'am', lift_off_time: '09:30' }), sort_order: 1 },
    ];
    expect(sessionSortOrderUpdates(rows)).toEqual([
      { id: 'am', sort_order: 0 },
      { id: 'pm', sort_order: 1 },
    ]);
  });

  it('writes nothing when the order is already right', () => {
    const rows = [
      { ...session({ id: 'am', lift_off_time: '09:30' }), sort_order: 0 },
      { ...session({ id: 'pm', lift_off_time: '14:30' }), sort_order: 1 },
    ];
    expect(sessionSortOrderUpdates(rows)).toEqual([]);
  });
});

describe('sessionDisplayLabels', () => {
  it('shows a unique name as typed', () => {
    const labels = sessionDisplayLabels([
      { id: '1', name: 'Women', session_date: '2026-07-11', platform_id: null },
      { id: '2', name: 'Men', session_date: '2026-07-11', platform_id: null },
    ]);
    expect(labels.get('1')).toBe('Women');
  });

  it('puts the day in front of a name shared across days', () => {
    const labels = sessionDisplayLabels([
      { id: '1', name: 'Session 1', session_date: '2026-07-11', platform_id: null },
      { id: '2', name: 'Session 1', session_date: '2026-07-12', platform_id: null },
    ]);
    expect(labels.get('1')).toBe('Sat · Session 1');
    expect(labels.get('2')).toBe('Sun · Session 1');
  });

  it('adds the platform when the day still does not tell them apart', () => {
    const platforms = new Map([
      ['p-a', 'Platform A'],
      ['p-b', 'Platform B'],
    ]);
    const labels = sessionDisplayLabels(
      [
        { id: '1', name: 'Session 1', session_date: '2026-07-11', platform_id: 'p-a' },
        { id: '2', name: 'Session 1', session_date: '2026-07-11', platform_id: 'p-b' },
      ],
      platforms,
    );
    expect(labels.get('1')).toBe('Sat · Session 1 · Platform A');
    expect(labels.get('2')).toBe('Sat · Session 1 · Platform B');
  });
});
