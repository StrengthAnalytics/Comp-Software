'use client';

import { useEffect, useRef, useState } from 'react';

// A single view-option toggle shown in the Options dropdown. `disabled` greys it out and blocks input —
// used when another option controls it (e.g. the warm-up board's "collapse finished lifts" takes over
// the per-lift attempt and Best toggles).
export type BoardOptionToggle = {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

// Default light-toolbar trigger styling (matches the run screen's ghost buttons). A dark header can
// override it via `triggerClassName`.
const DEFAULT_TRIGGER =
  'rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';

// A small "Options ▾" dropdown holding view toggles (which columns to show, row striping, …). The
// trigger toggles it; clicking outside or pressing Escape closes it. Escape is captured and its
// propagation stopped so it can't also fire a host handler (e.g. the run screen's full-screen
// collapse). Shared by the run screen and the warm-up board; `triggerClassName` lets a dark header
// restyle the trigger.
export function BoardOptions({
  toggles,
  triggerClassName = DEFAULT_TRIGGER,
}: {
  toggles: BoardOptionToggle[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      // event.target is typed EventTarget | null; a pointerdown always originates from a DOM Node,
      // so the cast is safe and Node.contains accepts it.
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    // Escape closes the menu. Listen in the capture phase and stop propagation so it beats a host
    // keydown handler (which would otherwise collapse the run screen's full-screen view).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    globalThis.addEventListener('pointerdown', onPointerDown);
    globalThis.addEventListener('keydown', onKeyDown, true);
    return () => {
      globalThis.removeEventListener('pointerdown', onPointerDown);
      globalThis.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        className={triggerClassName}
      >
        Options ▾
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-neutral-200 bg-white p-1 text-left shadow-lg">
          {toggles.map((toggle) => (
            <label
              key={toggle.id}
              className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm ${
                toggle.disabled
                  ? 'cursor-not-allowed text-neutral-400'
                  : 'cursor-pointer text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>{toggle.label}</span>
              <input
                type="checkbox"
                checked={toggle.checked}
                onChange={toggle.onToggle}
                disabled={toggle.disabled}
                className="h-4 w-4 accent-neutral-800 disabled:opacity-50"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
