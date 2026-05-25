import { describe, expect, it } from 'vitest';
import { emailSchema, otpTokenSchema } from '@/types/auth';

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

describe('otpTokenSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(otpTokenSchema.safeParse('123456').success).toBe(true);
  });

  it('rejects codes that are not 6 digits', () => {
    expect(otpTokenSchema.safeParse('12345').success).toBe(false);
    expect(otpTokenSchema.safeParse('1234567').success).toBe(false);
    expect(otpTokenSchema.safeParse('12a456').success).toBe(false);
  });
});
