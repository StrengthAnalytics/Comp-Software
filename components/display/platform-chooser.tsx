import Link from 'next/link';
import type { BoardPlatform } from '@/lib/scorekeeper/board-types';

// Light-surface empty state + platform chooser shared by the per-platform venue displays (loading
// crew, warm-up board). It paints over the (display) layout's light background before a platform is
// selected. `title` names the screen, `emptyMessage` shows when no platform has a session yet, and
// `hrefForPlatform` builds the per-platform URL (each display owns its own route + query).
export function DisplayPlatformChooser({
  title,
  candidates,
  emptyMessage,
  hrefForPlatform,
}: {
  title: string;
  candidates: BoardPlatform[];
  emptyMessage: string;
  hrefForPlatform: (platformId: string) => string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {candidates.length === 0 ? (
        <p className="text-sm text-neutral-600">{emptyMessage}</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Choose the platform this screen is for:</p>
          <ul className="space-y-2">
            {candidates.map((platform) => (
              <li key={platform.id}>
                <Link
                  href={hrefForPlatform(platform.id)}
                  className="block rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
                >
                  {platform.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
