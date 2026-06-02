import { createClient } from '@/lib/supabase/server';
import { RecordsManager } from '@/components/records/records-manager';
import { toRecordView } from '@/lib/records/record-view';

export default async function RecordsAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('records')
    .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set, notes')
    .order('region')
    .order('gender')
    .order('weight_class')
    .order('lift');

  const records = (data ?? []).map((row) => toRecordView(row));

  return <RecordsManager records={records} />;
}
