import { createClient } from '@/lib/supabase/server';
import { RecordsManager } from '@/components/records/records-manager';
import type { AdminRecord } from '@/components/records/record-form';
import type { RecordGender } from '@/lib/constants';

export default async function RecordsAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('records')
    .select('id, region, name, gender, weight_class, age_category, lift, equipment, weight_kg, date_set, notes')
    .order('region')
    .order('gender')
    .order('weight_class')
    .order('lift');

  const records: AdminRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    region: row.region,
    name: row.name,
    // The gender column is a text CHECK ('M','F'); narrow the string back to the union it guarantees.
    gender: row.gender as RecordGender,
    weightClass: row.weight_class,
    ageCategory: row.age_category,
    lift: row.lift,
    equipment: row.equipment,
    weightKg: row.weight_kg,
    dateSet: row.date_set,
    notes: row.notes,
  }));

  return <RecordsManager records={records} />;
}
