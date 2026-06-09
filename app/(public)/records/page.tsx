import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { loadRecords } from '@/lib/records/load-records';
import { RecordsBrowser } from '@/components/records/records-browser';

export const metadata: Metadata = {
  title: 'UK Powerlifting Records',
  description: 'Browse regional and national British Powerlifting records.',
};

// Records are app-global reference data: anon can read every row (the records_public_read policy is
// unconditional, not gated on a competition's status), so this page needs no auth and no comp.
export default async function PublicRecordsPage() {
  const supabase = await createClient();
  // includeNotes: false — notes is an internal admin field that must never reach the anon payload.
  const records = await loadRecords(supabase, { includeNotes: false });

  return <RecordsBrowser records={records} />;
}
