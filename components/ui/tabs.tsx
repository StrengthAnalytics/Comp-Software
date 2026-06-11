'use client';

import { useId, useRef, useState, type ReactNode } from 'react';

export type TabDef = {
  id: string;
  label: string;
  // Attention count rendered as a badge after the label (e.g. submissions awaiting approval).
  // Hidden at 0 — the badge means "something needs you", not "here is a count".
  badge?: number;
};

type TabsProps = {
  tabs: TabDef[];
  // The tab shown on first render; selection after that is the user's and survives server
  // refreshes (router.refresh re-renders the panels but leaves this client state alone).
  initialTabId: string;
  // Panel content keyed by tab id. Every panel stays mounted — inactive ones are hidden, not
  // unmounted — so realtime subscriptions keep running and mid-edit form state survives a
  // tab switch.
  panels: Record<string, ReactNode>;
  className?: string;
};

// The standard tab bar: an underlined tablist segmenting one screen into views (first used on the
// entries screen: Add lifters / Awaiting approval / Registered lifters). Follows the WAI-ARIA tabs
// pattern — roving tabindex, arrow-key navigation with automatic activation, Home/End.
export function Tabs({ tabs, initialTabId, panels, className }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(
    tabs.some((tab) => tab.id === initialTabId) ? initialTabId : (tabs[0]?.id ?? ''),
  );
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function tabDomId(id: string): string {
    return `${baseId}-tab-${id}`;
  }

  function panelDomId(id: string): string {
    return `${baseId}-panel-${id}`;
  }

  // Selects and focuses the tab `step` places along, wrapping (the roving-tabindex pattern).
  function move(fromId: string, step: number) {
    const fromIndex = tabs.findIndex((tab) => tab.id === fromId);
    if (fromIndex === -1) {
      return;
    }
    const next = tabs[(fromIndex + step + tabs.length) % tabs.length];
    if (next) {
      setActiveId(next.id);
      tabRefs.current.get(next.id)?.focus();
    }
  }

  function select(id: string) {
    setActiveId(id);
    tabRefs.current.get(id)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, id: string) {
    switch (event.key) {
      case 'ArrowRight': {
        event.preventDefault();
        move(id, 1);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        move(id, -1);
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (tabs[0]) {
          select(tabs[0].id);
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        const last = tabs.at(-1);
        if (last) {
          select(last.id);
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  return (
    <div className={className}>
      <div role="tablist" className="flex flex-wrap gap-x-6 border-b border-neutral-200">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={tabDomId(tab.id)}
              aria-selected={active}
              aria-controls={panelDomId(tab.id)}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand-600 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 ? (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelDomId(tab.id)}
          aria-labelledby={tabDomId(tab.id)}
          hidden={tab.id !== activeId}
          className="pt-6"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
