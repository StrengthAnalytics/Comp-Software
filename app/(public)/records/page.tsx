import type { Metadata } from 'next';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { toRecordView } from '@/lib/records/record-view';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { RecordsBrowser } from '@/components/records/records-browser';

export const metadata: Metadata = {
  title: 'UK Powerlifting Records',
  description: 'Browse regional and national British Powerlifting records.',
};

// Records are app-global reference data: anon can read every row (the records_public_read policy is
// unconditional, not gated on a competition's status), so this page needs no auth and no comp.
export default async function PublicRecordsPage() {
  const supabase = await createClient();
  // notes is an internal admin field — deliberately not selected here so it never reaches the public
  // (anon) payload. The public browser does not render it.
  //
  // Page through every record — PostgREST caps a single response at 1000 rows, so an un-paginated
  // select would silently hide records beyond the first page once the dataset grows past it. The
  // final .order('id') is a unique tiebreaker so offset paging can't skip or duplicate a row whose
  // other sort columns tie at a page boundary.
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('records')
      .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set')
      .order('region')
      .order('gender')
      .order('weight_class')
      .order('lift')
      .order('id')
      .range(from, to),
  );

  if (error) Sentry.captureException(error);

  const records = data.map((row) => toRecordView(row));

  return <RecordsBrowser records={records} />;
}
