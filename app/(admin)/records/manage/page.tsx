import { createClient } from '@/lib/supabase/server';
import { RecordsManager } from '@/components/records/records-manager';
import { loadRecords } from '@/lib/records/load-records';

export default async function RecordsAdminPage() {
  const supabase = await createClient();
  const records = await loadRecords(supabase, { includeNotes: true });

  return <RecordsManager records={records} />;
}
