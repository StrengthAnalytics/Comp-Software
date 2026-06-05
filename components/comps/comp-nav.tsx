'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type CompNavProps = {
  slug: string;
  compId: string;
  compName: string;
  isTeamCompetition: boolean;
};

type NavItem = { label: string; href: string; newTab?: boolean };

// Persistent left-hand navigation for a competition's admin section. Rendered by the comp-slug
// layout (operational pages) and the comp edit page (Setup), which sit in different route segments,
// so both feed it the comp's slug + id and it highlights the active section via the current path.
export function CompNav({ slug, compId, compName, isTeamCompetition }: CompNavProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { label: 'Setup', href: `/comps/${compId}/edit` },
    { label: 'Sessions & flights', href: `/${slug}/flights` },
    { label: 'Lifters', href: `/${slug}/entries` },
    { label: 'Weigh-in', href: `/${slug}/weigh-in` },
    { label: 'Rack heights', href: `/${slug}/rack-heights` },
    // The run screen runs full-window during a meet, so open it in its own tab from the nav.
    { label: 'Run', href: `/${slug}/run`, newTab: true },
    // The loading-crew display is a full-screen, per-platform venue screen — its own tab too.
    { label: 'Loading crew', href: `/${slug}/loading`, newTab: true },
    // The warm-up board is a full-screen, per-platform venue screen (read-only run scoresheet) —
    // sign-in-free so it can be shared with lifters/spectators. Opens in its own tab.
    { label: 'Warm-up board', href: `/${slug}/warm-up`, newTab: true },
    ...(isTeamCompetition
      ? [
          { label: 'Teams', href: `/${slug}/teams` },
          // The public results page sits outside the admin chrome, so open it in a new tab.
          { label: 'Team standings', href: `/${slug}/results`, newTab: true },
        ]
      : []),
  ];

  return (
    <nav aria-label="Competition sections" className="space-y-1">
      <div className="px-3 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Competition</p>
        <p className="mt-1 truncate text-sm font-semibold text-neutral-900" title={compName}>
          {compName}
        </p>
      </div>
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            target={item.newTab ? '_blank' : undefined}
            rel={item.newTab ? 'noopener noreferrer' : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'block rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white'
                : 'block rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100'
            }
          >
            {item.label}
            {item.newTab ? <span className="sr-only"> (opens in new tab)</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
