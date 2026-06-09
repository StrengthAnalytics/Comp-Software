import { describe, expect, it } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/supabase/paginate';

// A fake PostgREST range query over an in-memory dataset, capped like the server's `max-rows`. Records
// the [from, to] ranges it was called with so the test can assert how the helper paged.
function fakeQuery<T>(rows: T[], cap: number) {
  const calls: Array<[number, number]> = [];
  const query = (from: number, to: number) => {
    calls.push([from, to]);
    const requested = rows.slice(from, to + 1);
    const data = requested.slice(0, cap);
    return Promise.resolve({ data, error: null as PostgrestError | null });
  };
  return { query, calls };
}

describe('fetchAllRows', () => {
  it('returns every row across multiple capped pages', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => i);
    const { query, calls } = fakeQuery(rows, 1000);

    const { data, error } = await fetchAllRows(query);

    expect(error).toBeNull();
    expect(data).toEqual(rows);
    // 1000 + 1000 + 300, then a trailing empty page that returns nothing and stops the loop.
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2300, 3299],
    ]);
  });

  it('stops after a single page when the dataset fits within one', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => i);
    const { query, calls } = fakeQuery(rows, 1000);

    const { data } = await fetchAllRows(query);

    expect(data).toEqual(rows);
    // First page returns 12 (< PAGE_SIZE), the second returns empty and breaks.
    expect(calls).toEqual([
      [0, 999],
      [12, 1011],
    ]);
  });

  it('returns an empty array for an empty table without erroring', async () => {
    const { query, calls } = fakeQuery<number>([], 1000);

    const { data, error } = await fetchAllRows(query);

    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(calls).toEqual([[0, 999]]);
  });

  it('stays correct when the server cap is lower than the page size', async () => {
    // Advancing by the number of rows actually returned (not a fixed step) means a server cap below
    // PAGE_SIZE still pages cleanly rather than skipping the gap between cap and PAGE_SIZE.
    const rows = Array.from({ length: 1300 }, (_, i) => i);
    const { query } = fakeQuery(rows, 500);

    const { data } = await fetchAllRows(query);

    expect(data).toEqual(rows);
  });

  it('returns the rows gathered so far and the error when a page fails', async () => {
    const dbError = { message: 'boom' } as PostgrestError;
    let call = 0;
    const query = (from: number) => {
      call++;
      if (call === 1) {
        return Promise.resolve({
          data: Array.from({ length: 1000 }, (_, i) => from + i),
          error: null as PostgrestError | null,
        });
      }
      return Promise.resolve({ data: null, error: dbError });
    };

    const { data, error } = await fetchAllRows(query);

    expect(error).toBe(dbError);
    expect(data).toHaveLength(1000);
  });
});
