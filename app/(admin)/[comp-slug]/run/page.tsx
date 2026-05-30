import { notFound } from 'next/navigation';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { loadBoardData } from '@/lib/scorekeeper/load-board-data';
import { ScoresheetBoard } from '@/components/scorekeeper/scoresheet-board';

export default async function RunPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const { platforms, sessions, flights, weightClasses, divisions, teams, entries, attempts } = await loadBoardData(
    comp.id,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
      </div>

      <ScoresheetBoard
        competitionId={comp.id}
        isTeamCompetition={comp.is_team_competition}
        kitType={comp.kit_type}
        lifts={LIFTS_FOR_EVENT[comp.event_type]}
        platforms={platforms}
        sessions={sessions}
        flights={flights}
        weightClasses={weightClasses}
        divisions={divisions}
        teams={teams}
        entries={entries}
        attempts={attempts}
      />
    </div>
  );
}
