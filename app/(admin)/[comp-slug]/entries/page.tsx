import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import { parseEntryFormConfig } from '@/types/entry-form';
import {
  EntriesManager,
  type EntryLifter,
  type EntryWithLifter,
} from '@/components/entries/entries-manager';
import { EntryFormDesigner } from '@/components/entries/entry-form-designer';
import { SubmissionsInbox, type PendingSubmission } from '@/components/entries/submissions-inbox';

export default async function EntriesPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [{ data: ageCategories }, { data: weightClasses }, { data: entryRows }, { data: submissionRows }] =
    await Promise.all([
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
      supabase
        .from('entry_submissions')
        .select(
          'id, first_name, surname, gender, date_of_birth, club, ipf_member_id, division, weight_class, predicted_total_kg, recent_best_total_kg, kit_choice, event_choice, instagram, email, phone, disclaimer_accepted_at, created_at',
        )
        .eq('competition_id', comp.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
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

  // The likeliest duplicate signal for a review card: a registered lifter with the same name.
  const registeredNames = new Set(
    entries.map((entry) => `${entry.lifter.surname.toLowerCase()}|${entry.lifter.first_name.toLowerCase()}`),
  );
  const submissions: PendingSubmission[] = (submissionRows ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    surname: row.surname,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    club: row.club,
    ipfMemberId: row.ipf_member_id,
    division: row.division,
    weightClass: row.weight_class,
    predictedTotalKg: row.predicted_total_kg,
    recentBestTotalKg: row.recent_best_total_kg,
    kitChoice: row.kit_choice,
    eventChoice: row.event_choice,
    instagram: row.instagram,
    email: row.email,
    phone: row.phone,
    disclaimerAcceptedAt: row.disclaimer_accepted_at,
    createdAt: row.created_at,
    possibleDuplicate: registeredNames.has(
      `${row.surname.toLowerCase()}|${row.first_name.toLowerCase()}`,
    ),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entries &amp; weigh-in</h1>
      </div>

      <SubmissionsInbox competitionId={comp.id} submissions={submissions} />

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

      <EntryFormDesigner
        competitionId={comp.id}
        slug={comp.slug}
        competitionStatus={comp.status}
        initialConfig={parseEntryFormConfig(comp.entry_form)}
        initialOpen={comp.entry_form_open}
      />
    </div>
  );
}

function fullName(lifter: { first_name: string; surname: string }): string {
  return formatLifterName(lifter.surname, lifter.first_name);
}
