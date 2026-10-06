import { afterEach, describe, expect, it, vi } from 'vitest';

const { adminFrom, captureException } = vi.hoisted(() => ({ adminFrom: vi.fn(), captureException: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: adminFrom }) }));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { readOrganiserEmail } from '@/lib/email/organiser';
import type { Database } from '@/types/database.types';

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

// A stand-in for the one query readOrganiserEmail makes: from(table).select().eq().maybeSingle().
function queryReturning(result: { data: { email: string } | null; error: Error | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), eq };
}

function asClient(query: ReturnType<typeof queryReturning>): SupabaseClient<Database> {
  // The test double implements only the query chain readOrganiserEmail uses.
  return query as unknown as SupabaseClient<Database>;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('readOrganiserEmail', () => {
  it("reads the table on an admin's own session", async () => {
    const session = queryReturning({ data: { email: ' henry@example.com ' }, error: null });
    expect(await readOrganiserEmail(asClient(session), COMP_ID, 'admin')).toBe('henry@example.com');
    expect(session.from).toHaveBeenCalledWith('competition_organisers');
    expect(session.eq).toHaveBeenCalledWith('competition_id', COMP_ID);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('reads it server-side with the service-role client for an anonymous action', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    const anon = queryReturning({ data: null, error: null });
    const service = queryReturning({ data: { email: 'henry@example.com' }, error: null });
    adminFrom.mockImplementation(service.from);

    expect(await readOrganiserEmail(asClient(anon), COMP_ID, 'public')).toBe('henry@example.com');
    expect(anon.from).not.toHaveBeenCalled();
    expect(adminFrom).toHaveBeenCalledWith('competition_organisers');
  });

  it('finds none without the service-role key, when unset, or on a read error (logged)', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const anon = queryReturning({ data: null, error: null });
    expect(await readOrganiserEmail(asClient(anon), COMP_ID, 'public')).toBeNull();
    expect(adminFrom).not.toHaveBeenCalled();

    expect(
      await readOrganiserEmail(asClient(queryReturning({ data: null, error: null })), COMP_ID, 'admin'),
    ).toBeNull();

    const failing = queryReturning({ data: null, error: new Error('boom') });
    expect(await readOrganiserEmail(asClient(failing), COMP_ID, 'admin')).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
