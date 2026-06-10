import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '@/lib/supabase/like-pattern';

describe('escapeLikePattern', () => {
  it('passes ordinary names through unchanged', () => {
    expect(escapeLikePattern('Smith')).toBe('Smith');
    expect(escapeLikePattern("O'Connor-Davies")).toBe("O'Connor-Davies");
  });

  it('escapes the LIKE wildcards so they match literally', () => {
    expect(escapeLikePattern('100%')).toBe(String.raw`100\%`);
    expect(escapeLikePattern('a_b')).toBe(String.raw`a\_b`);
  });

  it('escapes the escape character first, so a crafted backslash cannot un-escape a wildcard', () => {
    expect(escapeLikePattern(String.raw`\%`)).toBe(String.raw`\\\%`);
  });

  it('escapes * (PostgREST translates it to % before the query runs)', () => {
    expect(escapeLikePattern('a*b')).toBe(String.raw`a\*b`);
  });

  it('neutralises a pure-wildcard injection', () => {
    expect(escapeLikePattern('%')).toBe(String.raw`\%`);
    expect(escapeLikePattern('%%%')).toBe(String.raw`\%\%\%`);
  });
});
