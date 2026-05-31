import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { formatLifterName } from '@/lib/lifters/name';
import { TeamStandingsLive } from '@/components/results/team-standings-live';
import type { StandingMemberSeed, TeamSeed } from '@/lib/realtime/use-team-standings';
import type { BoardAttempt } from '@/lib/scorekeeper/board-types';
import type { Sex } from '@/lib/scoring/ipf-gl';

function asSex(gender: string | null): Sex {
  return gender === 'female' ? 'female' : 'male';
}

export default async function ResultsPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, status, kit_type, is_team_competition')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  if (!comp.is_team_competition) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-2 text-sm text-neutral-600">Final results for this competition will appear here.</p>
      </main>
    );
  }

  // Lifter names come from public_lifters, which is scoped to publicly visible comps. Until the comp
  // is published the view returns no rows (names would show as "Unknown"), so guide the operator
  // rather than render an empty-looking table.
  if (!isCompPubliclyVisible(comp.status)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Team standings and lifter names appear once this competition is published. Set the status to Published (or
          Active during the meet) on the competition details.
        </p>
      </main>
    );
  }

  const [{ data: teamRows }, { data: entryRows }, { data: attemptRows }] = await Promise.all([
    supabase.from('teams').select('id, name, sort_order').eq('competition_id', comp.id).order('sort_order', { ascending: true }),
    supabase
      .from('entries')
      .select('id, lifter_id, team_id, team_lift, bodyweight_kg')
      .eq('competition_id', comp.id)
      .not('team_id', 'is', null),
    // All attempts (not just good lifts): the actual total reads the good lifts, the predicted total
    // also needs the declared-but-unjudged attempts that are still in play.
    supabase
      .from('attempts')
      .select('id, entry_id, lift, attempt_number, weight_kg, result, decided_at')
      .eq('competition_id', comp.id),
  ]);

  // Names and gender come from the PII-free public_lifters view so the page works for anon visitors.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('public_lifters').select('id, first_name, surname, gender').in('id', lifterIds)
      : { data: [] as { id: string | null; first_name: string | null; surname: string | null; gender: string | null }[] };

  const lifterById = new Map<string, { first_name: string | null; surname: string | null; gender: string | null }>();
  for (const lifter of lifterRows ?? []) {
    if (lifter.id) {
      lifterById.set(lifter.id, lifter);
    }
  }

  const teams: TeamSeed[] = (teamRows ?? []).map((team) => ({ id: team.id, name: team.name }));

  const initialMembers: StandingMemberSeed[] = (entryRows ?? [])
    .filter((row) => row.team_id !== null && row.team_lift !== null)
    .map((row) => {
      const lifter = lifterById.get(row.lifter_id);
      return {
        entryId: row.id,
        teamId: row.team_id,
        lift: row.team_lift,
        lifterName: lifter ? formatLifterName(lifter.surname ?? '', lifter.first_name ?? '') : 'Unknown lifter',
        sex: asSex(lifter?.gender ?? null),
        bodyweightKg: row.bodyweight_kg ?? 0,
      };
    });

  const initialAttempts: BoardAttempt[] = (attemptRows ?? []).map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    lift: row.lift,
    attemptNumber: row.attempt_number,
    weightKg: row.weight_kg,
    result: row.result,
    decidedAt: row.decided_at,
  }));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-1 text-base text-neutral-600">
          Team standings — the sum of each team&rsquo;s three IPF GL points, taken from each member&rsquo;s best lift.
          Amber shows the projected total if the current attempts are made.
        </p>
      </div>

      <TeamStandingsLive
        competitionId={comp.id}
        kitType={comp.kit_type}
        teams={teams}
        initialMembers={initialMembers}
        initialAttempts={initialAttempts}
      />
    </main>
  );
}
