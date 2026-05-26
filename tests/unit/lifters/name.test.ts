import { describe, expect, it } from 'vitest';
import { formatLifterName } from '@/lib/lifters/name';

describe('formatLifterName', () => {
  it('renders "Surname, First" when both are present', () => {
    expect(formatLifterName('Smith', 'Dana')).toBe('Smith, Dana');
  });

  it('falls back to the first name alone when the surname is blank', () => {
    expect(formatLifterName('', 'Madonna')).toBe('Madonna');
    expect(formatLifterName('   ', 'Madonna')).toBe('Madonna');
  });
});
