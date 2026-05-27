import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LIFTS_FOR_EVENT, type Gender } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import {
  WeighInManager,
  type WeighInEntry,
  type WeightClassOption,
} from '@/components/weigh-in/weigh-in-manager';

function asGender(value: string): Gender {
  return value === 'female' ? 'female' : 'male';
}

export default async function WeighInPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, event_type, is_team_competition')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  const [{ data: sessions }, { data: flights }, { data: weightClassRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('flights')
      .select('id, session_id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('weight_classes')
      .select('id, name, gender, lower_kg, upper_kg')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('entries')
      .select(
        'id, lifter_id, flight_id, weight_class_id, team_lift, lot_number, bodyweight_kg, opener_squat_kg, opener_bench_kg, opener_deadlift_kg, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting, status',
      )
      .eq('competition_id', comp.id),
  ]);

  const weightClasses: WeightClassOption[] = (weightClassRows ?? []).map((weightClass) => ({
    id: weightClass.id,
    name: weightClass.name,
    gender: asGender(weightClass.gender),
    lowerKg: weightClass.lower_kg,
    upperKg: weightClass.upper_kg,
  }));

  // The generated types carry no relationships, so lifters are joined in a second query rather than
  // an embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname, gender').in('id', lifterIds)
      // No entries → skip the lookup; the assertion just types the empty default to the query shape.
      : { data: [] as { id: string; first_name: string; surname: string; gender: string }[] };

  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));
  const flightById = new Map((flights ?? []).map((flight) => [flight.id, flight]));

  let unflightedCount = 0;
  const entries: WeighInEntry[] = (entryRows ?? [])
    .map((row): WeighInEntry | null => {
      const lifter = lifterById.get(row.lifter_id);
      if (!lifter) {
        return null;
      }
      const flight = row.flight_id ? flightById.get(row.flight_id) : undefined;
      if (!flight) {
        unflightedCount += 1;
      }
      return {
        id: row.id,
        sessionId: flight?.session_id ?? null,
        flightName: flight?.name ?? null,
        flightSortOrder: flight?.sort_order ?? null,
        weightClassId: row.weight_class_id,
        lifterName: formatLifterName(lifter.surname, lifter.first_name),
        sex: asGender(lifter.gender),
        teamLift: row.team_lift,
        lotNumber: row.lot_number,
        bodyweightKg: row.bodyweight_kg,
        openerSquatKg: row.opener_squat_kg,
        openerBenchKg: row.opener_bench_kg,
        openerDeadliftKg: row.opener_deadlift_kg,
        rackHeightSquat: row.rack_height_squat,
        squatRackSetting: row.squat_rack_setting,
        rackHeightBench: row.rack_height_bench,
        benchSafetyHeight: row.bench_safety_height,
        benchSpotting: row.bench_spotting,
        status: row.status,
      };
    })
    .filter((entry): entry is WeighInEntry => entry !== null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weigh-in</h1>
      </div>

      <WeighInManager
        competitionId={comp.id}
        compSlug={comp.slug}
        isTeamCompetition={comp.is_team_competition}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        sessions={sessions ?? []}
        weightClasses={weightClasses}
        entries={entries}
        unflightedCount={unflightedCount}
      />
    </div>
  );
}
