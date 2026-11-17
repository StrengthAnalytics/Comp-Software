'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { TOUCH_SCREEN_MEDIA_QUERY } from '@/lib/constants';

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
//
// On a phone, focusing a text box opens the keyboard, which covers the bottom half of the screen and
// leaves the top of the form scrolled out of view before the volunteer has read it. So on a touch
// screen the dialog focuses its own panel instead (screen readers still land inside the dialog), and
// the keyboard only opens when someone taps a box.
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
    // A control marked data-autofocus (the main action of a one-tap dialog), else the first visible
    // form field, else the panel's first button (a dialog of actions only).
    const panel = panelRef.current;
    const firstField =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input:not([tabindex="-1"]):not([type="hidden"]), select, textarea') ??
      panel?.querySelector<HTMLElement>('button');
    const opensKeyboard =
      firstField instanceof HTMLTextAreaElement ||
      (firstField instanceof HTMLInputElement && !['checkbox', 'radio'].includes(firstField.type));
    // matchMedia is missing in some test environments; treat that as a desktop browser.
    const isTouchScreen = globalThis.matchMedia?.(TOUCH_SCREEN_MEDIA_QUERY).matches ?? false;
    if (opensKeyboard && isTouchScreen) {
      panel?.focus();
    } else {
      firstField?.focus();
    }

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
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl focus:outline-none sm:max-w-md sm:rounded-xl"
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
