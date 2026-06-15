import { describe, expect, it } from 'vitest';
import {
  buildRotaSubtitle,
  formatRotaDayLabel,
  formatRotaStartTime,
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

describe('formatRotaStartTime', () => {
  it('trims seconds to HH:MM', () => {
    expect(formatRotaStartTime('10:00:00')).toBe('10:00');
    expect(formatRotaStartTime('14:30')).toBe('14:30');
  });

  it('returns null when absent or unrecognised', () => {
    expect(formatRotaStartTime(null)).toBeNull();
    expect(formatRotaStartTime('morning')).toBeNull();
  });
});

describe('buildRotaSubtitle', () => {
  it('joins the time and platform', () => {
    expect(buildRotaSubtitle('10:00:00', 'Platform 1')).toBe('10:00 · Platform 1');
  });

  it('uses just the time without a platform, and null when neither', () => {
    expect(buildRotaSubtitle('10:00:00', null)).toBe('10:00');
    expect(buildRotaSubtitle(null, null)).toBeNull();
  });
});

describe('planRotaSectionsFromSessions', () => {
  const sessions: SessionForRota[] = [
    { id: 's2', name: 'PM', session_date: '2026-06-13', start_time: '14:00:00', platform_id: 'p1', sort_order: 1 },
    { id: 's1', name: 'AM', session_date: '2026-06-13', start_time: '10:00:00', platform_id: 'p1', sort_order: 0 },
  ];
  const onePlatform = new Map([['p1', 'Platform 1']]);

  it('plans one section per session in sort order, mapping the fields', () => {
    const planned = planRotaSectionsFromSessions(sessions, new Set(), onePlatform);
    expect(planned.map((section) => section.sessionId)).toEqual(['s1', 's2']);
    // Single platform → no platform name in the subtitle.
    expect(planned[0]).toEqual({ sessionId: 's1', dayLabel: 'Sat', title: 'AM', subtitle: '10:00' });
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
    expect(planned[0].subtitle).toBe('10:00 · Platform 1');
  });
});
