import { notFound } from 'next/navigation';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { loadBoardData } from '@/lib/scorekeeper/load-board-data';
import { resolveDisplayPlatform } from '@/lib/scorekeeper/display-platforms';
import { DisplayPlatformChooser } from '@/components/display/platform-chooser';
import { LifterOverlay } from '@/components/overlay/lifter-overlay';

// OBS browser-source overlay: the lower-third for the lifter currently on the platform. Transparent
// background (the (overlay) layout), fixed 1920×1080 canvas, no chrome — drop it on the livestream as
// a Browser Source (which carries the page's alpha natively, so no chroma key is needed). It reads anon
// like the public warm-up board: `loadBoardData({ publicView: true })` sources lifter names from the
// PII-free `public_lifters` view, and every other table read is covered by the anon read policies
// scoped to publicly-visible comps — so the overlay works in OBS's headless browser (which does not
// share the admin session) once the comp is published, with no separate overlay auth.
export default async function LifterOverlayPage({
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

  // Anon reads (and the public_lifters view) only return rows for a publicly-visible comp. Until the
  // comp is published the overlay would render empty, so guide the operator instead — mirroring the
  // public warm-up board. (Anon can't load a non-public comp at all; this notice is reached when an
  // admin previews a still-draft comp.)
  const isPubliclyVisible =
    comp.status === 'published' || comp.status === 'active' || comp.status === 'completed';
  if (!isPubliclyVisible) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The lifter overlay appears once this competition is published. Set the status to Published (or Active during
          the meet) on the competition details.
        </p>
      </main>
    );
  }

  const { platforms, sessions, flights, weightClasses, divisions, teams, entries, attempts } = await loadBoardData(
    comp.id,
    { publicView: true },
  );

  const { platform: requested } = await searchParams;
  const requestedId = Array.isArray(requested) ? requested[0] : requested;
  const { candidates, selected } = resolveDisplayPlatform(platforms, sessions, requestedId);

  if (!selected) {
    return (
      <DisplayPlatformChooser
        title="Lifter overlay"
        candidates={candidates}
        emptyMessage="No sessions are assigned to a platform yet. Set up sessions & flights to use the overlay."
        hrefForPlatform={(platformId) => `/${comp.slug}/lifter?platform=${platformId}`}
      />
    );
  }

  return (
    <LifterOverlay
      competitionId={comp.id}
      platformId={selected.id}
      isTeamCompetition={comp.is_team_competition}
      kitType={comp.kit_type}
      lifts={LIFTS_FOR_EVENT[comp.event_type]}
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
