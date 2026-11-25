import { fillPillColour } from '@/lib/rota/style';

// The "which days does this rota cover?" strip at the top of the public board's phone layout: one
// button per day, saying how many places still need someone, that jumps down the page to that day's
// grid. Plain links to in-page anchors, so it works before (and without) any script.

export type RotaDayLink = {
  // The id of that day's grid on the page.
  anchorId: string;
  name: string;
  // How many sessions the day has, when every column of it is a session; null when it has columns
  // the organiser made by hand ("Set-up"), which aren't sessions.
  sessions: number | null;
  openSlots: number;
};

function openSlotsLabel(openSlots: number): string {
  if (openSlots === 0) {
    return 'All filled';
  }
  return openSlots === 1 ? '1 space to fill' : `${openSlots} spaces to fill`;
}

export function RotaDayLinks({ days, allDated }: { days: RotaDayLink[]; allDated: boolean }) {
  return (
    <nav aria-label="Days on this rota" className="rounded-lg border border-neutral-300 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">
        {/* A hand-made column with no day ("Set-up") isn't a day, so don't call it one. */}
        This rota {allDated ? `covers ${days.length} days` : `has ${days.length} parts`}. Check each one:
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {days.map((day) => (
          <li key={day.anchorId} className="min-w-32 flex-1">
            <a
              href={`#${day.anchorId}`}
              className="block rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-center hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="block text-sm font-semibold text-neutral-900">
                {day.name} <span aria-hidden="true">&darr;</span>
              </span>
              {day.sessions === null ? null : (
                <span className="block text-xs font-medium text-neutral-600">
                  {day.sessions === 1 ? '1 session' : `${day.sessions} sessions`}
                </span>
              )}
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${fillPillColour(day.openSlots === 0)}`}
              >
                {openSlotsLabel(day.openSlots)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
