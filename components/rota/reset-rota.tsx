'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetRotaAction } from '@/actions/rota';
import { buttonClasses } from '@/components/ui/button';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON = buttonClasses('secondary');
const DANGER_BUTTON = buttonClasses('danger');

// A type-to-confirm wipe of a comp's entire rota — every column and role, and (the careful bit) every
// volunteer sign-up with their contact details. Mirrors the "delete all entrants" danger zone: the
// operator must type the competition name, and when sign-ups exist is prompted to export the contacts
// first, because the delete cascades and cannot be undone. Renders nothing for an empty rota.
export function ResetRota({
  competitionId,
  competitionName,
  sectionCount,
  roleCount,
  signupCount,
  onExport,
}: {
  competitionId: string;
  competitionName: string;
  sectionCount: number;
  roleCount: number;
  signupCount: number;
  onExport: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sectionCount === 0) {
    return null;
  }

  const confirmed = typed.trim() === competitionName.trim();

  function close() {
    if (pending) {
      return;
    }
    setOpen(false);
    setTyped('');
    setError(null);
  }

  function confirmReset() {
    if (!confirmed) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetRotaAction({ competitionId });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setOpen(false);
      setTyped('');
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-red-800">Reset the rota</h2>
      <p className="mt-1 text-sm text-red-700">
        Delete this competition&rsquo;s entire rota and start again — every column and role
        {signupCount > 0 ? (
          <>
            , <strong>and all {signupCount} volunteer sign-up{signupCount === 1 ? '' : 's'} with their
            contact details</strong>
          </>
        ) : null}
        . This cannot be undone.
      </p>
      <button type="button" onClick={() => setOpen(true)} className={`mt-4 ${DANGER_BUTTON}`}>
        Reset rota
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-rota-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              close();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
            <h3 id="reset-rota-title" className="text-lg font-semibold text-neutral-900">
              Reset this rota?
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              This permanently deletes the whole rota for <strong>{competitionName}</strong>:{' '}
              <strong>{sectionCount}</strong> column{sectionCount === 1 ? '' : 's'} and{' '}
              <strong>{roleCount}</strong> role{roleCount === 1 ? '' : 's'}
              {signupCount > 0 ? (
                <>
                  , along with <strong>{signupCount}</strong> volunteer sign-up
                  {signupCount === 1 ? '' : 's'}
                </>
              ) : null}
              . This cannot be undone.
            </p>

            {signupCount > 0 ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p>
                  You&rsquo;re about to lose <strong>{signupCount}</strong> volunteer
                  {signupCount === 1 ? '' : 's'}&rsquo; names, emails and mobiles. Download them first —
                  you can&rsquo;t get them back.
                </p>
                <button type="button" onClick={onExport} className={`mt-2 ${GHOST_BUTTON}`}>
                  Export contacts (CSV)
                </button>
              </div>
            ) : null}

            <label htmlFor="confirm-reset" className="mt-4 block text-sm text-neutral-700">
              Type <span className="font-semibold">{competitionName}</span> to confirm:
            </label>
            <input
              id="confirm-reset"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && confirmed) {
                  confirmReset();
                }
              }}
              className={`mt-1 w-full ${INPUT_CLASS}`}
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={pending} className={GHOST_BUTTON}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                disabled={!confirmed || pending}
                className={DANGER_BUTTON}
              >
                {pending ? 'Resetting…' : 'Reset the rota'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
