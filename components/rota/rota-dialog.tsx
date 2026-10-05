'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type RotaDialogProps = {
  title: string;
  // A line under the title, e.g. the slot being signed up for.
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

// The small pop-up the rota grid opens when a slot is tapped (sign up, add a helper, a volunteer's
// contact details, request a change). A fixed overlay rather than a native <dialog> so it renders the
// same in every browser and in tests; it follows the modal-dialog pattern — labelled, Escape and the
// backdrop close it, focus moves into it on open and back to the opener on close.
export function RotaDialog({ title, description, onClose, children }: RotaDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Hold the latest onClose so the Escape listener needn't re-subscribe on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = globalThis.document.activeElement;
    // The first form field, else the panel's first button (a dialog of actions only).
    const panel = panelRef.current;
    const firstField =
      panel?.querySelector<HTMLElement>('input:not([tabindex="-1"]), select, textarea') ??
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('button');
    firstField?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-0 sm:items-center sm:p-4">
      {/* Backdrop: a click outside the panel closes it (keyboard users have Escape and the × button). */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
              {title}
            </h2>
            {description ? <div className="mt-0.5 text-sm text-neutral-600">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
