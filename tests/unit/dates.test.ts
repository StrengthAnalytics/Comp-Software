import { describe, expect, it } from 'vitest';
import { daysBetweenIsoDates, isRealIsoDate } from '@/lib/dates';

describe('isRealIsoDate', () => {
  it.each(['2024-01-15', '2024-02-29', '2024-12-31', '2000-02-29'])('accepts the real date %s', (value) => {
    expect(isRealIsoDate(value)).toBe(true);
  });

  it.each([
    '2020-02-31',
    '2023-02-29',
    '2024-13-01',
    '2024-00-10',
    '2024-04-31',
    '2024-01-32',
    '2024-1-1',
    '15/01/2024',
    '',
  ])('rejects the impossible or malformed date %s', (value) => {
    expect(isRealIsoDate(value)).toBe(false);
  });
});

describe('daysBetweenIsoDates', () => {
  it('counts forward to a later date', () => {
    expect(daysBetweenIsoDates('2026-06-09', '2026-07-11')).toBe(32);
  });

  it('returns 0 for the same day', () => {
    expect(daysBetweenIsoDates('2026-06-09', '2026-06-09')).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysBetweenIsoDates('2026-06-09', '2026-06-01')).toBe(-8);
  });

  it('crosses a leap day correctly', () => {
    expect(daysBetweenIsoDates('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('returns null for an unreal or malformed date', () => {
    expect(daysBetweenIsoDates('2026-02-30', '2026-03-01')).toBeNull();
    expect(daysBetweenIsoDates('2026-06-09', 'not-a-date')).toBeNull();
  });
});
