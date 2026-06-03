import { describe, expect, it } from 'vitest';
import { flipLifterName, formatLifterName } from '@/lib/lifters/name';

describe('formatLifterName', () => {
  it('renders "Surname, First" when both are present', () => {
    expect(formatLifterName('Smith', 'Dana')).toBe('Smith, Dana');
  });

  it('falls back to the first name alone when the surname is blank', () => {
    expect(formatLifterName('', 'Madonna')).toBe('Madonna');
    expect(formatLifterName('   ', 'Madonna')).toBe('Madonna');
  });
});

describe('flipLifterName', () => {
  it('re-orders "Surname, First" to "First Surname"', () => {
    expect(flipLifterName('Smith, Dana')).toBe('Dana Smith');
  });

  it('keeps multi-word surnames and first names intact', () => {
    expect(flipLifterName('Van Toop, Lottie')).toBe('Lottie Van Toop');
    expect(flipLifterName('Smith, Mary Jane')).toBe('Mary Jane Smith');
  });

  it('returns a comma-less (mononymous) name unchanged', () => {
    expect(flipLifterName('Madonna')).toBe('Madonna');
  });
});
