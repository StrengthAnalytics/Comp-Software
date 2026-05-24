import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, isAdmin, requireAdmin } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

type GetUserResult = {
  data: { user: { email?: string | null } | null };
  error: { message: string } | null;
};

function useSupabase(getUser: GetUserResult) {
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue(getUser) },
  };
  // The real createClient returns a typed SupabaseClient; the stub only implements getUser.
  mockedCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe('isAdmin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false for a missing email (null or empty)', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin('')).toBe(false);
  });

  it('returns false when ADMIN_EMAILS is empty', () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(isAdmin('admin@example.com')).toBe(false);
  });

  it('returns false when ADMIN_EMAILS is unset', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined -- unsetting the env var requires passing undefined
    vi.stubEnv('ADMIN_EMAILS', undefined);
    expect(isAdmin('admin@example.com')).toBe(false);
  });

  it('matches a single allowlisted email', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    expect(isAdmin('admin@example.com')).toBe(true);
    expect(isAdmin('someone@example.com')).toBe(false);
  });

  it('matches any email in a comma-separated list', () => {
    vi.stubEnv('ADMIN_EMAILS', 'a@example.com, b@example.com ,c@example.com');
    expect(isAdmin('a@example.com')).toBe(true);
    expect(isAdmin('b@example.com')).toBe(true);
    expect(isAdmin('c@example.com')).toBe(true);
    expect(isAdmin('d@example.com')).toBe(false);
  });

  it('is case-insensitive and trims whitespace on both sides', () => {
    vi.stubEnv('ADMIN_EMAILS', '  Admin@Example.com  ');
    expect(isAdmin('ADMIN@example.COM')).toBe(true);
    expect(isAdmin('  admin@example.com  ')).toBe(true);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns the email when the user is an allowlisted admin', async () => {
    useSupabase({ data: { user: { email: 'admin@example.com' } }, error: null });
    await expect(requireAdmin()).resolves.toBe('admin@example.com');
  });

  it('throws when there is no authenticated user', async () => {
    useSupabase({ data: { user: null }, error: null });
    await expect(requireAdmin()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAdmin()).rejects.toThrow(/Not authenticated/);
  });

  it('throws when the auth lookup errors', async () => {
    useSupabase({ data: { user: null }, error: { message: 'network' } });
    await expect(requireAdmin()).rejects.toThrow(/Not authenticated/);
  });

  it('throws when the user has no email', async () => {
    useSupabase({ data: { user: { email: null } }, error: null });
    await expect(requireAdmin()).rejects.toThrow(/Not authorised/);
  });

  it('throws when the user email is not on the allowlist', async () => {
    useSupabase({ data: { user: { email: 'someone@example.com' } }, error: null });
    await expect(requireAdmin()).rejects.toThrow(/Not authorised/);
  });
});
