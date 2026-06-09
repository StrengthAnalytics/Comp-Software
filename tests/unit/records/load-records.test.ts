import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { loadRecords } from '@/lib/records/load-records';
import type { createClient } from '@/lib/supabase/server';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (error: unknown) => captureException(error),
}));

type RangeResult = { data: unknown[] | null; error: PostgrestError | null };

// A minimal fake of the supabase query builder: from/select/order all chain, and range resolves to
// the next queued page, recording the select() column string so the test can assert what was fetched.
function fakeClient(pages: RangeResult[]) {
  const selects: string[] = [];
  let call = 0;
  const builder = {
    select(columns: string) {
      selects.push(columns);
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      const page = pages[call] ?? { data: [], error: null };
      call += 1;
      return Promise.resolve(page);
    },
  };
  const client = { from: () => builder };
  // The real client is a fully-typed SupabaseClient; the stub only implements the chain loadRecords uses.
  return { client: client as unknown as Awaited<ReturnType<typeof createClient>>, selects };
}

const dbRow = {
  id: 'r1',
  region: 'British',
  name: 'A Lifter',
  gender: 'M',
  weight_class: '-83 kg',
  age_category: 'Open',
  lift: 'squat',
  equipment: 'unequipped',
  weight_kg: 300,
  date_set: '2024-01-01',
  notes: 'internal note',
};

describe('loadRecords', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('omits notes from the select when includeNotes is false (public payload)', async () => {
    const { client, selects } = fakeClient([{ data: [], error: null }]);

    await loadRecords(client, { includeNotes: false });

    expect(selects).toHaveLength(1);
    expect(selects[0]).not.toContain('notes');
  });

  it('includes notes in the select when includeNotes is true (admin)', async () => {
    const { client, selects } = fakeClient([{ data: [], error: null }]);

    await loadRecords(client, { includeNotes: true });

    expect(selects[0]).toContain('notes');
  });

  it('maps DB rows to RecordViews on success', async () => {
    const { client } = fakeClient([
      { data: [dbRow], error: null },
      { data: [], error: null },
    ]);

    const records = await loadRecords(client, { includeNotes: true });

    expect(records).toEqual([
      {
        id: 'r1',
        region: 'British',
        name: 'A Lifter',
        gender: 'M',
        weightClass: '-83 kg',
        ageCategory: 'Open',
        lift: 'squat',
        equipment: 'unequipped',
        weightKg: 300,
        dateSet: '2024-01-01',
        notes: 'internal note',
      },
    ]);
  });

  it('returns an empty list and reports to Sentry on a read error, never partial data', async () => {
    const dbError = { message: 'boom' } as PostgrestError;
    // First page succeeds, second errors — loadRecords must discard the partial first page.
    const { client } = fakeClient([
      { data: [dbRow], error: null },
      { data: null, error: dbError },
    ]);

    const records = await loadRecords(client, { includeNotes: false });

    expect(records).toEqual([]);
    expect(captureException).toHaveBeenCalledWith(dbError);
  });
});
