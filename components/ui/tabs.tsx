'use client';

import { useId, useRef, useState, type ReactNode } from 'react';

export type TabDef<T extends string> = {
  id: T;
  label: string;
  // Attention count rendered as a badge after the label (e.g. submissions awaiting approval).
  // Hidden at 0 — the badge means "something needs you", not "here is a count".
  badge?: number;
};

type TabsProps<T extends string> = {
  tabs: TabDef<T>[];
  // The tab shown on first render; selection after that is the user's and survives server
  // refreshes (router.refresh re-renders the panels but leaves this client state alone).
  initialTabId: T;
  // Panel content keyed by tab id. The generic ties this to the tabs array's ids, so a missing
  // or misspelled panel key is a compile error rather than a silently empty tabpanel. Every
  // panel stays mounted — inactive ones are hidden, not unmounted — so realtime subscriptions
  // keep running and mid-edit form state survives a tab switch.
  panels: Record<T, ReactNode>;
  // When set, the selected tab is mirrored into this URL search param (history.replaceState —
  // no server round-trip, no history spam), so the tab can be deep-linked and survives
  // navigating away and back. The page reads the param server-side into initialTabId.
  searchParam?: string;
  className?: string;
};

// The standard tab bar: an underlined tablist segmenting one screen into views (first used on the
// entries screen: Add lifters / Awaiting approval / Registered lifters). Follows the WAI-ARIA tabs
// pattern — roving tabindex, arrow-key navigation with automatic activation, Home/End.
export function Tabs<const T extends string>({
  tabs,
  initialTabId,
  panels,
  searchParam,
  className,
}: TabsProps<T>) {
  const baseId = useId();
  const [activeId, setActiveId] = useState<T>(
    // The runtime fallback backstops an out-of-list id (e.g. a hand-edited URL param a caller
    // passed through unvalidated); the generic makes the usual callers safe at compile time.
    tabs.some((tab) => tab.id === initialTabId) ? initialTabId : (tabs[0]?.id ?? initialTabId),
  );
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function tabDomId(id: T): string {
    return `${baseId}-tab-${id}`;
  }

  function panelDomId(id: T): string {
    return `${baseId}-panel-${id}`;
  }

  // Activates a tab and focuses it (the WAI-ARIA pattern expects focus to follow activation on
  // click and keyboard alike — Safari does not focus a clicked button natively). Mirrors the
  // choice into the URL when the caller asked for that.
  function select(id: T) {
    setActiveId(id);
    tabRefs.current.get(id)?.focus();
    if (searchParam) {
      const url = new URL(globalThis.location.href);
      url.searchParams.set(searchParam, id);
      globalThis.history.replaceState(null, '', url);
    }
  }

  // Selects the tab `step` places along, wrapping (the roving-tabindex pattern).
  function move(fromId: T, step: number) {
    const fromIndex = tabs.findIndex((tab) => tab.id === fromId);
    if (fromIndex === -1) {
      return;
    }
    const next = tabs[(fromIndex + step + tabs.length) % tabs.length];
    if (next) {
      select(next.id);
    }
  }

  function onKeyDown(event: React.KeyboardEvent, id: T) {
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
              onClick={() => select(tab.id)}
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
