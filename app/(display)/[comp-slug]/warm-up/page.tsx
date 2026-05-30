import { notFound } from 'next/navigation';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { loadBoardData } from '@/lib/scorekeeper/load-board-data';
import { resolveDisplayPlatform } from '@/lib/scorekeeper/display-platforms';
import { DisplayPlatformChooser } from '@/components/display/platform-chooser';
import { WarmUpDisplay } from '@/components/warm-up/warm-up-display';

// The warm-up room display is scoped to one platform via the ?platform=<id> query (per-platform URL).
// With a single platform it auto-selects; with several and none chosen it renders a chooser. It mirrors
// the run-screen scoresheet read-only (no result buttons, so rows compress) so warming-up lifters can
// see the comp's live state and who is up next.
export default async function WarmUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'comp-slug': string }>;
  searchParams: Promise<{ platform?: string | string[] }>;
}) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const { platforms, sessions, flights, weightClasses, divisions, teams, entries, attempts } = await loadBoardData(
    comp.id,
  );

  const { platform: requested } = await searchParams;
  const requestedId = Array.isArray(requested) ? requested[0] : requested;
  const { candidates, selected } = resolveDisplayPlatform(platforms, sessions, requestedId);

  if (!selected) {
    return (
      <DisplayPlatformChooser
        title="Warm-up board"
        candidates={candidates}
        emptyMessage="No sessions are assigned to a platform yet. Set up sessions & flights to use the warm-up board."
        hrefForPlatform={(platformId) => `/${comp.slug}/warm-up?platform=${platformId}`}
      />
    );
  }

  return (
    <WarmUpDisplay
      competitionId={comp.id}
      compName={comp.name}
      isTeamCompetition={comp.is_team_competition}
      kitType={comp.kit_type}
      lifts={LIFTS_FOR_EVENT[comp.event_type]}
      platformId={selected.id}
      platformName={selected.name}
      sessions={sessions}
      flights={flights}
      weightClasses={weightClasses}
      divisions={divisions}
      teams={teams}
      entries={entries}
      attempts={attempts}
    />
  );
}
