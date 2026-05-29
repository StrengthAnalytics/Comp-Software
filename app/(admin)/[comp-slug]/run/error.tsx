'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Route-level error boundary for the run screen. The board's mutations no longer throw on a failed
// save (they hold the edit in the offline outbox), but this is a safety net so any *unexpected* error
// renders a recover panel instead of blanking the whole screen mid-meet. Next requires a default
// export here (framework convention, like page.tsx / layout.tsx).
export default function RunError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-900">The run screen hit an unexpected error</h1>
      <p className="max-w-prose text-sm text-neutral-600">
        Saved data is safe on the server. Reload the scoresheet to continue; if it keeps happening,
        refresh the page or reopen the run screen.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Reload the scoresheet
      </button>
    </div>
  );
}
