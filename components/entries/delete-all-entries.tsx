'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAllEntriesAction } from '@/actions/entries';
import type { Database } from '@/types/database.types';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const DANGER_BUTTON =
  'rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50';

// A type-to-confirm wipe of every entrant in a comp. The operator must type the competition name
// exactly, mirroring the "type the repo name" pattern, because the delete cascades to attempts and
// results and cannot be undone.
export function DeleteAllEntries({
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (entryCount === 0) {
    return null;
  }

  // Bulk deletion is blocked once a comp is completed (it would cascade to attempts and results).
  if (competitionStatus === 'completed') {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-800">Danger zone</h2>
        <p className="mt-1 text-sm text-neutral-600">
          This competition is completed, so its entrants can&rsquo;t be bulk-deleted. Change the status back to active or
          draft on the competition details if you genuinely need to.
        </p>
      </section>
    );
  }

  const confirmed = typed.trim() === competitionName.trim();
  const plural = entryCount === 1 ? '' : 's';

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
      const result = await deleteAllEntriesAction({ competitionId });
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
      <h2 className="text-lg font-semibold tracking-tight text-red-800">Danger zone</h2>
      <p className="mt-1 text-sm text-red-700">
        Remove every entrant from this competition. The lifters&rsquo; records are kept, but their attempts and results
        for this comp are deleted too. This cannot be undone.
      </p>
      <button type="button" onClick={() => setOpen(true)} className={`mt-4 ${DANGER_BUTTON}`}>
        Delete all {entryCount} entrant{plural}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              close();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
            <h3 id="delete-all-title" className="text-lg font-semibold text-neutral-900">
              Delete all entrants?
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              This permanently removes <strong>{entryCount}</strong> entrant{plural} from{' '}
              <strong>{competitionName}</strong>, along with any attempts and results recorded for this competition. The
              lifters&rsquo; own records are kept and can be re-registered. This cannot be undone.
            </p>
            <label htmlFor="confirm-name" className="mt-4 block text-sm text-neutral-700">
              Type <span className="font-semibold">{competitionName}</span> to confirm:
            </label>
            <input
              id="confirm-name"
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
                {pending ? 'Deleting…' : `Delete all entrant${plural}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
