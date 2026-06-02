import { describe, expect, it } from 'vitest';
import { isRealIsoDate } from '@/lib/dates';

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
