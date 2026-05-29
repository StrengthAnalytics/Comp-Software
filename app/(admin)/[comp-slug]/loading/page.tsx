import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { loadBoardData } from '@/lib/scorekeeper/load-board-data';
import { LoadingDisplay } from '@/components/loading/loading-display';

// Sessions with no assigned platform are grouped under this synthetic platform id/name, so a comp
// that has not assigned platforms can still drive the crew display.
const UNASSIGNED_PLATFORM = { id: 'none', name: 'Unassigned platform' };

// The loading-crew display is scoped to one platform via the ?platform=<id> query (per-platform URL).
// With a single platform it auto-selects; with several and none chosen it renders a chooser.
export default async function LoadingPage({
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

  const { platforms, sessions, flights, entries, attempts } = await loadBoardData(comp.id);

  // Only platforms that actually have sessions can be live; include the synthetic "unassigned"
  // platform when any session has no platform of its own.
  const sessionPlatformIds = new Set(sessions.map((session) => session.platformId ?? UNASSIGNED_PLATFORM.id));
  const candidates = [
    ...platforms.filter((platform) => sessionPlatformIds.has(platform.id)),
    ...(sessionPlatformIds.has(UNASSIGNED_PLATFORM.id) ? [UNASSIGNED_PLATFORM] : []),
  ];

  const { platform: requested } = await searchParams;
  const requestedId = Array.isArray(requested) ? requested[0] : requested;
  const selected =
    candidates.find((platform) => platform.id === requestedId) ?? (candidates.length === 1 ? candidates[0] : undefined);

  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Loading crew display</h1>
        <p className="text-sm text-neutral-600">
          No sessions are assigned to a platform yet. Set up sessions &amp; flights to use the crew display.
        </p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Loading crew display</h1>
        <p className="text-sm text-neutral-600">Choose the platform this screen is for:</p>
        <ul className="space-y-2">
          {candidates.map((platform) => (
            <li key={platform.id}>
              <Link
                href={`/${comp.slug}/loading?platform=${platform.id}`}
                className="block rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
              >
                {platform.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <LoadingDisplay
      competitionId={comp.id}
      compName={comp.name}
      platformId={selected.id}
      platformName={selected.name}
      sessions={sessions}
      flights={flights}
      entries={entries}
      attempts={attempts}
    />
  );
}
