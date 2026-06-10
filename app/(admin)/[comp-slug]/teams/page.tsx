import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { formatLifterName } from '@/lib/lifters/name';
import { TeamsManager, type TeamMemberEntry } from '@/components/teams/teams-manager';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default async function TeamsPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  if (!comp.is_team_competition) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        </div>
        <EmptyState
          title="Not a team competition"
          description="Teams are three lifters — one each on squat, bench and deadlift — scored on combined IPF GL points. Turn on Team competition in the competition details to build teams."
          action={
            <Link href={`/comps/${comp.id}/edit`} className={buttonClasses('secondary')}>
              Go to Setup
            </Link>
          }
        />
      </div>
    );
  }

  const supabase = await createClient();

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
