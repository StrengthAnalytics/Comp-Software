import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import {
  EntriesManager,
  type EntryLifter,
  type EntryWithLifter,
} from '@/components/entries/entries-manager';

export default async function EntriesPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [{ data: ageCategories }, { data: weightClasses }, { data: entryRows }] = await Promise.all([
    supabase
      .from('age_categories')
      .select('id, name')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('weight_classes')
      .select('id, name, gender')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('entries')
      .select(
        'id, lifter_id, weight_class_id, age_category_id, division, lot_number, bodyweight_kg, opener_squat_kg, opener_bench_kg, opener_deadlift_kg, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting, status',
      )
      .eq('competition_id', comp.id),
  ]);

  // The generated types carry no relationships, so we join lifters in a second query rather than an
  // embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } = lifterIds.length > 0
    ? await supabase
        .from('lifters')
        .select('id, first_name, surname, gender, date_of_birth, ipf_member_id, club, country')
        .in('id', lifterIds)
    // No entries → skip the lookup; the assertion just types the empty default to the query shape.
    : { data: [] as EntryLifter[] };

  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));

  const entries: EntryWithLifter[] = (entryRows ?? [])
    .map((row): EntryWithLifter | null => {
      const lifter = lifterById.get(row.lifter_id);
      return lifter ? { ...row, lifter } : null;
    })
    .filter((entry): entry is EntryWithLifter => entry !== null)
    .toSorted((a, b) => fullName(a.lifter).localeCompare(fullName(b.lifter)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entries &amp; weigh-in</h1>
      </div>

      <EntriesManager
        competitionId={comp.id}
        competitionName={comp.name}
        competitionStatus={comp.status}
        competitionStartsOn={comp.starts_on}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        ageCategories={ageCategories ?? []}
        weightClasses={weightClasses ?? []}
        entries={entries}
      />
    </div>
  );
}

function fullName(lifter: { first_name: string; surname: string }): string {
  return formatLifterName(lifter.surname, lifter.first_name);
}
