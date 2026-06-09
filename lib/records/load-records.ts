import * as Sentry from '@sentry/nextjs';
import type { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { toRecordView, type RecordView } from '@/lib/records/record-view';

// The RLS-bound server client both record audiences read through.
type ServerClient = Awaited<ReturnType<typeof createClient>>;

// The record columns shared by both audiences. `notes` is an internal admin-only field and is added
// only when explicitly requested, so it can never reach the anon (public) payload by accident — the
// public browser passes includeNotes: false and never selects it.
const PUBLIC_RECORD_COLUMNS =
  'id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set';
const ADMIN_RECORD_COLUMNS = `${PUBLIC_RECORD_COLUMNS}, notes` as const;

// Loads every record (paging past PostgREST's 1000-row cap) ordered by category, with a unique id
// tiebreaker so offset paging can't skip or duplicate a row whose other sort columns tie at a page
// boundary. Both the admin manager (`/records/manage`) and the public browser (`/records`) read
// through this one loader so they can't drift on ordering, columns, or the notes omission.
//
// On a read failure (transient or mid-pagination) it returns an empty list rather than the rows
// gathered so far: a partial set would render as if it were the complete records dataset, silently
// re-creating the "capped" symptom. The error is sent to Sentry instead.
export async function loadRecords(
  supabase: ServerClient,
  { includeNotes }: { includeNotes: boolean },
): Promise<RecordView[]> {
  const result = includeNotes
    ? await fetchAllRows((from, to) =>
        supabase
          .from('records')
          .select(ADMIN_RECORD_COLUMNS)
          .order('region')
          .order('gender')
          .order('weight_class')
          .order('lift')
          .order('id')
          .range(from, to),
      )
    : await fetchAllRows((from, to) =>
        supabase
          .from('records')
          .select(PUBLIC_RECORD_COLUMNS)
          .order('region')
          .order('gender')
          .order('weight_class')
          .order('lift')
          .order('id')
          .range(from, to),
      );

  if (result.error) {
    Sentry.captureException(result.error);
    return [];
  }

  return result.data.map((row) => toRecordView(row));
}
