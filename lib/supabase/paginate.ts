import type { PostgrestError } from '@supabase/supabase-js';

// PostgREST caps every response at its `max-rows` setting (1000 by default on Supabase), so a select
// for a whole table is silently truncated to the first page. This pages through the result with
// `.range()`, concatenating every page into the full set.
//
// The caller supplies a factory that builds the query (select/order/filter) and applies the supplied
// [from, to] range, so the helper is table- and column-agnostic. It advances by the number of rows
// actually returned (not a fixed step) and stops on the first empty page, so it stays correct even if
// the server's `max-rows` is lower than PAGE_SIZE — at the cost of one trailing empty request.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  rangeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await rangeQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    if (data === null || data.length === 0) break;

    rows.push(...data);
    from += data.length;
  }

  return { data: rows, error: null };
}
