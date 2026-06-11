'use client';

import { useCallback, useEffect, useState } from 'react';

// Parses a stored JSON value into a string set, tolerating anything that isn't a string array
// (corrupt JSON, a stale shape) by falling back to empty — the collapsed-by-default state.
function readIdSet(stored: string | null): Set<string> {
  if (stored === null) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    }
  } catch {
    // Fall through to the empty set.
  }
  return new Set();
}

// Remembers which cards in a list are expanded, per browser, as a JSON array of ids under one
// localStorage key (key the hook per screen + comp, e.g. `entries:expanded:<compId>`, so lists
// don't bleed into each other and the key count stays bounded). Collapsed is the default: only
// expanded ids are stored, so an id that disappears from the list (an approved submission, a
// removed lifter) lingers harmlessly until the key is next written. The first paint renders
// everything collapsed (server and client markup match), then an effect snaps to the saved set.
export function usePersistentIdSet(
  key: string,
): readonly [(id: string) => boolean, (id: string) => void] {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded(readIdSet(globalThis.localStorage.getItem(key)));
  }, [key]);

  const has = useCallback((id: string) => expanded.has(id), [expanded]);

  const toggle = useCallback(
    (id: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        globalThis.localStorage.setItem(key, JSON.stringify([...next]));
        return next;
      });
    },
    [key],
  );

  return [has, toggle];
}
