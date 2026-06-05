'use client';

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { assignEntryWeightClassAction, weighInAction } from '@/actions/entries';
import { usePersistentString } from '@/lib/use-persistent-string';
import { CellNumber, NumberField, SegmentedToggle } from '@/components/station/controls';
import {
  CELL_PRIMARY,
  CELL_SELECT,
  FIELD_CLASS,
  GHOST_BUTTON,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  PRINT_BLANK,
  PRINT_TD,
  PRINT_TH,
  TAB_BASE,
  TABLE_LABEL,
  TABLE_TD,
  TABLE_TH,
  TABLE_TH_CENTER,
} from '@/components/station/styles';
import {
  AUTOSAVE_DEBOUNCE_MS,
  SAVE_RETRY_MS,
  SAVED_TICK_MS,
  SaveContext,
  SaveStatus,
  computeSaveIndicator,
  readError,
  useOnline,
  type ReportedSaveState,
  type RowSaveState,
  type SaveContextValue,
} from '@/components/station/save-state';
import {
  BENCH_SPOTTING_LABELS,
  BENCH_SPOTTINGS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  SQUAT_RACK_SETTING_LABELS,
  SQUAT_RACK_SETTINGS,
  type BenchSpotting,
  type Gender,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { OptionalSelectField } from '@/components/optional-select-field';
import { numberToInput, parseOptionalNumber } from '@/lib/number-input';
import {
  buildWeighInGroups,
  liftsForWeighInGroup,
  weighInGroupLabel,
  type WeighInGroup,
} from '@/lib/weigh-in/order';
import {
  findWeightClassForBodyweight,
  isBodyweightInClass,
  type WeightClassBounds,
} from '@/lib/weigh-in/weight-class';
import type { Database } from '@/types/database.types';
import type { WeighInInput } from '@/types/entry';
import type { TeamLift } from '@/types/team';

type EntryStatus = Database['public']['Enums']['entry_status'];

export type WeighInEntry = {
  id: string;
  sessionId: string | null;
  flightName: string | null;
  flightSortOrder: number | null;
  weightClassId: string | null;
  lifterName: string;
  sex: Gender;
  teamLift: TeamLift | null;
  lotNumber: number | null;
  bodyweightKg: number | null;
  openerSquatKg: number | null;
  openerBenchKg: number | null;
  openerDeadliftKg: number | null;
  rackHeightSquat: number | null;
  squatRackSetting: SquatRackSetting | null;
  rackHeightBench: number | null;
  benchSafetyHeight: number | null;
  benchSpotting: BenchSpotting | null;
  status: EntryStatus;
};

export type WeightClassOption = WeightClassBounds & { gender: Gender };

export type WeighInSessionOption = { id: string; name: string };

type ViewMode = 'cards' | 'table';
// How much of each lifter to show. 'simple' is bodyweight + openers only; 'full' adds the rack/bench
// settings. This is a display choice only — it never changes what is saved, so hidden rack values are
// retained and reappear when switched back to full.
type DetailMode = 'simple' | 'full';

const VIEW_STORAGE_KEY = 'comp-software:weigh-in:view';
const LAYOUT_STORAGE_KEY = 'comp-software:weigh-in:layout';
const DETAIL_STORAGE_KEY = 'comp-software:weigh-in:detail';

// Compact opener readout for the collapsed (weighed-in) row, covering only the lifts this entry
// contests. Takes live values so the collapsed summary reflects the latest (autosaved) edit rather
// than the stale server prop.
function openerSummary(shownLifts: Lifts, squat: number | null, bench: number | null, deadlift: number | null): string {
  const parts: string[] = [];
  if (shownLifts.squat) {
    parts.push(`S ${squat ?? '—'}`);
  }
  if (shownLifts.bench) {
    parts.push(`B ${bench ?? '—'}`);
  }
  if (shownLifts.deadlift) {
    parts.push(`DL ${deadlift ?? '—'}`);
  }
  return parts.join(' / ');
}

// All the per-lifter weigh-in editing state, save logic and derived flags, shared verbatim by the
// card and table-row layouts so both behave identically.
function useWeighInForm({
  competitionId,
  entry,
  shownLifts,
  showWeightClass,
  weightClasses,
}: {
  competitionId: string;
  entry: WeighInEntry;
  shownLifts: Lifts;
  showWeightClass: boolean;
  weightClasses: WeightClassOption[];
}) {
  const router = useRouter();
  const { online, report } = useContext(SaveContext);
  const [weightClassId, setWeightClassId] = useState(entry.weightClassId ?? '');
  const [bodyweight, setBodyweight] = useState(numberToInput(entry.bodyweightKg));
  const [openerSquat, setOpenerSquat] = useState(numberToInput(entry.openerSquatKg));
  const [openerBench, setOpenerBench] = useState(numberToInput(entry.openerBenchKg));
  const [openerDeadlift, setOpenerDeadlift] = useState(numberToInput(entry.openerDeadliftKg));
  const [rackSquat, setRackSquat] = useState(numberToInput(entry.rackHeightSquat));
  const [squatSetting, setSquatSetting] = useState<SquatRackSetting | ''>(entry.squatRackSetting ?? '');
  const [rackBench, setRackBench] = useState(numberToInput(entry.rackHeightBench));
  const [benchSafety, setBenchSafety] = useState(numberToInput(entry.benchSafetyHeight));
  const [benchSpotting, setBenchSpotting] = useState<BenchSpotting | ''>(entry.benchSpotting ?? '');
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [pending, startTransition] = useTransition();

  // Gate for marking a lifter weighed-in: bodyweight plus every contested opener present. Declared up
  // here because the save helpers below consult it (a status change to weighed_in must respect it).
  const bodyweightValue = parseOptionalNumber(bodyweight);
  const openerMissing =
    (shownLifts.squat && parseOptionalNumber(openerSquat) === null) ||
    (shownLifts.bench && parseOptionalNumber(openerBench) === null) ||
    (shownLifts.deadlift && parseOptionalNumber(openerDeadlift) === null);
  const canMarkWeighedIn = bodyweightValue !== null && !openerMissing;

  // Serialised snapshot of the saveable fields (only the lifts this entry contests). A change here is
  // unsaved input; comparing against the last persisted snapshot gives the dirty flag that drives both
  // the autosave trigger and the inline "saving/saved" status.
  const serialized = JSON.stringify({
    bodyweight: bodyweight.trim(),
    openerSquat: shownLifts.squat ? openerSquat.trim() : '',
    openerBench: shownLifts.bench ? openerBench.trim() : '',
    openerDeadlift: shownLifts.deadlift ? openerDeadlift.trim() : '',
    rackSquat: shownLifts.squat ? rackSquat.trim() : '',
    squatSetting: shownLifts.squat ? squatSetting : '',
    rackBench: shownLifts.bench ? rackBench.trim() : '',
    benchSafety: shownLifts.bench ? benchSafety.trim() : '',
    benchSpotting: shownLifts.bench ? benchSpotting : '',
  });
  // Last value successfully persisted; seeded from the server values so a freshly loaded row is clean.
  const [savedSnapshot, setSavedSnapshot] = useState(serialized);
  const dirty = serialized !== savedSnapshot;

  // Don't re-fire the exact payload that just failed on the wire in a tight loop; a new edit or a
  // connectivity change clears the guard so the held data still gets a retry.
  const failedSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    failedSnapshotRef.current = null;
  }, [online]);
  // A fresh edit clears the transient saved/failed/error flags so stale feedback (a red validation
  // message, a "Saved ✓" tick, or a "couldn't save" flag) doesn't linger over a value the operator is
  // now changing, and unblocks a retry of the new value.
  useEffect(() => {
    setSavedTick(false);
    setSaveFailed(false);
    setError(null);
  }, [serialized]);
  // "Saved ✓" is a brief confirmation, not a permanent badge: clear it shortly after a save so it
  // fades on an idle row instead of pinning indefinitely.
  useEffect(() => {
    if (!savedTick) {
      return;
    }
    const timer = setTimeout(() => setSavedTick(false), SAVED_TICK_MS);
    return () => clearTimeout(timer);
  }, [savedTick]);

  // Builds the weigh-in payload from the current field values, sending only the lifts this entry
  // contests (the Simple/Full display toggle never changes what is saved).
  function buildPayload(nextStatus: EntryStatus): WeighInInput {
    return {
      id: entry.id,
      competitionId,
      bodyweightKg: bodyweightValue,
      openerSquatKg: shownLifts.squat ? parseOptionalNumber(openerSquat) : null,
      openerBenchKg: shownLifts.bench ? parseOptionalNumber(openerBench) : null,
      openerDeadliftKg: shownLifts.deadlift ? parseOptionalNumber(openerDeadlift) : null,
      rackHeightSquat: shownLifts.squat ? parseOptionalNumber(rackSquat) : null,
      squatRackSetting: shownLifts.squat && squatSetting !== '' ? squatSetting : null,
      rackHeightBench: shownLifts.bench ? parseOptionalNumber(rackBench) : null,
      benchSafetyHeight: shownLifts.bench ? parseOptionalNumber(benchSafety) : null,
      benchSpotting: shownLifts.bench && benchSpotting !== '' ? benchSpotting : null,
      status: nextStatus,
    };
  }

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

  // Persists the current field values. refresh re-pulls server props for the side-effects only an
  // explicit action needs — re-ordering (weighed-in lifters sink) and the weighed-in count — which an
  // autosave of unchanged status skips.
  function runSave(nextStatus: EntryStatus, options: { refresh: boolean; onSaved?: () => void }) {
    const snapshotAtSave = serialized;
    const previousStatus = status;
    setStatus(nextStatus);
    setError(null);
    setSaveFailed(false);
    inFlightSnapshotRef.current = snapshotAtSave;
    startTransition(async () => {
      try {
        const result = await weighInAction(buildPayload(nextStatus));
        if (result.status === 'error') {
          // Deterministic rejection (same payload would fail again): revert the optimistic status,
          // surface the message, and block this exact payload from auto-retrying so the debounce can't
          // loop on it. A fresh edit (new serialized) or a reconnect clears the block.
          setStatus(previousStatus);
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
        setStatus(previousStatus);
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

  // Latest-closure autosave, held in a ref so the debounce effect can fire it without re-subscribing
  // on every keystroke (mirrors the realtime hooks' callback-ref pattern).
  const autosaveRef = useRef<() => void>(() => {});
  autosaveRef.current = () => runSave(status, { refresh: false });

  // Debounced autosave: once input settles and we're online and idle, persist it. Skips while a save
  // is in flight (re-runs when it clears), while offline (flushes when online returns), and while the
  // last identical payload is blocked (retryTick nudges it after the transient-failure backoff).
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
    runSave(status, { refresh: false });
  }

  // Fire-and-forget save when the row unmounts (session switch / search filter) carrying a dirty edit
  // that a pending save hadn't captured yet — otherwise the debounce timer is torn down and the edit is
  // lost. Best-effort: the row is gone, so there is no state to update or roll back. A ref holds the
  // latest closure so the unmount-only effect always sees current values, and we skip when the
  // in-flight save already covers this exact payload.
  const unmountFlushRef = useRef<() => void>(() => {});
  unmountFlushRef.current = () => {
    if (!online || serialized === savedSnapshot || serialized === inFlightSnapshotRef.current) {
      return;
    }
    void weighInAction(buildPayload(status));
  };
  useEffect(() => () => unmountFlushRef.current(), []);

  function changeStatus(next: EntryStatus) {
    // The status dropdown can set 'weighed_in' directly, so it must honour the same bodyweight+openers
    // gate as the confirm button (the server only backstops a missing bodyweight, not openers).
    if (next === 'weighed_in' && !canMarkWeighedIn) {
      setError('Record bodyweight and openers before marking the lifter weighed in.');
      return;
    }
    // Status changes are immediate server writes (not held like field autosaves), so don't attempt one
    // offline — the controls are also disabled offline, and field edits keep saving on reconnect.
    if (!online) {
      return;
    }
    runSave(next, { refresh: true });
  }

  function confirmWeighIn(onSaved?: () => void) {
    if (!canMarkWeighedIn || !online) {
      return;
    }
    runSave('weighed_in', { refresh: true, onSaved });
  }

  function changeWeightClass(next: string) {
    if (!online) {
      return;
    }
    const previous = weightClassId;
    setWeightClassId(next);
    setError(null);
    setSaveFailed(false);
    startTransition(async () => {
      try {
        const result = await assignEntryWeightClassAction({
          entryId: entry.id,
          competitionId,
          weightClassId: next === '' ? null : next,
        });
        if (result.status === 'error') {
          setWeightClassId(previous);
          setError(readError(result));
          return;
        }
        router.refresh();
      } catch {
        setWeightClassId(previous);
        setSaveFailed(true);
      }
    });
  }

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
    report(entry.id, saveState === 'clean' ? null : saveState);
  }, [report, entry.id, saveState]);
  // Drop this row from the page rollup when it unmounts (session switch, search filter) so a stale
  // status can't linger in the indicator.
  useEffect(() => () => report(entry.id, null), [report, entry.id]);

  const weighedIn = entry.status === 'weighed_in';
  // A lifter only competes in classes for their own gender.
  const classOptions = weightClasses.filter((weightClass) => weightClass.gender === entry.sex);
  const assignedClass = weightClasses.find((weightClass) => weightClass.id === weightClassId) ?? null;
  // Flag a bodyweight that does not sit in the assigned class (or no class set), and point at the
  // class it does fit. Only meaningful once a bodyweight is recorded.
  const suggestedClass = bodyweightValue === null ? null : findWeightClassForBodyweight(bodyweightValue, classOptions);
  let classWarning: string | null = null;
  if (showWeightClass && bodyweightValue !== null) {
    if (assignedClass) {
      if (!isBodyweightInClass(bodyweightValue, assignedClass)) {
        classWarning = `${bodyweightValue} kg is outside ${assignedClass.name}${
          suggestedClass ? ` — try ${suggestedClass.name}` : ''
        }.`;
      }
    } else {
      classWarning = `No weight class set${suggestedClass ? ` — ${bodyweightValue} kg fits ${suggestedClass.name}` : ''}.`;
    }
  }

  return {
    weightClassId,
    bodyweight,
    setBodyweight,
    openerSquat,
    setOpenerSquat,
    openerBench,
    setOpenerBench,
    openerDeadlift,
    setOpenerDeadlift,
    rackSquat,
    setRackSquat,
    squatSetting,
    setSquatSetting,
    rackBench,
    setRackBench,
    benchSafety,
    setBenchSafety,
    benchSpotting,
    setBenchSpotting,
    status,
    error,
    pending,
    online,
    saveState,
    savedTick,
    flushSave,
    changeStatus,
    confirmWeighIn,
    changeWeightClass,
    weighedIn,
    classOptions,
    assignedClass,
    bodyweightValue,
    classWarning,
    canMarkWeighedIn,
  };
}

// Memoised so a sibling row reporting its save state up to the page indicator (which re-renders the
// manager) doesn't re-render every card; props are kept referentially stable via renderGroups.
const WeighInCard = memo(function WeighInCard({
  competitionId,
  entry,
  shownLifts,
  showWeightClass,
  showRacks,
  weightClasses,
}: {
  competitionId: string;
  entry: WeighInEntry;
  shownLifts: Lifts;
  showWeightClass: boolean;
  showRacks: boolean;
  weightClasses: WeightClassOption[];
}) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const form = useWeighInForm({ competitionId, entry, shownLifts, showWeightClass, weightClasses });

  const weighedIn = form.weighedIn;
  // Weighed-in lifters collapse to a compact row; everyone still to do stays open.
  const expanded = !weighedIn || manuallyExpanded;

  if (!expanded) {
    // Read from live form state, not the entry prop: a field-only autosave doesn't router.refresh(),
    // so the prop is stale until an explicit save — the collapsed summary must show the saved values.
    const summary = openerSummary(
      shownLifts,
      parseOptionalNumber(form.openerSquat),
      parseOptionalNumber(form.openerBench),
      parseOptionalNumber(form.openerDeadlift),
    );
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold tracking-tight">{entry.lifterName}</span>
          <span className="text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
          </span>
          <span className="text-xs text-neutral-700">
            BW {form.bodyweightValue ?? '—'}
            {showWeightClass && form.assignedClass ? ` · ${form.assignedClass.name}` : ''}
            {summary ? ` · ${summary}` : ''}
          </span>
          {form.classWarning ? (
            <span className="text-xs font-medium text-amber-700">⚠ {form.classWarning}</span>
          ) : null}
        </div>
        <button type="button" onClick={() => setManuallyExpanded(true)} className={GHOST_BUTTON}>
          Edit
        </button>
      </section>
    );
  }

  return (
    <section
      className={`rounded-lg border p-5 ${
        weighedIn ? 'border-green-300 bg-green-50' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{entry.lifterName}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
            {weighedIn ? ' · Weighed in' : ''}
          </p>
        </div>
      </div>

      {form.classWarning ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {form.classWarning}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {showWeightClass ? (
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Weight class</span>
            <select
              value={form.weightClassId}
              onChange={(event) => form.changeWeightClass(event.target.value)}
              disabled={form.pending || !form.online}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              {form.classOptions.map((weightClass) => (
                <option key={weightClass.id} value={weightClass.id}>
                  {weightClass.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <NumberField
          label="Bodyweight (kg)"
          value={form.bodyweight}
          onChange={form.setBodyweight}
          onBlur={form.flushSave}
          step="0.01"
          required
          invalid={form.bodyweightValue === null}
        />

        {shownLifts.squat ? (
          <NumberField
            label="Opening squat (kg)"
            value={form.openerSquat}
            onChange={form.setOpenerSquat}
            onBlur={form.flushSave}
            step="0.5"
            required
            invalid={parseOptionalNumber(form.openerSquat) === null}
          />
        ) : null}
        {shownLifts.bench ? (
          <NumberField
            label="Opening bench (kg)"
            value={form.openerBench}
            onChange={form.setOpenerBench}
            onBlur={form.flushSave}
            step="0.5"
            required
            invalid={parseOptionalNumber(form.openerBench) === null}
          />
        ) : null}
        {shownLifts.deadlift ? (
          <NumberField
            label="Opening deadlift (kg)"
            value={form.openerDeadlift}
            onChange={form.setOpenerDeadlift}
            onBlur={form.flushSave}
            step="0.5"
            required
            invalid={parseOptionalNumber(form.openerDeadlift) === null}
          />
        ) : null}

        {showRacks && shownLifts.squat ? (
          <NumberField
            label="Squat rack height"
            value={form.rackSquat}
            onChange={form.setRackSquat}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {showRacks && shownLifts.squat ? (
          <OptionalSelectField
            label="Squat rack setting"
            value={form.squatSetting}
            onChange={form.setSquatSetting}
            options={SQUAT_RACK_SETTINGS}
            labels={SQUAT_RACK_SETTING_LABELS}
            wrapperClassName={FIELD_CLASS}
            selectClassName={INPUT_CLASS}
          />
        ) : null}
        {showRacks && shownLifts.bench ? (
          <NumberField
            label="Bench height"
            value={form.rackBench}
            onChange={form.setRackBench}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {showRacks && shownLifts.bench ? (
          <NumberField
            label="Bench safety height"
            value={form.benchSafety}
            onChange={form.setBenchSafety}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {showRacks && shownLifts.bench ? (
          <OptionalSelectField
            label="Bench spotting"
            value={form.benchSpotting}
            onChange={form.setBenchSpotting}
            options={BENCH_SPOTTINGS}
            labels={BENCH_SPOTTING_LABELS}
            wrapperClassName={FIELD_CLASS}
            selectClassName={INPUT_CLASS}
          />
        ) : null}

        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Status</span>
          <select
            value={form.status}
            onChange={(event) => {
              // The select only renders ENTRY_STATUSES values, so this narrowing is exact.
              form.changeStatus(event.target.value as EntryStatus);
            }}
            disabled={form.pending || !form.online}
            className={INPUT_CLASS}
          >
            {ENTRY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ENTRY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => form.confirmWeighIn(() => setManuallyExpanded(false))}
          disabled={form.pending || !form.canMarkWeighedIn || !form.online}
          className={PRIMARY_BUTTON}
        >
          {weighedIn ? 'Weighed in ✓' : 'Mark weighed in'}
        </button>
        {weighedIn ? (
          <button
            type="button"
            onClick={() => setManuallyExpanded(false)}
            disabled={form.pending}
            className={GHOST_BUTTON}
          >
            Collapse
          </button>
        ) : null}
        {form.canMarkWeighedIn ? null : (
          <span className="text-xs text-neutral-500">Needs bodyweight and openers to weigh in</span>
        )}
        <SaveStatus state={form.saveState} savedTick={form.savedTick} />
        {form.error ? (
          <p role="alert" className="text-sm text-red-600">
            {form.error}
          </p>
        ) : null}
      </div>
    </section>
  );
});

// Rack/bench columns shared by the screen table's header and row cells, so the two can't fall out of
// sync (a header without its cell, or vice versa). `lift` gates which contested lifts show the column;
// the whole block is also gated by the Full detail toggle (showRacks) at the call sites.
type WeighInFormApi = ReturnType<typeof useWeighInForm>;
const RACK_TABLE_COLUMNS: readonly {
  key: string;
  header: string;
  lift: 'squat' | 'bench';
  cell: (form: WeighInFormApi) => ReactNode;
}[] = [
  {
    key: 'rackSquat',
    header: 'Squat rack',
    lift: 'squat',
    cell: (form) => (
      <CellNumber
        label="Squat rack height"
        value={form.rackSquat}
        onChange={form.setRackSquat}
        onBlur={form.flushSave}
        step="1"
      />
    ),
  },
  {
    key: 'squatSetting',
    header: 'Rack set',
    lift: 'squat',
    cell: (form) => (
      <OptionalSelectField
        label="Squat rack setting"
        value={form.squatSetting}
        onChange={form.setSquatSetting}
        options={SQUAT_RACK_SETTINGS}
        labels={SQUAT_RACK_SETTING_LABELS}
        wrapperClassName="block"
        labelClassName="sr-only"
        selectClassName={CELL_SELECT}
      />
    ),
  },
  {
    key: 'rackBench',
    header: 'Bench ht',
    lift: 'bench',
    cell: (form) => (
      <CellNumber
        label="Bench height"
        value={form.rackBench}
        onChange={form.setRackBench}
        onBlur={form.flushSave}
        step="1"
      />
    ),
  },
  {
    key: 'benchSafety',
    header: 'Safety ht',
    lift: 'bench',
    cell: (form) => (
      <CellNumber
        label="Bench safety height"
        value={form.benchSafety}
        onChange={form.setBenchSafety}
        onBlur={form.flushSave}
        step="1"
      />
    ),
  },
  {
    key: 'benchSpotting',
    header: 'Spotting',
    lift: 'bench',
    cell: (form) => (
      <OptionalSelectField
        label="Bench spotting"
        value={form.benchSpotting}
        onChange={form.setBenchSpotting}
        options={BENCH_SPOTTINGS}
        labels={BENCH_SPOTTING_LABELS}
        wrapperClassName="block"
        labelClassName="sr-only"
        selectClassName={CELL_SELECT}
      />
    ),
  },
];

function WeighInRow({
  competitionId,
  entry,
  shownLifts,
  showWeightClass,
  showRacks,
  weightClasses,
}: {
  competitionId: string;
  entry: WeighInEntry;
  shownLifts: Lifts;
  showWeightClass: boolean;
  showRacks: boolean;
  weightClasses: WeightClassOption[];
}) {
  const form = useWeighInForm({ competitionId, entry, shownLifts, showWeightClass, weightClasses });
  // The frozen lifter column needs an opaque background or scrolled cells show through behind it.
  const rowBg = form.weighedIn ? 'bg-green-50' : 'bg-white';

  return (
    <tr className={rowBg}>
      <td className={`${TABLE_TD} sticky left-0 z-10 ${rowBg}`}>
        <div className="whitespace-nowrap font-medium text-neutral-900">{entry.lifterName}</div>
        <div className="whitespace-nowrap text-xs text-neutral-500">
          {entry.flightName ?? 'No flight'}
          {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
        </div>
      </td>

      {showWeightClass ? (
        <td className={TABLE_TD}>
          <select
            value={form.weightClassId}
            onChange={(event) => form.changeWeightClass(event.target.value)}
            disabled={form.pending || !form.online}
            aria-label="Weight class"
            className={CELL_SELECT}
          >
            <option value="">—</option>
            {form.classOptions.map((weightClass) => (
              <option key={weightClass.id} value={weightClass.id}>
                {weightClass.name}
              </option>
            ))}
          </select>
          {form.classWarning ? (
            <p className="mt-1 max-w-[12rem] text-xs font-medium text-amber-700">⚠ {form.classWarning}</p>
          ) : null}
        </td>
      ) : null}

      <td className={TABLE_TD}>
        <CellNumber
          label="Bodyweight (kg)"
          value={form.bodyweight}
          onChange={form.setBodyweight}
          onBlur={form.flushSave}
          step="0.01"
          invalid={form.bodyweightValue === null}
        />
      </td>

      {shownLifts.squat ? (
        <td className={TABLE_TD}>
          <CellNumber
            label="Opening squat (kg)"
            value={form.openerSquat}
            onChange={form.setOpenerSquat}
            onBlur={form.flushSave}
            step="0.5"
            invalid={parseOptionalNumber(form.openerSquat) === null}
          />
        </td>
      ) : null}
      {shownLifts.bench ? (
        <td className={TABLE_TD}>
          <CellNumber
            label="Opening bench (kg)"
            value={form.openerBench}
            onChange={form.setOpenerBench}
            onBlur={form.flushSave}
            step="0.5"
            invalid={parseOptionalNumber(form.openerBench) === null}
          />
        </td>
      ) : null}
      {shownLifts.deadlift ? (
        <td className={TABLE_TD}>
          <CellNumber
            label="Opening deadlift (kg)"
            value={form.openerDeadlift}
            onChange={form.setOpenerDeadlift}
            onBlur={form.flushSave}
            step="0.5"
            invalid={parseOptionalNumber(form.openerDeadlift) === null}
          />
        </td>
      ) : null}

      {showRacks
        ? RACK_TABLE_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
            <td key={column.key} className={TABLE_TD}>
              {column.cell(form)}
            </td>
          ))
        : null}

      <td className={TABLE_TD}>
        <select
          value={form.status}
          onChange={(event) => {
            // The select only renders ENTRY_STATUSES values, so this narrowing is exact.
            form.changeStatus(event.target.value as EntryStatus);
          }}
          disabled={form.pending || !form.online}
          aria-label="Status"
          className={CELL_SELECT}
        >
          {ENTRY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {ENTRY_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </td>

      <td className={TABLE_TD}>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => form.confirmWeighIn()}
            disabled={form.pending || !form.canMarkWeighedIn || !form.online}
            title={form.canMarkWeighedIn ? undefined : 'Needs bodyweight and openers to weigh in'}
            className={CELL_PRIMARY}
          >
            {form.weighedIn ? '✓ In' : 'Weigh in'}
          </button>
          <SaveStatus state={form.saveState} savedTick={form.savedTick} />
          {form.error ? (
            <p role="alert" className="text-xs text-red-600">
              {form.error}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// Memoised for the same reason as WeighInCard: a stable-prop table skips re-rendering (and so its rows
// skip too) when the manager re-renders for an unrelated row's save-state report.
const WeighInTable = memo(function WeighInTable({
  label,
  competitionId,
  entries,
  shownLifts,
  showWeightClass,
  showRacks,
  weightClasses,
}: {
  label: string;
  competitionId: string;
  entries: WeighInEntry[];
  shownLifts: Lifts;
  showWeightClass: boolean;
  showRacks: boolean;
  weightClasses: WeightClassOption[];
}) {
  return (
    <div>
      <div className={TABLE_LABEL}>{label}</div>
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${TABLE_TH} left-0`}>
              Lifter
            </th>
            {showWeightClass ? (
              <th scope="col" className={TABLE_TH_CENTER}>
                Class
              </th>
            ) : null}
            <th scope="col" className={TABLE_TH_CENTER}>
              BW (kg)
            </th>
            {shownLifts.squat ? (
              <th scope="col" className={TABLE_TH_CENTER}>
                Squat open
              </th>
            ) : null}
            {shownLifts.bench ? (
              <th scope="col" className={TABLE_TH_CENTER}>
                Bench open
              </th>
            ) : null}
            {shownLifts.deadlift ? (
              <th scope="col" className={TABLE_TH_CENTER}>
                DL open
              </th>
            ) : null}
            {showRacks
              ? RACK_TABLE_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
                  <th key={column.key} scope="col" className={TABLE_TH_CENTER}>
                    {column.header}
                  </th>
                ))
              : null}
            <th scope="col" className={TABLE_TH_CENTER}>
              Status
            </th>
            <th scope="col" className={TABLE_TH_CENTER}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <WeighInRow
              key={entry.id}
              competitionId={competitionId}
              entry={entry}
              shownLifts={shownLifts}
              showWeightClass={showWeightClass}
              showRacks={showRacks}
              weightClasses={weightClasses}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

