import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { toRecordView } from '@/lib/records/record-view';
import { RecordsBrowser } from '@/components/records/records-browser';

export const metadata: Metadata = {
  title: 'UK Powerlifting Records',
  description: 'Browse regional and national British Powerlifting records.',
};

// Records are app-global reference data: anon can read every row (the records_public_read policy is
// unconditional, not gated on a competition's status), so this page needs no auth and no comp.
export default async function PublicRecordsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('records')
    .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set, notes')
    .order('region')
    .order('gender')
    .order('weight_class')
    .order('lift');

  const records = (data ?? []).map((row) => toRecordView(row));

  return <RecordsBrowser records={records} />;
}
