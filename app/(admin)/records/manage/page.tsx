import { createClient } from '@/lib/supabase/server';
import { RecordsManager } from '@/components/records/records-manager';
import { toRecordView } from '@/lib/records/record-view';
import { fetchAllRows } from '@/lib/supabase/paginate';

export default async function RecordsAdminPage() {
  const supabase = await createClient();
  // Page through every record — PostgREST caps a single response at 1000 rows, so an un-paginated
  // select would silently hide records beyond the first page once the dataset grows past it.
  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from('records')
      .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set, notes')
      .order('region')
      .order('gender')
      .order('weight_class')
      .order('lift')
      .range(from, to),
  );

  const records = data.map((row) => toRecordView(row));

  return <RecordsManager records={records} />;
}
