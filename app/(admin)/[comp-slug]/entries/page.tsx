import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import {
  EntriesManager,
  type EntryLifter,
  type EntryWithLifter,
} from '@/components/entries/entries-manager';

export default async function EntriesPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, event_type')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  const [{ data: divisions }, { data: weightClasses }, { data: entryRows }] = await Promise.all([
    supabase
      .from('divisions')
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
        'id, lifter_id, weight_class_id, division_id, lot_number, bodyweight_kg, opener_squat_kg, opener_bench_kg, opener_deadlift_kg, rack_height_squat, rack_height_bench, status',
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
        <Link href={`/comps/${comp.id}/edit`} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← {comp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Entries &amp; weigh-in</h1>
      </div>

      <EntriesManager
        competitionId={comp.id}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        divisions={divisions ?? []}
        weightClasses={weightClasses ?? []}
        entries={entries}
      />
    </div>
  );
}

function fullName(lifter: { first_name: string; surname: string }): string {
  return `${lifter.surname}, ${lifter.first_name}`;
}