// Rack/bench columns for the printed backup sheet, shared by its header and its blank body cells so a
// header can't end up over the wrong (or a missing) write-in column — the silent-on-paper desync risk.
const RACK_PRINT_COLUMNS: readonly { key: string; header: string; lift: 'squat' | 'bench' }[] = [
  { key: 'rackSquat', header: 'Sq rack ht', lift: 'squat' },
  { key: 'squatSetting', header: 'Sq rack set', lift: 'squat' },
  { key: 'rackBench', header: 'Bench ht', lift: 'bench' },
  { key: 'benchSafety', header: 'Safety ht', lift: 'bench' },
  { key: 'benchSpotting', header: 'Spotting', lift: 'bench' },
];

function WeighInPrintTable({
  label,
  entries,
  shownLifts,
  showWeightClass,
  showRacks,
  classNameById,
}: {
  label: string;
  entries: WeighInEntry[];
  shownLifts: Lifts;
  showWeightClass: boolean;
  showRacks: boolean;
  classNameById: Map<string, string>;
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-1 break-after-avoid text-sm font-bold uppercase tracking-wide">{label}</h3>
      <table className="w-full border-collapse text-xs text-neutral-900">
        <thead>
          <tr>
            <th className={PRINT_TH}>#</th>
            <th className={`${PRINT_TH} text-left`}>Lifter</th>
            <th className={PRINT_TH}>Flight</th>
            <th className={PRINT_TH}>Lot</th>
            {showWeightClass ? <th className={PRINT_TH}>Class</th> : null}
            <th className={PRINT_TH}>Bodyweight</th>
            {shownLifts.squat ? <th className={PRINT_TH}>Squat open</th> : null}
            {shownLifts.bench ? <th className={PRINT_TH}>Bench open</th> : null}
            {shownLifts.deadlift ? <th className={PRINT_TH}>DL open</th> : null}
            {showRacks
              ? RACK_PRINT_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
                  <th key={column.key} className={PRINT_TH}>
                    {column.header}
                  </th>
                ))
              : null}
            <th className={PRINT_TH}>Weighed in</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.id} className="break-inside-avoid">
              <td className={PRINT_TD}>{index + 1}</td>
              <td className={`${PRINT_TD} whitespace-nowrap text-left`}>{entry.lifterName}</td>
              <td className={PRINT_TD}>{entry.flightName ?? ''}</td>
              <td className={PRINT_TD}>{entry.lotNumber ?? ''}</td>
              {showWeightClass ? (
                <td className={PRINT_TD}>
                  {entry.weightClassId ? (classNameById.get(entry.weightClassId) ?? '') : ''}
                </td>
              ) : null}
              <td className={PRINT_BLANK} />
              {shownLifts.squat ? <td className={PRINT_BLANK} /> : null}
              {shownLifts.bench ? <td className={PRINT_BLANK} /> : null}
              {shownLifts.deadlift ? <td className={PRINT_BLANK} /> : null}
              {showRacks
                ? RACK_PRINT_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
                    <td key={column.key} className={PRINT_BLANK} />
                  ))
                : null}
              <td className={PRINT_BLANK} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Print-only (hidden on screen) backup sheet for the selected session, ordered the same way lifters
