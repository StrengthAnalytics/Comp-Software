'use client';

import { usePersistentString } from '@/lib/use-persistent-string';

// A boolean view preference persisted per browser in localStorage (stored as 'on'/'off'). Backs the
// scoresheet and warm-up board view toggles — which columns to show, row striping, the IPF GL column —
// so each browser (e.g. each venue TV) keeps its own view of the same comp. Returns the current value
// and a flip function, mirroring useState's tuple shape.
export function usePersistentToggle(key: string, defaultOn = true): readonly [boolean, () => void] {
  const [pref, setPref] = usePersistentString(key, defaultOn ? 'on' : 'off');
  const on = pref !== 'off';
  return [on, () => setPref(on ? 'off' : 'on')];
}
