import { createClient } from '@/lib/supabase/server';
import { formatLifterName } from '@/lib/lifters/name';
import type { Sex } from '@/lib/scoring/ipf-gl';
import type {
  BoardAttempt,
  BoardEntry,
  BoardFlight,
  BoardPlatform,
  BoardSession,
  NamedOption,
} from '@/lib/scorekeeper/board-types';

// Gender is stored free-form-ish on the lifter; the IPF GL coefficients only distinguish female from
// everyone else, matching the public results page.
function asSex(gender: string | null): Sex {
  return gender === 'female' ? 'female' : 'male';
}

export type BoardData = {
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  weightClasses: NamedOption[];
  divisions: NamedOption[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// Loads the full live-scorekeeping snapshot for a competition — platforms, sessions, flights, weight
// classes, divisions, entries (with rack settings) and attempts — mapped into the flat Board* shapes
// the client surfaces consume. Shared by the run screen and the loading-crew display so both seed
// from one identical query set (and then reconcile via the same realtime subscriptions).
export async function loadBoardData(competitionId: string): Promise<BoardData> {
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
    supabase.from('platforms').select('id, name').eq('competition_id', competitionId).order('name', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, name, sort_order, platform_id')
      .eq('competition_id', competitionId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('flights')
      .select('id, session_id, name, sort_order')
      .eq('competition_id', competitionId)
      .order('sort_order', { ascending: true }),
    supabase.from('weight_classes').select('id, name').eq('competition_id', competitionId),
    supabase.from('divisions').select('id, name').eq('competition_id', competitionId),
    supabase
      .from('entries')
      .select(
        'id, lifter_id, flight_id, weight_class_id, division_id, lot_number, team_lift, bodyweight_kg, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting',
      )
      .eq('competition_id', competitionId),
    supabase
      .from('attempts')
      .select('id, entry_id, lift, attempt_number, weight_kg, result, decided_at')
      .eq('competition_id', competitionId),
  ]);

  // The generated types carry no relationships, so lifter names are joined in a second query rather
  // than an embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname, gender').in('id', lifterIds)
      : { data: [] as { id: string; first_name: string; surname: string; gender: string | null }[] };
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
      sex: asSex(lifter?.gender ?? null),
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

  return { platforms, sessions, flights, weightClasses, divisions, entries, attempts };
}
