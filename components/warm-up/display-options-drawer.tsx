'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { BoardOptionToggle } from '@/components/scorekeeper/board-options';

// The table-zoom control's state and handlers, lifted from the board so the drawer just renders them.
type ZoomControl = {
  level: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

type SwitchControl = { checked: boolean; onToggle: () => void };

type DisplayOptionsDrawerProps = {
  open: boolean;
  onClose: () => void;
  // Master toggle for the whole up-next card strip.
  showCards: SwitchControl;
  // "Lifts to next flight" mode: a fixed current + next + count three-card strip.
  flightCount: SwitchControl;
  upNextOptions: readonly number[];
  upNextCount: number;
  onUpNextChange: (count: number) => void;
  // The optional plate/rack detail toggle for the up-next cards, or null when it doesn't apply (5-up,
  // where the cards are too narrow for the diagram, or countMode, which has its own third card).
  upNextDetail: SwitchControl | null;
  zoom: ZoomControl;
  columnToggles: BoardOptionToggle[];
};

const SEGMENT_BUTTON = 'px-3 py-1.5 text-sm font-semibold tabular-nums';
const ZOOM_BUTTON =
  'rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium leading-none text-neutral-700 hover:bg-neutral-100 disabled:opacity-40';

// A slide-out panel from the right holding every warm-up board view control — how many up-next lifters
// to show, the table zoom, and which columns are visible — so the always-on header stays a clean status
// bar with a single "Display options" button instead of a crowded row of controls. It opens over the
// board with a dismiss backdrop and closes on the backdrop, the × button, or Escape. The panel stays
// mounted (so it can slide in and out) but is inert/aria-hidden and off-screen when closed.
export function DisplayOptionsDrawer({
  open,
  onClose,
  showCards,
  flightCount,
  upNextOptions,
  upNextCount,
  onUpNextChange,
  upNextDetail,
  zoom,
  columnToggles,
}: DisplayOptionsDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // The element focused before the drawer opened (the "Display options" trigger), so focus can return
  // to it on close instead of being stranded on <body>.
  const triggerRef = useRef<HTMLElement | null>(null);

  // Escape closes; captured + propagation stopped so it can't also fire a host handler (e.g. a board's
  // full-screen-collapse on Escape).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKeyDown, true);
    return () => globalThis.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Move focus into the panel on open (so keyboard/AT users land on the controls) and return it to the
  // trigger on close — otherwise applying `inert` to the closing panel while focus is still inside it
  // drops focus to <body>, so the next Tab restarts from the top of the page.
  useEffect(() => {
    if (open) {
      const active = globalThis.document.activeElement;
      triggerRef.current = active instanceof HTMLElement ? active : null;
      closeButtonRef.current?.focus();
    } else {
      triggerRef.current?.focus();
      triggerRef.current = null;
    }
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[55] bg-black/30 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Display options"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-[60] flex w-80 max-w-[90vw] transform flex-col bg-white text-neutral-900 shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold">Display options</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close display options"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Section title="Up next cards">
            <SwitchRow label="Show up-next cards" checked={showCards.checked} onToggle={showCards.onToggle} />
            {showCards.checked ? (
              <div className="mt-2 space-y-2">
                <SwitchRow
                  label="Lifts to next flight"
                  checked={flightCount.checked}
                  onToggle={flightCount.onToggle}
                />
                {flightCount.checked ? (
                  <p className="px-2 text-xs text-neutral-500">
                    Shows the current lifter, the next lifter, and the number of lifts until the next flight.
                  </p>
                ) : (
                  <>
                    <div className="px-2 pt-1">
                      <p className="mb-1 text-xs font-medium text-neutral-500">Number of lifters</p>
                      <div
                        className="flex w-max overflow-hidden rounded border border-neutral-300"
                        role="group"
                        aria-label="Number of up-next lifters"
                      >
                        {upNextOptions.map((option) => {
                          const active = option === upNextCount;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => onUpNextChange(option)}
                              aria-pressed={active}
                              className={`${SEGMENT_BUTTON} ${
                                active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {upNextDetail ? (
                      <SwitchRow
                        label="Plate loading & rack heights"
                        checked={upNextDetail.checked}
                        onToggle={upNextDetail.onToggle}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </Section>

          <Section title="Table zoom">
            <div className="flex items-center gap-2" role="group" aria-label="Table zoom">
              <button
                type="button"
                onClick={zoom.onZoomOut}
                disabled={!zoom.canZoomOut}
                aria-label="Zoom out"
                className={ZOOM_BUTTON}
              >
                −
              </button>
              <span className="w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {zoom.level}%
              </span>
              <button
                type="button"
                onClick={zoom.onZoomIn}
                disabled={!zoom.canZoomIn}
                aria-label="Zoom in"
                className={ZOOM_BUTTON}
              >
                +
              </button>
            </div>
          </Section>

          <Section title="Columns">
            <ul className="space-y-1">
              {columnToggles.map((toggle) => (
                <li key={toggle.id}>
                  <SwitchRow label={toggle.label} checked={toggle.checked} onToggle={toggle.onToggle} />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

// A labelled checkbox row, used for every on/off control in the drawer.
function SwitchRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-neutral-800" />
    </label>
  );
}
