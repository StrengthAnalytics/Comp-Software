import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import {
  FlightsManager,
  type BoardEntry,
  type FlightRow,
  type PlatformOption,
  type SessionRow,
} from '@/components/flights/flights-manager';
import { type BoardTeam, type BoardTeamMember } from '@/components/flights/team-flight-board';
import { TEAM_LIFTS } from '@/types/team';
import type { Database } from '@/types/database.types';

type EventType = Database['public']['Enums']['event_type'];

type EntryRow = {
  id: string;
  lifter_id: string;
  flight_id: string | null;
  lot_number: number | null;
  weight_class_id: string | null;
  opener_squat_kg: number | null;
  opener_bench_kg: number | null;
  opener_deadlift_kg: number | null;
};

// The opener of the meet's first contested lift stands in for the declared weight when previewing
// the flight running order.
function openerForEvent(eventType: EventType, entry: EntryRow): number | null {
  const lifts = LIFTS_FOR_EVENT[eventType];
  if (lifts.squat) {
    return entry.opener_squat_kg;
  }
  if (lifts.bench) {
    return entry.opener_bench_kg;
  }
  return entry.opener_deadlift_kg;
}

export default async function FlightsPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
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

  const [
    { data: platforms },
    { data: sessions },
    { data: flights },
    { data: weightClasses },
    { data: teamRows },
    { data: entryRows },
  ] = await Promise.all([
    supabase.from('platforms').select('id, name').eq('competition_id', comp.id).order('name', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, name, session_date, start_time, platform_id, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('flights')
      .select('id, session_id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase.from('weight_classes').select('id, name').eq('competition_id', comp.id),
    supabase
      .from('teams')
      .select('id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('entries')
      .select(
        'id, lifter_id, flight_id, team_id, team_lift, lot_number, weight_class_id, opener_squat_kg, opener_bench_kg, opener_deadlift_kg',
      )
      .eq('competition_id', comp.id),
  ]);

  // The generated types carry no relationships, so lifters are joined in a second query rather than
  // an embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname').in('id', lifterIds)
      : { data: [] as { id: string; first_name: string; surname: string }[] };

  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));
  const weightClassNameById = new Map((weightClasses ?? []).map((weightClass) => [weightClass.id, weightClass.name]));

  const entries: BoardEntry[] = (entryRows ?? [])
    .map((row): BoardEntry | null => {
      const lifter = lifterById.get(row.lifter_id);
      if (!lifter) {
        return null;
      }
      return {
        id: row.id,
        flight_id: row.flight_id,
        lot_number: row.lot_number,
        opener_kg: openerForEvent(comp.event_type, row),
        weight_class_name: row.weight_class_id ? (weightClassNameById.get(row.weight_class_id) ?? null) : null,
        lifter_name: formatLifterName(lifter.surname, lifter.first_name),
      };
    })
    .filter((entry): entry is BoardEntry => entry !== null);

  // For team comps, group members under their team and derive each team's flight (the flight its
  // members share; null if none or mixed) so the board can move whole teams at once.
  const membersByTeam = new Map<string, BoardTeamMember[]>();
  const flightIdsByTeam = new Map<string, Set<string>>();
  for (const row of entryRows ?? []) {
    if (!row.team_id || !row.team_lift) {
      continue;
    }
    const lifter = lifterById.get(row.lifter_id);
    if (!lifter) {
      continue;
    }
    const members = membersByTeam.get(row.team_id) ?? [];
    members.push({ lift: row.team_lift, lifter_name: formatLifterName(lifter.surname, lifter.first_name) });
    membersByTeam.set(row.team_id, members);
    if (row.flight_id) {
      const ids = flightIdsByTeam.get(row.team_id) ?? new Set<string>();
      ids.add(row.flight_id);
      flightIdsByTeam.set(row.team_id, ids);
    }
  }

  const teams: BoardTeam[] = comp.is_team_competition
    ? (teamRows ?? []).map((team) => {
        const ids = flightIdsByTeam.get(team.id);
        const flightId = ids && ids.size === 1 ? [...ids][0] : null;
        const members = (membersByTeam.get(team.id) ?? []).toSorted(
          (a, b) => TEAM_LIFTS.indexOf(a.lift) - TEAM_LIFTS.indexOf(b.lift),
        );
        return { id: team.id, name: team.name, sort_order: team.sort_order, flightId, members };
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/comps/${comp.id}/edit`} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← {comp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sessions &amp; flights</h1>
      </div>

      <FlightsManager
        competitionId={comp.id}
        compSlug={comp.slug}
        isTeamCompetition={comp.is_team_competition}
        platforms={(platforms ?? []) as PlatformOption[]}
        sessions={(sessions ?? []) as SessionRow[]}
        flights={(flights ?? []) as FlightRow[]}
        entries={entries}
        teams={teams}
      />
    </div>
  );
}
