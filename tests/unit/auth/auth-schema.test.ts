import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema } from '@/types/auth';

describe('emailSchema', () => {
  it('trims and lowercases a valid email', () => {
    const result = emailSchema.safeParse('  Admin@Example.COM ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('admin@example.com');
    }
  });

  it('rejects a malformed email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a non-empty password', () => {
    expect(passwordSchema.safeParse('sprinter').success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(passwordSchema.safeParse('').success).toBe(false);
  });
});
