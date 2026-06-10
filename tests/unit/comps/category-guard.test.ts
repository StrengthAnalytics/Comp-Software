import { describe, expect, it, vi } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  IPF_CATEGORIES_LOCKED_MESSAGE,
  requireEditableCategories,
} from '@/lib/comps/category-guard';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (error: unknown) => captureException(error),
}));

type CompResult = { data: { federation: string } | null; error: PostgrestError | null };

// A minimal fake of the one query chain the guard runs: from('competitions').select('federation')
// .eq('id', …).maybeSingle(). The real createClient returns a full typed client; the guard only
// touches this chain, so the narrow stub is asserted into the client type.
function fakeClient(result: CompResult): SupabaseClient<Database> {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

const COMP_ID = '00000000-0000-0000-0000-000000000000';

describe('requireEditableCategories', () => {
  it('allows category edits for a custom-federation comp', async () => {
    const result = await requireEditableCategories(fakeClient({ data: { federation: 'custom' }, error: null }), COMP_ID);
    expect(result).toBeNull();
  });

  it('rejects category edits for an ipf-federation comp with the locked message', async () => {
    const result = await requireEditableCategories(fakeClient({ data: { federation: 'ipf' }, error: null }), COMP_ID);
    expect(result).toMatchObject({ status: 'error', message: IPF_CATEGORIES_LOCKED_MESSAGE });
  });

  it('treats a legacy pre-migration value as editable (the safe direction)', async () => {
    const result = await requireEditableCategories(fakeClient({ data: { federation: 'IPF' }, error: null }), COMP_ID);
    expect(result).toBeNull();
  });

  it('fails closed with a friendly message when the comp is missing', async () => {
    const result = await requireEditableCategories(fakeClient({ data: null, error: null }), COMP_ID);
    expect(result).toMatchObject({ status: 'error', message: 'Could not find that competition.' });
  });

  it('fails closed and reports to Sentry on a read error, never leaking the raw error', async () => {
    captureException.mockClear();
    const dbError = { message: 'relation does not exist', code: '42P01' } as PostgrestError;
    const result = await requireEditableCategories(fakeClient({ data: null, error: dbError }), COMP_ID);
    expect(result).toMatchObject({ status: 'error', message: 'Could not check the competition. Please try again.' });
    expect(captureException).toHaveBeenCalledWith(dbError);
  });
});