// are called to the scale. Capture fields are left blank for hand-recording; name/flight/lot/class are
// pre-printed. Mirrors the Simple/Full toggle: Simple prints bodyweight + openers (portrait), Full adds
// the rack/bench columns (landscape) — the orientation is set via the named-@page classes in
// globals.css.
// Memoised: it renders the whole session into a hidden portal at all times (so Cmd+P works, not just
// the button), but with stable props it skips re-rendering on every keystroke/save-state report.
const WeighInPrintSheet = memo(function WeighInPrintSheet({
  compName,
  sessionName,
  isTeamComp,
  lifts,
  groups,
  weightClasses,
  showRacks,
}: {
  compName: string;
  sessionName: string;
  isTeamComp: boolean;
  lifts: Lifts;
  groups: WeighInGroup<WeighInEntry>[];
  weightClasses: WeightClassOption[];
  showRacks: boolean;
}) {
  const classNameById = useMemo(
    () => new Map(weightClasses.map((weightClass) => [weightClass.id, weightClass.name])),
    [weightClasses],
  );
  // Portal to <body> so the print rule (which display:none's body's other children) leaves the sheet
  // standing instead of hiding it along with the app chrome it would otherwise nest inside. Mount
  // guard: portals need the client DOM, absent during server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const totalLifters = groups.reduce((sum, group) => sum + group.entries.length, 0);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className={`print-backup-sheet hidden text-neutral-900 print:block ${
        showRacks ? 'print-landscape' : 'print-portrait'
      }`}
    >
      <div className="mb-4 flex items-end justify-between gap-6 border-b border-neutral-500 pb-2">
        <div>
          <h1 className="text-lg font-bold">{compName}</h1>
          <p className="text-sm">Weigh-in sheet (backup) — {sessionName}</p>
        </div>
        <div className="text-right text-xs leading-6">
          <p>Date: __________________</p>
          <p>Recorder: __________________</p>
        </div>
      </div>
      {totalLifters === 0 ? (
        <p className="text-sm">No lifters assigned to this session.</p>
      ) : (
        groups.map((group) => (
          <WeighInPrintTable
            key={`${group.lift ?? 'all'}-${group.sex}`}
            label={weighInGroupLabel(group, isTeamComp)}
            entries={group.entries}
            shownLifts={liftsForWeighInGroup(group, lifts, isTeamComp)}
            showWeightClass={!isTeamComp}
            showRacks={showRacks}
            classNameById={classNameById}
          />
        ))
      )}
    </div>,
    document.body,
  );
});

export function WeighInManager({
  competitionId,
  compSlug,
  compName,
  isTeamCompetition,
  lifts,
  sessions,
  weightClasses,
  entries,
  unflightedCount,
}: {
  competitionId: string;
  compSlug: string;
  compName: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  sessions: WeighInSessionOption[];
  weightClasses: WeightClassOption[];
  entries: WeighInEntry[];
  unflightedCount: number;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [storedView, setStoredView] = usePersistentString(VIEW_STORAGE_KEY, 'cards');
  const [storedLayout, setStoredLayout] = usePersistentString(LAYOUT_STORAGE_KEY, 'normal');
  const [storedDetail, setStoredDetail] = usePersistentString(DETAIL_STORAGE_KEY, 'full');
  const view: ViewMode = storedView === 'table' ? 'table' : 'cards';
  const fullScreen = storedLayout === 'full';
  const detail: DetailMode = storedDetail === 'simple' ? 'simple' : 'full';
  const showRacks = detail === 'full';

  const online = useOnline();
  // Each row reports its non-clean save state here; the page-level indicator rolls them up so the
  // operator always knows whether autosaves are landing.
  const [rowStates, setRowStates] = useState<Map<string, ReportedSaveState>>(() => new Map());
  const report = useCallback((id: string, state: ReportedSaveState | null) => {
    setRowStates((current) => {
      const existing = current.get(id) ?? null;
      if (existing === state) {
        return current;
      }
      const next = new Map(current);
      if (state === null) {
        next.delete(id);
      } else {
        next.set(id, state);
      }
      return next;
    });
  }, []);
  const saveContext = useMemo<SaveContextValue>(() => ({ online, report }), [online, report]);

  // Esc leaves the full-screen view (matching the run scoresheet).
  useEffect(() => {
    if (!fullScreen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStoredLayout('normal');
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [fullScreen, setStoredLayout]);

  const sessionEntries = useMemo(
    () => entries.filter((entry) => entry.sessionId === selectedSessionId),
    [entries, selectedSessionId],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      normalizedQuery === ''
        ? sessionEntries
        : sessionEntries.filter((entry) => entry.lifterName.toLowerCase().includes(normalizedQuery)),
    [sessionEntries, normalizedQuery],
  );
  const groups = useMemo(
    () => buildWeighInGroups(visibleEntries, isTeamCompetition),
    [visibleEntries, isTeamCompetition],
  );
  // Precompute the per-group ordering and lift-set once (not on every render) so the row props stay
  // referentially stable — that lets the memoised rows skip re-rendering when an unrelated row reports
  // its save state up to the page indicator.
  const renderGroups = useMemo(
    () =>
      groups.map((group) => ({
        key: `${group.lift ?? 'all'}-${group.sex}`,
        label: weighInGroupLabel(group, isTeamCompetition),
        // Lifters still to weigh in stay at the top in calling order; the weighed-in ones sink to the
        // bottom (sort is stable, so calling order holds within each part).
        ordered: group.entries.toSorted(
          (a, b) => Number(a.status === 'weighed_in') - Number(b.status === 'weighed_in'),
        ),
        groupLifts: liftsForWeighInGroup(group, lifts, isTeamCompetition),
      })),
    [groups, lifts, isTeamCompetition],
  );
  // The backup sheet prints the whole session in calling order, never trimmed by the on-screen search.
  const printGroups = useMemo(
    () => buildWeighInGroups(sessionEntries, isTeamCompetition),
    [sessionEntries, isTeamCompetition],
  );
  const selectedSessionName = sessions.find((session) => session.id === selectedSessionId)?.name ?? '';
  const weighedInCount = sessionEntries.filter((entry) => entry.status === 'weighed_in').length;

  if (sessions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
        No sessions yet. Build the meet structure on the{' '}
        <Link href={`/${compSlug}/flights`} className="font-medium text-neutral-900 underline">
          sessions &amp; flights
        </Link>{' '}
        screen first.
      </p>
    );
  }

  const indicator = computeSaveIndicator(online, new Set(rowStates.values()));

  return (
    <SaveContext.Provider value={saveContext}>
    <div className={fullScreen ? 'fixed inset-0 z-50 overflow-auto bg-white p-4' : ''}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedToggle
              ariaLabel="Layout view"
              value={view}
              onChange={setStoredView}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Table' },
              ]}
            />
            <SegmentedToggle
              ariaLabel="Detail level"
              value={detail}
              onChange={setStoredDetail}
              options={[
                { value: 'simple', label: 'Simple', title: 'Bodyweight and openers only' },
                { value: 'full', label: 'Full', title: 'Include rack and bench settings' },
              ]}
            />
          </div>
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${indicator.box}`}
          >
            <span className={`h-2 w-2 rounded-full ${indicator.dot} ${indicator.pulse ? 'animate-pulse' : ''}`} />
            {indicator.text}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => globalThis.print()} className={GHOST_BUTTON}>
              Print sheet
            </button>
            <button
              type="button"
              onClick={() => setStoredLayout(fullScreen ? 'normal' : 'full')}
              className={GHOST_BUTTON}
            >
              {fullScreen ? 'Collapse (Esc)' : 'Fill screen'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sessions.map((session) => {
            const active = session.id === selectedSessionId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={`${TAB_BASE} ${
                  active
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {session.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            {sessionEntries.length === 0
              ? 'No lifters assigned to this session yet.'
              : `${weighedInCount} of ${sessionEntries.length} weighed in · changes save automatically`}
          </p>
          {sessionEntries.length > 0 ? (
            <input
              type="search"
              aria-label="Find a lifter by name"
              placeholder="Find a lifter…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${INPUT_CLASS} w-56`}
            />
          ) : null}
        </div>

        {sessionEntries.length > 0 && visibleEntries.length === 0 ? (
          <p className="text-sm text-neutral-500">No lifters match “{query.trim()}”.</p>
        ) : null}

        {renderGroups.map(({ key, label, ordered, groupLifts }) => {
          if (view === 'table') {
            return (
              <WeighInTable
                key={key}
                label={label}
                competitionId={competitionId}
                entries={ordered}
                shownLifts={groupLifts}
                showWeightClass={!isTeamCompetition}
                showRacks={showRacks}
                weightClasses={weightClasses}
              />
            );
          }

          return (
            <div key={key}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{label}</h2>
              <div className="mt-3 space-y-4">
                {ordered.map((entry) => (
                  <WeighInCard
                    key={entry.id}
                    competitionId={competitionId}
                    entry={entry}
                    shownLifts={groupLifts}
                    showWeightClass={!isTeamCompetition}
                    showRacks={showRacks}
                    weightClasses={weightClasses}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {unflightedCount > 0 ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            {unflightedCount} registered {unflightedCount === 1 ? 'lifter is' : 'lifters are'} not assigned to a flight
            yet, so they don&apos;t appear here. Assign them on the{' '}
            <Link href={`/${compSlug}/flights`} className="font-medium text-neutral-900 underline">
              sessions &amp; flights
            </Link>{' '}
            screen.
          </p>
        ) : null}
      </div>
    </div>

      <WeighInPrintSheet
        compName={compName}
        sessionName={selectedSessionName}
        isTeamComp={isTeamCompetition}
        lifts={lifts}
        groups={printGroups}
        weightClasses={weightClasses}
        showRacks={showRacks}
      />
    </SaveContext.Provider>
  );
}
