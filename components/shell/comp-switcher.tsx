'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Database } from '@/types/database.types';
import { COMP_STATUS_LABELS } from '@/lib/constants';
import { COMP_STATUS_DOT_CLASS } from '@/components/ui/status-badge';
import { IconBarbell, IconChevronDown } from '@/components/shell/icons';

type CompStatus = Database['public']['Enums']['comp_status'];

// The competition the sidebar is scoped to, plus what the switcher menu needs to list the rest.
export type ShellComp = {
  id: string;
  slug: string;
  name: string;
  status: CompStatus;
  isTeamCompetition: boolean;
};

type CompSwitcherProps = {
  comps: ShellComp[];
  activeComp: ShellComp;
  collapsed: boolean;
  // Collapsed rail: the switcher can't render its menu in 4rem, so a click hands back to the shell
  // to expand the sidebar first. Omitted where the sidebar is never collapsed (the mobile drawer).
  onExpandRequest?: () => void;
};

// Competition context switcher at the top of the sidebar (the Vercel/Supabase "project switcher"
// pattern): shows which comp the comp-scoped nav below it belongs to, and jumps to any other comp
// (landing on its Checklist page) or back to the full competitions list.
export function CompSwitcher({ comps, activeComp, collapsed, onExpandRequest }: CompSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — same dismiss behaviour as the board Options dropdown.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      // MouseEvent.target is typed EventTarget | null; contains() wants a Node. A DOM mouse event's
      // target is always a Node, so the assertion is sound.
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onExpandRequest?.()}
        title={activeComp.name}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold text-white hover:bg-white/20"
      >
        <span aria-hidden="true">{activeComp.name.charAt(0).toUpperCase()}</span>
        <span className="sr-only">Expand navigation to switch competition</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2.5 text-left hover:bg-white/15"
      >
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${COMP_STATUS_DOT_CLASS[activeComp.status]}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white" title={activeComp.name}>
            {activeComp.name}
          </span>
          <span className="block text-[11px] text-white/50">{COMP_STATUS_LABELS[activeComp.status]}</span>
        </span>
        <IconChevronDown className="h-4 w-4 flex-shrink-0 text-white/50" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Switch competition"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-lg"
        >
          <Link
            href="/comps"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-b border-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <IconBarbell className="h-4 w-4 text-neutral-400" />
            All competitions
          </Link>
          <div className="max-h-72 overflow-y-auto py-1">
            {comps.map((comp) => (
              <Link
                key={comp.id}
                href={`/${comp.slug}/checklist`}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={comp.id === activeComp.id ? 'true' : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50 ${
                  comp.id === activeComp.id ? 'bg-brand-50 font-medium text-brand-800' : 'text-neutral-700'
                }`}
              >
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${COMP_STATUS_DOT_CLASS[comp.status]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate" title={comp.name}>
                  {comp.name}
                </span>
                <span className="flex-shrink-0 text-[11px] text-neutral-400">
                  {COMP_STATUS_LABELS[comp.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
