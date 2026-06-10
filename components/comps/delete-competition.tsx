'use client';

import { useState, useTransition } from 'react';
import { deleteCompetitionAction } from '@/actions/competitions';
import { COMP_STATUS_LABELS } from '@/lib/constants';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Database } from '@/types/database.types';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON = buttonClasses('secondary');
const DANGER_BUTTON = buttonClasses('danger');

// A robust type-to-confirm delete of an entire competition. The operator must type the competition
// name exactly, because the delete cascades to every age category, weight class, platform, session,
// flight, entry, attempt and referee decision and cannot be undone. On success the server action
// redirects to the comps list, so only an error returns to this component.
export function DeleteCompetition({
  competitionId,
  competitionName,
  competitionStatus,
  entryCount,
}: {
  competitionId: string;
  competitionName: string;
  competitionStatus: Database['public']['Enums']['comp_status'];
  entryCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A completed comp's final record is protected: deleting it would cascade away its results
  // (ARCHITECTURE.md §7). The server enforces this too; the UI just explains it rather than offering
  // a button that would always fail.
  if (competitionStatus === 'completed') {
    return (
      <Card title="Danger zone">
        <p className="mt-1 text-sm text-neutral-600">
          This competition is completed, so it can&rsquo;t be deleted — that would destroy its final record. Change the
          status back to active or draft on the competition details above if you genuinely need to remove it.
        </p>
      </Card>
    );
  }

  const confirmed = typed.trim() === competitionName.trim();
  const plural = entryCount === 1 ? '' : 's';
  // A draft has no real results to lose; published/active comps may, so flag it harder.
  const hasLiveData = competitionStatus !== 'draft';

  function close() {
    if (pending) {
      return;
    }
    setOpen(false);
    setTyped('');
    setError(null);
  }

  function confirmDelete() {
    if (!confirmed) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteCompetitionAction({ competitionId });
      if (result && result.status === 'error') {
        setError(result.message);
      }
    });
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-red-800">Danger zone</h2>
      <p className="mt-1 text-sm text-red-700">
        Permanently delete this competition and everything in it — age categories, weight classes, platforms, sessions,
        flights, every entrant&rsquo;s registration, and all attempts and results. The lifters&rsquo; own records are kept.
        This cannot be undone.
      </p>
      <button type="button" onClick={() => setOpen(true)} className={`mt-4 ${DANGER_BUTTON}`}>
        Delete this competition
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-comp-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              close();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
            <h3 id="delete-comp-title" className="text-lg font-semibold text-neutral-900">
              Delete competition?
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              This permanently deletes <strong>{competitionName}</strong>
              {entryCount > 0 ? (
                <>
                  {' '}
                  along with its <strong>{entryCount}</strong> entrant{plural} and every attempt and result recorded for
                  it
                </>
              ) : null}
              . The lifters&rsquo; own records are kept. This cannot be undone.
            </p>
            {hasLiveData ? (
              <p className="mt-2 rounded-md border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
                This competition is {COMP_STATUS_LABELS[competitionStatus].toLowerCase()} — any recorded results will be
                lost for good.
              </p>
            ) : null}
            <label htmlFor="confirm-comp-name" className="mt-4 block text-sm text-neutral-700">
              Type <span className="font-semibold">{competitionName}</span> to confirm:
            </label>
            <input
              id="confirm-comp-name"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && confirmed) {
                  confirmDelete();
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
              <button type="button" onClick={confirmDelete} disabled={!confirmed || pending} className={DANGER_BUTTON}>
                {pending ? 'Deleting…' : 'Delete competition'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
