'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { readError } from '@/components/station/save-state';
import type { ActionResult } from '@/types/action-result';

// An explicit action on the Sessions & flights screen (an add, a delete, a move, the builder's create)
// rather than an autosaved field: it keeps its own pending state and error line, and re-pulls the page
// once it lands.
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (action: () => Promise<ActionResult<unknown>>) => {
      setError(null);
      startTransition(async () => {
        try {
          const result = await action();
          if (result.status === 'error') {
            setError(readError(result));
            return;
          }
          router.refresh();
        } catch {
          setError('Couldn’t reach the server. Check your connection and try again.');
        }
      });
    },
    [router],
  );

  return { run, error, pending };
}
