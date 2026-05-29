'use client';

import { createContext, useEffect, useState } from 'react';
import type { ActionResult } from '@/types/action-result';

// Shared autosave / connectivity plumbing for the "station" capture screens — the head-table screens
// where an operator edits one lifter at a time and every field saves in the background (weigh-in, and
// the rack-heights warm-up screen). Extracted so both behave identically: the debounce/retry timings,
// the per-row save-state vocabulary, the row→page reporting channel, and the toolbar indicator all
// live here rather than being re-implemented per screen.

// Debounce between the last keystroke and an autosave fire. Long enough not to save every digit of a
// weight mid-typing, short enough that walking away from a field persists it almost immediately.
export const AUTOSAVE_DEBOUNCE_MS = 800;
// After a transient (thrown) save failure, wait this long before one automatic retry — slow enough not
// to hammer a struggling server, fast enough to self-heal a brief blip without an operator edit.
export const SAVE_RETRY_MS = 4000;
// How long the inline "Saved ✓" confirmation lingers before fading, so it reads as a momentary
// acknowledgement rather than a permanent badge.
export const SAVED_TICK_MS = 2500;

// Per-row save state, reported up to the page-level indicator (clean rows report null) and shown
// inline. 'offline' = a held edit we couldn't attempt; 'failed' = an attempt that errored on the wire.
export type RowSaveState = 'clean' | 'saving' | 'offline' | 'failed' | 'error';
export type ReportedSaveState = Exclude<RowSaveState, 'clean'>;

export type SaveContextValue = {
  online: boolean;
  report: (id: string, state: ReportedSaveState | null) => void;
};

// Carries connectivity and the row→page save reporting channel to every row without prop-drilling.
// Default is the inert no-op used when a row renders outside a provider (it never does in practice).
export const SaveContext = createContext<SaveContextValue>({ online: true, report: () => {} });

// Tracks browser connectivity so the page can show an online/offline indicator and hold autosaves
// while offline. navigator.onLine flips on the online/offline events; optimistic true on first paint
// so server and client markup agree (navigator is undefined during SSR). If the page is opened while
// already offline the indicator shows green for one render until the mount effect corrects it — purely
// cosmetic, since the mount effect runs long before the autosave debounce could fire a save.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(globalThis.navigator.onLine);
    update();
    globalThis.addEventListener('online', update);
    globalThis.addEventListener('offline', update);
    return () => {
      globalThis.removeEventListener('online', update);
      globalThis.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

// Inline per-row save feedback for autosave. The validation error ('error') is rendered separately as
// a role="alert" message by the row, so nothing is shown for it here.
export function SaveStatus({ state, savedTick }: { state: RowSaveState; savedTick: boolean }) {
  if (state === 'saving') {
    return <span className="text-xs text-neutral-500">Saving…</span>;
  }
  if (state === 'failed') {
    return <span className="text-xs font-medium text-red-600">Couldn’t save — will retry</span>;
  }
  if (state === 'offline') {
    return <span className="text-xs font-medium text-amber-700">Offline — change held</span>;
  }
  if (savedTick) {
    return <span className="text-xs text-green-700">Saved ✓</span>;
  }
  return null;
}

export type SaveIndicator = { text: string; dot: string; box: string; pulse: boolean };

// Rolls every row's reported save state up into the toolbar's connectivity-and-save pill. Pure so it
// can be unit-tested and shared verbatim between the station screens. Priority: offline first (nothing
// is saving), then a wire failure, then an in-flight save, otherwise all-clear.
export function computeSaveIndicator(online: boolean, states: Set<ReportedSaveState>): SaveIndicator {
  const anySaving = states.has('saving');
  const anyProblem = states.has('failed') || states.has('error');
  const anyOffline = states.has('offline');

  if (!online) {
    return {
      text: anyOffline ? 'Offline — changes held, will save when reconnected' : 'Offline — changes won’t save',
      dot: 'bg-red-500',
      box: 'border-red-300 bg-red-50 text-red-800',
      pulse: true,
    };
  }
  if (anyProblem) {
    return {
      text: 'Some changes didn’t save — they’ll retry when you edit or reconnect',
      dot: 'bg-red-500',
      box: 'border-red-300 bg-red-50 text-red-800',
      pulse: false,
    };
  }
  if (anySaving) {
    return { text: 'Saving…', dot: 'bg-blue-500', box: 'border-blue-300 bg-blue-50 text-blue-800', pulse: true };
  }
  return {
    text: 'Online — all changes saved',
    dot: 'bg-green-500',
    box: 'border-green-300 bg-green-50 text-green-800',
    pulse: false,
  };
}
