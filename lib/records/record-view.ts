import type { RecordEquipment, RecordGender, RecordLift } from '@/lib/constants';

// One UK record in the camelCase shape the screens hold (the admin manager, the public browser and
// the add/edit form). The pages map the snake_case DB row to this via toRecordView.
export type RecordView = {
  id: string;
  region: string;
  name: string;
  gender: RecordGender;
  weightClass: string;
  ageCategory: string;
  lift: RecordLift;
  equipment: RecordEquipment;
  weightKg: number;
  dateSet: string | null;
  notes: string | null;
};

// Maps a selected records row (snake_case) to the view shape. Typed structurally so it accepts the
// column subset the pages select rather than the full table Row.
export function toRecordView(row: {
  id: string;
  region: string;
  name: string;
  gender: string;
  weight_class: string;
  age_category: string;
  lift: RecordLift;
  equipment: RecordEquipment;
  weight_kg: number;
  date_set: string | null;
  // Optional so the public page can omit notes from its select (they aren't shown publicly).
  notes?: string | null;
}): RecordView {
  return {
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
    notes: row.notes ?? null,
  };
}
