import { notFound } from 'next/navigation';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { loadBoardData } from '@/lib/scorekeeper/load-board-data';
import { resolveDisplayPlatform } from '@/lib/scorekeeper/display-platforms';
import { DisplayPlatformChooser } from '@/components/display/platform-chooser';
import { WarmUpDisplay } from '@/components/warm-up/warm-up-display';

// The public, sign-in-free warm-up room board — the comp's live public view. Identical to the admin
// `/warm-up` display — the read-only run scoresheet mirror, the up-next cards and the per-platform
// `?platform=` scoping — but it lives in the (public) route group (no admin gate) and loads its
// snapshot with `publicView`, so lifter names come from the PII-free `public_lifters` view rather than
// the admin-only base table. Everything else is read straight from the tables' anon read policies,
// which only return rows for a publicly-visible comp; hence the published-status guard below.
export default async function PublicLivePage({
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
  // comp is published the board would render with no lifter names, so guide the operator instead —
  // mirroring the public results page. (Anon can't load a non-public comp at all; this notice is
  // reached when an admin previews a still-draft comp.)
  const isPubliclyVisible =
    comp.status === 'published' || comp.status === 'active' || comp.status === 'completed';
  if (!isPubliclyVisible) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The public live board appears once this competition is published. Set the status to Published (or Active
          during the meet) on the competition details.
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
        title="Warm-up board"
        candidates={candidates}
        emptyMessage="No sessions are assigned to a platform yet. Set up sessions & flights to use the warm-up board."
        hrefForPlatform={(platformId) => `/${comp.slug}/live?platform=${platformId}`}
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
