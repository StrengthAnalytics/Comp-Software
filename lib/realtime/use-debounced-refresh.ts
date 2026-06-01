'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Default debounce for coalescing a burst of real-time changes into one server re-pull.
const DEFAULT_REFRESH_DEBOUNCE_MS = 500;

// Returns a stable callback that debounces `router.refresh()`, so a burst of real-time changes (another
// device working through the roster, or a run of head-table corrections) collapses into a single server
// re-pull rather than one refresh per event. The pending timer is cleared on unmount. Used by the
// realtime-backed admin editing screens (entries, rack heights) as their `onChange` subscription handler.
export function useDebouncedRefresh(debounceMs: number = DEFAULT_REFRESH_DEBOUNCE_MS): () => void {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => router.refresh(), debounceMs);
  }, [router, debounceMs]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return scheduleRefresh;
}
