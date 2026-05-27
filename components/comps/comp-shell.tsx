import type { ReactNode } from 'react';
import { CompNav } from '@/components/comps/comp-nav';

type CompShellProps = {
  slug: string;
  compId: string;
  compName: string;
  isTeamCompetition: boolean;
  children: ReactNode;
};

// Two-column shell for every competition admin page: the persistent CompNav sidebar on the left,
// page content on the right. Shared by the comp-slug layout and the comp edit page so the sidebar
// stays identical across both route segments.
export function CompShell({ slug, compId, compName, isTeamCompetition, children }: CompShellProps) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="lg:w-56 lg:flex-shrink-0">
        <div className="lg:sticky lg:top-8">
          <CompNav slug={slug} compId={compId} compName={compName} isTeamCompetition={isTeamCompetition} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
