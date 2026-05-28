'use client';

import { useState, useTransition } from 'react';
import { duplicateCompetitionAction } from '@/actions/competitions';

const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';

// Duplicates a competition from the list. A full clone is irreversible from the UI (there is no
// delete-comp screen), so the action sits behind a one-tap inline confirm. On success the server
// action redirects to the new comp's edit page; only an error returns here.
export function DuplicateCompButton({ competitionId, name }: { competitionId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function duplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateCompetitionAction({ competitionId });
      if (result && result.status === 'error') {
        setError(result.message);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Duplicate ${name}`}
          className={GHOST_BUTTON}
        >
          Duplicate
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-neutral-500">Duplicate this comp?</span>
      <button type="button" onClick={duplicate} disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Duplicating…' : 'Yes, duplicate'}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
        className={GHOST_BUTTON}
      >
        Cancel
      </button>
    </div>
  );
}
