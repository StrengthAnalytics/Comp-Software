'use client';

import { useContext, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/types/action-result';
import {
  AUTOSAVE_DEBOUNCE_MS,
  SAVE_RETRY_MS,
  SAVED_TICK_MS,
  SaveContext,
  readError,
  type RowSaveState,
} from '@/components/station/save-state';

export type StationSaveOptions = { refresh: boolean; onSaved?: () => void };

// The autosave engine shared by the station capture screens. It owns the dirty tracking, the debounced
// background save, the blur/unmount flushes, the transient-failure retry, the offline hold and the
// row→page save-state report — everything the operator-facing save behaviour depends on — so a screen
// only has to supply its field snapshot and how to build/send the payload.
//
// `flag` is the one piece of state the engine carries on the screen's behalf because a save optimism
// hinges on it: the weigh-in status, or the rack-heights "racks set" boolean. It's set optimistically
// before a save and reverted if the save is rejected. The field values themselves live in the calling
// hook; the engine sees them only through `serialized` (the dirty key, which deliberately excludes the
// flag) and `buildPayload` (rebuilt each render closing over the latest field values).
//
// This mirrors the inline engine still embedded in `useWeighInForm`; that screen can adopt this hook
// in a follow-up. Keep the two in step until then.
export function useStationSave<TFlag, TPayload>({
  entryId,
  initialFlag,
  serialized,
  buildPayload,
  save,
}: {
  entryId: string;
  initialFlag: TFlag;
  serialized: string;
  buildPayload: (flag: TFlag) => TPayload;
  save: (payload: TPayload) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const { online, report } = useContext(SaveContext);
  const [flag, setFlag] = useState<TFlag>(initialFlag);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, startTransition] = useTransition();

  // Last value successfully persisted; seeded from the current snapshot so a freshly loaded row is
  // clean. A change in `serialized` versus this is unsaved input — the dirty flag below.
  const [savedSnapshot, setSavedSnapshot] = useState(serialized);
  const dirty = serialized !== savedSnapshot;

  // Don't re-fire the exact payload that just failed on the wire in a tight loop; a new edit or a
  // connectivity change clears the guard so the held data still gets a retry.
  const failedSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    failedSnapshotRef.current = null;
  }, [online]);
  // A fresh edit clears the transient saved/failed/error flags so stale feedback doesn't linger over a
  // value the operator is now changing, and unblocks a retry of the new value.
  useEffect(() => {
    setSavedTick(false);
    setSaveFailed(false);
    setError(null);
  }, [serialized]);
  // "Saved ✓" is a brief confirmation, not a permanent badge: clear it shortly after a save.
  useEffect(() => {
    if (!savedTick) {
      return;
    }
    const timer = setTimeout(() => setSavedTick(false), SAVED_TICK_MS);
    return () => clearTimeout(timer);
  }, [savedTick]);

  // Snapshot of the payload a save is currently sending, so the unmount flush doesn't re-send data the
  // in-flight save already covers. A transient (thrown) failure schedules one delayed retry via
  // retryTick so a brief blip self-heals; the timer is torn down on unmount.
  const inFlightSnapshotRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    },
    [],
  );

  // Persists the current field values with the given flag. refresh re-pulls server props for the
  // side-effects only an explicit action needs (re-ordering, counts) — an autosave of an unchanged flag
  // skips it.
  function runSave(nextFlag: TFlag, options: StationSaveOptions) {
    const snapshotAtSave = serialized;
    const previousFlag = flag;
    setFlag(nextFlag);
    setError(null);
    setSaveFailed(false);
    inFlightSnapshotRef.current = snapshotAtSave;
    startTransition(async () => {
      try {
        const result = await save(buildPayload(nextFlag));
        if (result.status === 'error') {
          // Deterministic rejection (same payload would fail again): revert the optimistic flag,
          // surface the message, and block this exact payload from auto-retrying so the debounce can't
          // loop on it. A fresh edit (new serialized) or a reconnect clears the block.
          setFlag(previousFlag);
          setError(readError(result));
          failedSnapshotRef.current = snapshotAtSave;
          return;
        }
        setSavedSnapshot(snapshotAtSave);
        setSavedTick(true);
        if (options.refresh) {
          router.refresh();
        }
        options.onSaved?.();
      } catch {
        // Network/transport failure (e.g. venue wifi dropped): keep the input as unsaved, block the
        // immediate re-fire, and schedule one delayed retry so a passing blip self-heals without
        // hammering. A reconnect or a further edit also retries.
        setFlag(previousFlag);
        failedSnapshotRef.current = snapshotAtSave;
        setSaveFailed(true);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          failedSnapshotRef.current = null;
          setRetryTick((tick) => tick + 1);
        }, SAVE_RETRY_MS);
      }
    });
  }

  // Latest-closure autosave, held in a ref so the debounce effect can fire it without re-subscribing on
  // every keystroke (mirrors the realtime hooks' callback-ref pattern).
  const autosaveRef = useRef<() => void>(() => {});
  autosaveRef.current = () => runSave(flag, { refresh: false });

  // Debounced autosave: once input settles and we're online and idle, persist it. Skips while a save is
  // in flight (re-runs when it clears), while offline (flushes when online returns), and while the last
  // identical payload is blocked (retryTick nudges it after the transient-failure backoff).
  useEffect(() => {
    if (!online || pending) {
      return;
    }
    if (serialized === savedSnapshot || serialized === failedSnapshotRef.current) {
      return;
    }
    const timer = setTimeout(() => autosaveRef.current(), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [online, pending, serialized, savedSnapshot, retryTick]);

  // Immediate save bypassing the debounce — used onBlur so leaving a field (e.g. to click the search
  // box, which would unmount this row) persists it without waiting out the debounce window.
  function flushSave() {
    if (!online || pending) {
      return;
    }
    if (serialized === savedSnapshot || serialized === failedSnapshotRef.current) {
      return;
    }
    runSave(flag, { refresh: false });
  }

  // Fire-and-forget save when the row unmounts (session switch / search filter) carrying a dirty edit a
  // pending save hadn't captured yet — otherwise the debounce timer is torn down and the edit is lost.
  // Best-effort: the row is gone, so there is no state to update or roll back. A ref holds the latest
  // closure so the unmount-only effect always sees current values, and we skip when the in-flight save
  // already covers this exact payload.
  const unmountFlushRef = useRef<() => void>(() => {});
  unmountFlushRef.current = () => {
    if (!online || serialized === savedSnapshot || serialized === inFlightSnapshotRef.current) {
      return;
    }
    void save(buildPayload(flag));
  };
  useEffect(() => () => unmountFlushRef.current(), []);

  // Folded into one state for the inline indicator and the page-level rollup.
  let saveState: RowSaveState;
  if (pending) {
    saveState = 'saving';
  } else if (error) {
    saveState = 'error';
  } else if (saveFailed) {
    saveState = 'failed';
  } else if (dirty) {
    saveState = online ? 'saving' : 'offline';
  } else {
    saveState = 'clean';
  }

  useEffect(() => {
    report(entryId, saveState === 'clean' ? null : saveState);
  }, [report, entryId, saveState]);
  // Drop this row from the page rollup when it unmounts (session switch, search filter) so a stale
  // status can't linger in the indicator.
  useEffect(() => () => report(entryId, null), [report, entryId]);

  return { flag, runSave, flushSave, saveState, savedTick, error, pending, online, startTransition };
}
