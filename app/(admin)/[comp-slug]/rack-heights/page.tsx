import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT, type Gender } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import { RackHeightsManager, type RackEntry } from '@/components/rack-heights/rack-heights-manager';

function asGender(value: string): Gender {
  return value === 'female' ? 'female' : 'male';
}

export default async function RackHeightsPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [{ data: sessions }, { data: flights }, { data: entryRows }] = await Promise.all([
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
      .from('entries')
      .select(
        'id, lifter_id, flight_id, team_lift, lot_number, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting, racks_set',
      )
      .eq('competition_id', comp.id),
  ]);

  // The generated types carry no relationships, so lifters are joined in a second query rather than an
  // embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname, gender').in('id', lifterIds)
      : // No entries → skip the lookup; the assertion just types the empty default to the query shape.
        { data: [] as { id: string; first_name: string; surname: string; gender: string }[] };

  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));
  const flightById = new Map((flights ?? []).map((flight) => [flight.id, flight]));

  let unflightedCount = 0;
  const entries: RackEntry[] = (entryRows ?? [])
    .map((row): RackEntry | null => {
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
        lifterName: formatLifterName(lifter.surname, lifter.first_name),
        sex: asGender(lifter.gender),
        teamLift: row.team_lift,
        lotNumber: row.lot_number,
        rackHeightSquat: row.rack_height_squat,
        squatRackSetting: row.squat_rack_setting,
        rackHeightBench: row.rack_height_bench,
        benchSafetyHeight: row.bench_safety_height,
        benchSpotting: row.bench_spotting,
        racksSet: row.racks_set,
      };
    })
    .filter((entry): entry is RackEntry => entry !== null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rack heights</h1>
      </div>

      <RackHeightsManager
        competitionId={comp.id}
        compSlug={comp.slug}
        compName={comp.name}
        isTeamCompetition={comp.is_team_competition}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        sessions={sessions ?? []}
        entries={entries}
        unflightedCount={unflightedCount}
      />
    </div>
  );
}
