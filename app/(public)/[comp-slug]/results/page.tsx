import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LIFT_LABELS } from '@/lib/constants';
import { formatLifterName } from '@/lib/lifters/name';
import { computeTeamStandings, type StandingMemberInput, type StandingTeamInput } from '@/lib/scoring/team-standings';
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
  const isPubliclyVisible =
    comp.status === 'published' || comp.status === 'active' || comp.status === 'completed';
  if (!isPubliclyVisible) {
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
    supabase.from('attempts').select('entry_id, lift, weight_kg').eq('competition_id', comp.id).eq('result', 'good_lift'),
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

  // Best successful lift per member, keyed by entry + lift.
  const bestByEntryLift = new Map<string, number>();
  for (const attempt of attemptRows ?? []) {
    if (attempt.weight_kg === null) {
      continue;
    }
    const key = `${attempt.entry_id}|${attempt.lift}`;
    if (attempt.weight_kg > (bestByEntryLift.get(key) ?? 0)) {
      bestByEntryLift.set(key, attempt.weight_kg);
    }
  }

  const membersByTeam = new Map<string, StandingMemberInput[]>();
  for (const row of entryRows ?? []) {
    if (!row.team_id || !row.team_lift) {
      continue;
    }
    const lifter = lifterById.get(row.lifter_id);
    const members = membersByTeam.get(row.team_id) ?? [];
    members.push({
      lift: row.team_lift,
      lifterName: lifter ? formatLifterName(lifter.surname ?? '', lifter.first_name ?? '') : 'Unknown lifter',
      sex: asSex(lifter?.gender ?? null),
      bodyweightKg: row.bodyweight_kg ?? 0,
      bestLiftKg: bestByEntryLift.get(`${row.id}|${row.team_lift}`) ?? 0,
    });
    membersByTeam.set(row.team_id, members);
  }

  const standingTeams: StandingTeamInput[] = (teamRows ?? []).map((team) => ({
    teamId: team.id,
    name: team.name,
    members: membersByTeam.get(team.id) ?? [],
  }));
  const standings = computeTeamStandings(standingTeams, comp.kit_type);
  const noResultsYet = standings.length > 0 && standings.every((team) => team.total === 0);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Team standings — the sum of each team&rsquo;s three IPF GL points, taken from each member&rsquo;s best lift.
        </p>
      </div>

      {standings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          No teams yet.
        </p>
      ) : (
        <>
          {noResultsYet ? (
            <p className="text-sm text-neutral-500">No successful lifts recorded yet.</p>
          ) : null}
          <ol className="space-y-3">
            {standings.map((team) => (
              <li key={team.teamId} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="w-8 text-lg font-semibold tabular-nums text-neutral-500">{team.rank}</span>
                    <span className="text-base font-medium text-neutral-900">{team.name}</span>
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-neutral-900">{team.total.toFixed(2)}</span>
                </div>
                <ul className="mt-2 space-y-0.5 pl-11 text-sm text-neutral-600">
                  {team.members.map((member) => (
                    <li key={member.lift} className="flex justify-between gap-4">
                      <span>
                        {LIFT_LABELS[member.lift]}: {member.lifterName}
                      </span>
                      <span className="tabular-nums">
                        {member.bestLiftKg > 0 ? `${member.bestLiftKg} kg` : '—'} · {member.points.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
