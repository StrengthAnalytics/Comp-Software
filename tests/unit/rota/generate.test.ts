import { describe, expect, it } from 'vitest';
import {
  arriveBefore,
  buildRotaSubtitle,
  formatRotaDayLabel,
  formatRotaTime,
  planRotaSectionsFromSessions,
  type SessionForRota,
} from '@/lib/rota/generate';

describe('formatRotaDayLabel', () => {
  it('formats an ISO date as a short weekday in UTC', () => {
    // 13 June 2026 is a Saturday, 14 June a Sunday.
    expect(formatRotaDayLabel('2026-06-13')).toBe('Sat');
    expect(formatRotaDayLabel('2026-06-14')).toBe('Sun');
  });

  it('returns null for a missing or malformed date', () => {
    expect(formatRotaDayLabel(null)).toBeNull();
    expect(formatRotaDayLabel('not-a-date')).toBeNull();
  });
});

describe('formatRotaTime', () => {
  it('trims seconds to HH:MM', () => {
    expect(formatRotaTime('10:00:00')).toBe('10:00');
    expect(formatRotaTime('14:30')).toBe('14:30');
  });

  it('returns null when absent or unrecognised', () => {
    expect(formatRotaTime(null)).toBeNull();
    expect(formatRotaTime('morning')).toBeNull();
  });
});

describe('arriveBefore', () => {
  it('subtracts the offset and returns HH:MM', () => {
    expect(arriveBefore('10:00:00', 30)).toBe('09:30');
    expect(arriveBefore('10:15', 30)).toBe('09:45');
    expect(arriveBefore('08:00:00', 30)).toBe('07:30');
  });

  it('returns null when the basis time is unset', () => {
    expect(arriveBefore(null, 30)).toBeNull();
  });

  it('wraps across midnight defensively', () => {
    expect(arriveBefore('00:15', 30)).toBe('23:45');
  });
});

describe('buildRotaSubtitle', () => {
  it('labels the weigh-in and lift-off times and adds the platform', () => {
    expect(buildRotaSubtitle('08:00:00', '10:00:00', 'Platform 1')).toBe(
      'Weigh-in 08:00 · Lift-off 10:00 · Platform 1',
    );
  });

  it('drops any absent part, and is null when there is nothing', () => {
    expect(buildRotaSubtitle('08:00:00', null, null)).toBe('Weigh-in 08:00');
    expect(buildRotaSubtitle(null, '10:00:00', null)).toBe('Lift-off 10:00');
    expect(buildRotaSubtitle(null, null, null)).toBeNull();
  });
});

describe('planRotaSectionsFromSessions', () => {
  const sessions: SessionForRota[] = [
    {
      id: 's2',
      name: 'PM',
      session_date: '2026-06-13',
      weigh_in_time: '12:30:00',
      lift_off_time: '14:30:00',
      platform_id: 'p1',
      sort_order: 1,
    },
    {
      id: 's1',
      name: 'AM',
      session_date: '2026-06-13',
      weigh_in_time: '08:00:00',
      lift_off_time: '10:00:00',
      platform_id: 'p1',
      sort_order: 0,
    },
  ];
  const onePlatform = new Map([['p1', 'Platform 1']]);

  it('plans one section per session in sort order, mapping the fields', () => {
    const planned = planRotaSectionsFromSessions(sessions, new Set(), onePlatform);
    expect(planned.map((section) => section.sessionId)).toEqual(['s1', 's2']);
    // Single platform → no platform name in the subtitle.
    expect(planned[0]).toEqual({
      sessionId: 's1',
      dayLabel: 'Sat',
      title: 'AM',
      subtitle: 'Weigh-in 08:00 · Lift-off 10:00',
    });
  });

  it('skips sessions that already have a section', () => {
    const planned = planRotaSectionsFromSessions(sessions, new Set(['s1']), onePlatform);
    expect(planned.map((section) => section.sessionId)).toEqual(['s2']);
  });

  it('adds the platform name to the subtitle only when there is more than one platform', () => {
    const twoPlatforms = new Map([
      ['p1', 'Platform 1'],
      ['p2', 'Platform 2'],
    ]);
    const planned = planRotaSectionsFromSessions(sessions, new Set(), twoPlatforms);
    expect(planned[0].subtitle).toBe('Weigh-in 08:00 · Lift-off 10:00 · Platform 1');
  });
});
