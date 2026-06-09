import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { RecordsManager } from '@/components/records/records-manager';
import { toRecordView } from '@/lib/records/record-view';
import { fetchAllRows } from '@/lib/supabase/paginate';

export default async function RecordsAdminPage() {
  const supabase = await createClient();
  // Page through every record — PostgREST caps a single response at 1000 rows, so an un-paginated
  // select would silently hide records beyond the first page once the dataset grows past it. The
  // final .order('id') is a unique tiebreaker so offset paging can't skip or duplicate a row whose
  // other sort columns tie at a page boundary.
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from('records')
      .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set, notes')
      .order('region')
      .order('gender')
      .order('weight_class')
      .order('lift')
      .order('id')
      .range(from, to),
  );

  if (error) Sentry.captureException(error);

  const records = data.map((row) => toRecordView(row));

  return <RecordsManager records={records} />;
}
