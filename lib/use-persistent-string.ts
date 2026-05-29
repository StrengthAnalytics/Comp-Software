'use client';

import { useCallback, useEffect, useState } from 'react';

// Remembers a string preference in localStorage. The first paint uses the fallback (so server and
// client markup match), then an effect snaps to the saved value on mount. Shared by the weigh-in and
// rack-heights screens for their Cards/Table and full-screen layout toggles.
export function usePersistentString(key: string, fallback: string): readonly [string, (next: string) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const stored = globalThis.localStorage.getItem(key);
    if (stored !== null) {
      setValue(stored);
    }
  }, [key]);
  const update = useCallback(
    (next: string) => {
      setValue(next);
      globalThis.localStorage.setItem(key, next);
    },
    [key],
  );
  return [value, update];
}
