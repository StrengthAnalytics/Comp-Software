import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatLifterName } from '@/lib/lifters/name';
import { TeamsManager, type TeamMemberEntry } from '@/components/teams/teams-manager';

export default async function TeamsPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, is_team_competition')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  if (!comp.is_team_competition) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        </div>
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          This competition isn&rsquo;t a team competition. Turn on “Team competition” on the competition details to build
          teams.
        </p>
      </div>
    );
  }

  const [{ data: teams }, { data: entryRows }] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase.from('entries').select('id, lifter_id, team_id, team_lift').eq('competition_id', comp.id),
  ]);

  // The generated types carry no relationships, so lifters are joined in a second query rather than
  // an embedded select, matching the rest of the codebase.
  const lifterIds = [...new Set((entryRows ?? []).map((row) => row.lifter_id))];
  const { data: lifterRows } =
    lifterIds.length > 0
      ? await supabase.from('lifters').select('id, first_name, surname').in('id', lifterIds)
      : { data: [] as { id: string; first_name: string; surname: string }[] };

  const lifterById = new Map((lifterRows ?? []).map((lifter) => [lifter.id, lifter]));

  const entries: TeamMemberEntry[] = (entryRows ?? [])
    .map((row): TeamMemberEntry | null => {
      const lifter = lifterById.get(row.lifter_id);
      if (!lifter) {
        return null;
      }
      return {
        id: row.id,
        team_id: row.team_id,
        team_lift: row.team_lift,
        lifter_name: formatLifterName(lifter.surname, lifter.first_name),
      };
    })
    .filter((entry): entry is TeamMemberEntry => entry !== null)
    .toSorted((a, b) => a.lifter_name.localeCompare(b.lifter_name));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Each team is three lifters — one on squat, one on bench, one on deadlift. The team score is the sum of their
          IPF GL points.
        </p>
      </div>

      <TeamsManager competitionId={comp.id} teams={teams ?? []} entries={entries} />
    </div>
  );
}
