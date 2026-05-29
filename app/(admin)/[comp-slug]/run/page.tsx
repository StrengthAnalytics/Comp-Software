import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import {
  ScoresheetBoard,
  type BoardAttempt,
  type BoardEntry,
  type BoardFlight,
  type BoardPlatform,
  type BoardSession,
  type NamedOption,
} from '@/components/scorekeeper/scoresheet-board';

export default async function RunPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [
    { data: platformRows },
    { data: sessionRows },
    { data: flightRows },
    { data: weightClassRows },
    { data: divisionRows },
    { data: entryRows },
    { data: attemptRows },
  ] = await Promise.all([
    supabase.from('platforms').select('id, name').eq('competition_id', comp.id).order('name', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, name, sort_order, platform_id')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('flights')
      .select('id, session_id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase.from('weight_classes').select('id, name').eq('competition_id', comp.id),
    supabase.from('divisions').select('id, name').eq('competition_id', comp.id),
    supabase
      .from('entries')
      .select(
        'id, lifter_id, flight_id, weight_class_id, division_id, lot_number, team_lift, bodyweight_kg, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting',
      )
      .eq('competition_id', comp.id),
    supabase
      .from('attempts')
      .select('id, entry_id, lift, attempt_number, weight_kg, result, decided_at')
      .eq('competition_id', comp.id),
  ]);

  // The generated types carry no relationships, so lifter names are joined in a second query rather
  // than an embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname').in('id', lifterIds)
      : { data: [] as { id: string; first_name: string; surname: string }[] };
  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));
  const weightClassById = new Map((weightClassRows ?? []).map((weightClass) => [weightClass.id, weightClass.name]));
  const divisionById = new Map((divisionRows ?? []).map((division) => [division.id, division.name]));

  const platforms: BoardPlatform[] = (platformRows ?? []).map((platform) => ({ id: platform.id, name: platform.name }));
  const sessions: BoardSession[] = (sessionRows ?? []).map((session) => ({
    id: session.id,
    name: session.name,
    sortOrder: session.sort_order,
    platformId: session.platform_id,
  }));
  const flights: BoardFlight[] = (flightRows ?? []).map((flight) => ({
    id: flight.id,
    sessionId: flight.session_id,
    name: flight.name,
    sortOrder: flight.sort_order,
  }));
  const weightClasses: NamedOption[] = (weightClassRows ?? []).map((weightClass) => ({
    id: weightClass.id,
    name: weightClass.name,
  }));
  const divisions: NamedOption[] = (divisionRows ?? []).map((division) => ({ id: division.id, name: division.name }));
  const entries: BoardEntry[] = (entryRows ?? []).map((row) => {
    const lifter = lifterById.get(row.lifter_id);
    return {
      id: row.id,
      lifterName: lifter ? formatLifterName(lifter.surname, lifter.first_name) : '—',
      flightId: row.flight_id,
      lotNumber: row.lot_number,
      teamLift: row.team_lift,
      bodyweightKg: row.bodyweight_kg,
      weightClassName: row.weight_class_id ? (weightClassById.get(row.weight_class_id) ?? null) : null,
      divisionName: row.division_id ? (divisionById.get(row.division_id) ?? null) : null,
      rackHeightSquat: row.rack_height_squat,
      squatRackSetting: row.squat_rack_setting,
      rackHeightBench: row.rack_height_bench,
      benchSafetyHeight: row.bench_safety_height,
      benchSpotting: row.bench_spotting,
    };
  });
  const attempts: BoardAttempt[] = (attemptRows ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    lift: row.lift,
    attemptNumber: row.attempt_number,
    weightKg: row.weight_kg,
    result: row.result,
    decidedAt: row.decided_at,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
      </div>

      <ScoresheetBoard
        competitionId={comp.id}
        isTeamCompetition={comp.is_team_competition}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        platforms={platforms}
        sessions={sessions}
        flights={flights}
        weightClasses={weightClasses}
        divisions={divisions}
        entries={entries}
        attempts={attempts}
      />
    </div>
  );
}
