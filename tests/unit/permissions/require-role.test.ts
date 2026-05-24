import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, requireRole } from '@/lib/permissions/require-role';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

type GetUserResult = {
  data: { user: { id: string } | null };
  error: { message: string } | null;
};

type RoleResult = {
  data: { role: string } | null;
  error: { message: string } | null;
};

// Builds a Supabase client stub whose comp_roles query resolves to roleResult.
// The eq() calls are chainable; maybeSingle() terminates the chain.
function buildSupabase(getUser: GetUserResult, roleResult: RoleResult) {
  const maybeSingle = vi.fn().mockResolvedValue(roleResult);
  const eq = vi.fn();
  const builder = { eq, maybeSingle };
  eq.mockReturnValue(builder);
  const select = vi.fn().mockReturnValue(builder);
  const from = vi.fn().mockReturnValue({ select });

  return {
    auth: { getUser: vi.fn().mockResolvedValue(getUser) },
    from,
  };
}

function useSupabase(client: ReturnType<typeof buildSupabase>) {
  // The real createClient returns a typed SupabaseClient; the stub only implements what requireRole uses.
  mockedCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
}

const ANY_COMP = '00000000-0000-0000-0000-000000000001';

afterEach(() => {
  vi.clearAllMocks();
});

describe('requireRole', () => {
  it('returns the role when the user holds an allowed role', async () => {
    useSupabase(
      buildSupabase(
        { data: { user: { id: 'user-1' } }, error: null },
        { data: { role: 'scorekeeper' }, error: null },
      ),
    );

    await expect(requireRole(ANY_COMP, ['scorekeeper', 'meet_director'])).resolves.toBe(
      'scorekeeper',
    );
  });

  it('throws when there is no authenticated user', async () => {
    useSupabase(
      buildSupabase({ data: { user: null }, error: null }, { data: null, error: null }),
    );

    await expect(requireRole(ANY_COMP, ['meet_director'])).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('throws when auth lookup errors', async () => {
    useSupabase(
      buildSupabase(
        { data: { user: null }, error: { message: 'network' } },
        { data: null, error: null },
      ),
    );

    await expect(requireRole(ANY_COMP, ['meet_director'])).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('throws when the role query errors', async () => {
    useSupabase(
      buildSupabase(
        { data: { user: { id: 'user-1' } }, error: null },
        { data: null, error: { message: 'boom' } },
      ),
    );

    await expect(requireRole(ANY_COMP, ['meet_director'])).rejects.toThrow(/Failed to resolve/);
  });

  it('throws when the user has no role for the competition', async () => {
    useSupabase(
      buildSupabase(
        { data: { user: { id: 'user-1' } }, error: null },
        { data: null, error: null },
      ),
    );

    await expect(requireRole(ANY_COMP, ['meet_director'])).rejects.toThrow(/No role assigned/);
  });

  it('throws when the user role is not in allowedRoles', async () => {
    useSupabase(
      buildSupabase(
        { data: { user: { id: 'user-1' } }, error: null },
        { data: { role: 'announcer' }, error: null },
      ),
    );

    await expect(requireRole(ANY_COMP, ['meet_director', 'scorekeeper'])).rejects.toThrow(
      /not permitted/,
    );
  });
});
