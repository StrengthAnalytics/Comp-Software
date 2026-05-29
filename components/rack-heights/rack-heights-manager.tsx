'use client';

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { updateRackHeightsAction } from '@/actions/entries';
import { usePersistentString } from '@/lib/use-persistent-string';
import { NumberInput, SegmentedToggle } from '@/components/station/controls';
import {
  SaveContext,
  SaveStatus,
  computeSaveIndicator,
  useOnline,
  type ReportedSaveState,
  type SaveContextValue,
} from '@/components/station/save-state';
import { useStationSave } from '@/components/station/use-station-save';
import {
  BENCH_SPOTTING_LABELS,
  BENCH_SPOTTINGS,
  SQUAT_RACK_SETTING_LABELS,
  SQUAT_RACK_SETTINGS,
  type BenchSpotting,
  type Gender,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { OptionalSelectField } from '@/components/optional-select-field';
import { numberToInput, parseOptionalNumber } from '@/lib/number-input';
import { buildWeighInGroups, liftsForWeighInGroup, weighInGroupLabel } from '@/lib/weigh-in/order';
import type { RackHeightsInput } from '@/types/entry';
import type { TeamLift } from '@/types/team';

// Rack settings only ever apply to the squat and the bench (the deadlift has none), so this screen
// shows just those columns — no Simple/Full toggle. It reuses the weigh-in calling order (sex / team
// role → flight → lot) and the shared station autosave/connectivity machinery, so it behaves exactly
// like the weigh-in screen: every field saves in the background, with the same offline-hold, retry and
// page-level save indicator. Built for a phone in the warm-up room — the table view scrolls sideways
// to reach every field, and weighing-room staff mark each lifter "racks set" as they go.

export type RackEntry = {
  id: string;
  sessionId: string | null;
  flightName: string | null;
  flightSortOrder: number | null;
  lifterName: string;
  sex: Gender;
  teamLift: TeamLift | null;
  lotNumber: number | null;
  rackHeightSquat: number | null;
  squatRackSetting: SquatRackSetting | null;
  rackHeightBench: number | null;
  benchSafetyHeight: number | null;
  benchSpotting: BenchSpotting | null;
  racksSet: boolean;
};

export type RackSessionOption = { id: string; name: string };

type ViewMode = 'cards' | 'table';

const INPUT_BASE = 'rounded-md border px-3 py-2 text-sm text-neutral-900 focus:outline-none';
const INPUT_CLASS = `${INPUT_BASE} border-neutral-300 focus:border-neutral-500`;
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
// Rack fields hold short values (a hole number, a short setting), so each box is a fixed compact width
// and the row wraps.
const FIELD_CLASS = 'flex w-32 flex-col gap-1';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const TAB_BASE = 'rounded-md px-3 py-2 text-sm font-medium';

// Compact controls for the dense table view (the column header carries the label, so cells are bare).
const CELL_INPUT =
  'mx-auto block w-24 rounded border border-neutral-300 px-2 py-1 text-center text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const CELL_SELECT =
  'w-full rounded border border-neutral-300 px-2 py-1 text-center text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const CELL_PRIMARY =
  'rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
// Two-row sticky header: the group-label bar pins at the top, the column headers pin just below it.
// TABLE_TH's `top-9` must equal the label bar's `h-9` so the headers tuck directly under the label.
// z-order: label (30) over column headers (20) over the frozen lifter column (10).
const TABLE_LABEL =
  'sticky top-0 z-30 flex h-9 items-center bg-neutral-100 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500';
const TABLE_TH_BASE =
  'sticky top-9 z-20 border-b border-neutral-300 bg-neutral-100 px-2 py-2 text-xs font-medium text-neutral-600 whitespace-nowrap';
const TABLE_TH = `${TABLE_TH_BASE} text-left`;
const TABLE_TH_CENTER = `${TABLE_TH_BASE} text-center`;
const TABLE_TD = 'border-b border-neutral-200 px-2 py-1.5 align-top';

// Printable backup sheet: plain ruled cells; the blank cells get extra height to write into by hand.
const PRINT_TH = 'border border-neutral-500 px-2 py-1 text-center text-[11px] font-semibold uppercase';
const PRINT_TD = 'border border-neutral-400 px-2 py-1 text-center';
const PRINT_BLANK = 'border border-neutral-400 px-2 py-3';

const VIEW_STORAGE_KEY = 'comp-software:rack-heights:view';
const LAYOUT_STORAGE_KEY = 'comp-software:rack-heights:layout';

// Compact rack readout for the collapsed (racks-set) row, covering only the lifts this entry contests.
// Takes live values so the collapsed summary reflects the latest (autosaved) edit, not the stale prop.
function rackSummary(
  shownLifts: Lifts,
  squatHeight: number | null,
  squatSetting: SquatRackSetting | '',
  benchHeight: number | null,
  benchSafety: number | null,
  benchSpotting: BenchSpotting | '',
): string {
  const parts: string[] = [];
  if (shownLifts.squat) {
    const setting = squatSetting === '' ? '' : ` ${SQUAT_RACK_SETTING_LABELS[squatSetting]}`;
    parts.push(`Sq ${squatHeight ?? '—'}${setting}`);
  }
  if (shownLifts.bench) {
    const spotting = benchSpotting === '' ? '' : ` ${BENCH_SPOTTING_LABELS[benchSpotting]}`;
    parts.push(`Bench ${benchHeight ?? '—'} / safety ${benchSafety ?? '—'}${spotting}`);
  }
  return parts.join(' · ');
}

// All the per-lifter rack editing state and save logic, shared verbatim by the card and table-row
// layouts so both behave identically. The "flag" the station engine carries here is the racks_set
// boolean — set optimistically when the operator marks a lifter done, reverted if the save is
// rejected, and carried on every field autosave so editing a done lifter's settings keeps them done.
function useRackForm({
  competitionId,
  entry,
  shownLifts,
}: {
  competitionId: string;
  entry: RackEntry;
  shownLifts: Lifts;
}) {
  const [rackSquat, setRackSquat] = useState(numberToInput(entry.rackHeightSquat));
  const [squatSetting, setSquatSetting] = useState<SquatRackSetting | ''>(entry.squatRackSetting ?? '');
  const [rackBench, setRackBench] = useState(numberToInput(entry.rackHeightBench));
  const [benchSafety, setBenchSafety] = useState(numberToInput(entry.benchSafetyHeight));
  const [benchSpotting, setBenchSpotting] = useState<BenchSpotting | ''>(entry.benchSpotting ?? '');

  // Serialised snapshot of the saveable fields (only the lifts this entry contests). A change here is
  // unsaved input; the station engine compares it against the last persisted snapshot to drive autosave
  // and the inline status. racks_set is deliberately excluded — marking done is a separate action.
  const serialized = JSON.stringify({
    rackSquat: shownLifts.squat ? rackSquat.trim() : '',
    squatSetting: shownLifts.squat ? squatSetting : '',
    rackBench: shownLifts.bench ? rackBench.trim() : '',
    benchSafety: shownLifts.bench ? benchSafety.trim() : '',
    benchSpotting: shownLifts.bench ? benchSpotting : '',
  });

  function buildPayload(racksSet: boolean): RackHeightsInput {
    return {
      entryId: entry.id,
      competitionId,
      rackHeightSquat: shownLifts.squat ? parseOptionalNumber(rackSquat) : null,
      squatRackSetting: shownLifts.squat && squatSetting !== '' ? squatSetting : null,
      rackHeightBench: shownLifts.bench ? parseOptionalNumber(rackBench) : null,
      benchSafetyHeight: shownLifts.bench ? parseOptionalNumber(benchSafety) : null,
      benchSpotting: shownLifts.bench && benchSpotting !== '' ? benchSpotting : null,
      racksSet,
    };
  }

  const save = useStationSave<boolean, RackHeightsInput>({
    entryId: entry.id,
    initialFlag: entry.racksSet,
    serialized,
    buildPayload,
    save: updateRackHeightsAction,
  });

  // Flip the racks_set marker (and persist the current field values with it). refresh re-pulls props so
  // the row re-sorts (done lifters sink) and the page count updates. Status changes don't fire offline.
  function setRacks(value: boolean, onSaved?: () => void) {
    if (!save.online) {
      return;
    }
    save.runSave(value, { refresh: true, onSaved });
  }

  return {
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
    flushSave: save.flushSave,
    saveState: save.saveState,
    savedTick: save.savedTick,
    error: save.error,
    pending: save.pending,
    online: save.online,
    setRacks,
  };
}

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  step: string;
}) {
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_CLASS}>{label}</span>
      <NumberInput value={value} onChange={onChange} onBlur={onBlur} step={step} className={`${INPUT_CLASS} text-center`} />
    </label>
  );
}

// Memoised so a sibling row reporting its save state up to the page indicator (which re-renders the
// manager) doesn't re-render every card; props are kept referentially stable via renderGroups.
const RackCard = memo(function RackCard({
  competitionId,
  entry,
  shownLifts,
}: {
  competitionId: string;
  entry: RackEntry;
  shownLifts: Lifts;
}) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const form = useRackForm({ competitionId, entry, shownLifts });
  // Read the done flag from the prop (reconciled by router.refresh after a save), mirroring how the
  // weigh-in card reads weighed_in: done lifters collapse to a compact row; everyone else stays open.
  const racksSet = entry.racksSet;
  const expanded = !racksSet || manuallyExpanded;

  if (!expanded) {
    // Read from live form state, not the prop: a field-only autosave doesn't router.refresh(), so the
    // collapsed summary must show the latest edited values.
    const summary = rackSummary(
      shownLifts,
      parseOptionalNumber(form.rackSquat),
      form.squatSetting,
      parseOptionalNumber(form.rackBench),
      parseOptionalNumber(form.benchSafety),
      form.benchSpotting,
    );
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold tracking-tight">{entry.lifterName}</span>
          <span className="text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
          </span>
          {summary ? <span className="text-xs text-neutral-700">{summary}</span> : null}
        </div>
        <button type="button" onClick={() => setManuallyExpanded(true)} className={GHOST_BUTTON}>
          Edit
        </button>
      </section>
    );
  }

  return (
    <section className={`rounded-lg border p-5 ${racksSet ? 'border-green-300 bg-green-50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{entry.lifterName}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
            {racksSet ? ' · Racks set' : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {shownLifts.squat ? (
          <NumberField
            label="Squat rack height"
            value={form.rackSquat}
            onChange={form.setRackSquat}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {shownLifts.squat ? (
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
        {shownLifts.bench ? (
          <NumberField
            label="Bench height"
            value={form.rackBench}
            onChange={form.setRackBench}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {shownLifts.bench ? (
          <NumberField
            label="Bench safety height"
            value={form.benchSafety}
            onChange={form.setBenchSafety}
            onBlur={form.flushSave}
            step="1"
          />
        ) : null}
        {shownLifts.bench ? (
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
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {racksSet ? (
          <>
            <button type="button" onClick={() => setManuallyExpanded(false)} disabled={form.pending} className={PRIMARY_BUTTON}>
              Racks set ✓
            </button>
            <button
              type="button"
              onClick={() => form.setRacks(false)}
              disabled={form.pending || !form.online}
              className={GHOST_BUTTON}
            >
              Mark not set
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => form.setRacks(true, () => setManuallyExpanded(false))}
            disabled={form.pending || !form.online}
            className={PRIMARY_BUTTON}
          >
            Mark racks set
          </button>
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

function CellNumber({
  label,
  value,
  onChange,
  onBlur,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  step: string;
}) {
  return <NumberInput value={value} onChange={onChange} onBlur={onBlur} step={step} ariaLabel={label} className={CELL_INPUT} />;
}

// Rack columns shared by the screen table's header and row cells, so the two can't fall out of sync (a
// header without its cell, or vice versa). `lift` gates which contested lifts show the column.
type RackFormApi = ReturnType<typeof useRackForm>;
const RACK_TABLE_COLUMNS: readonly {
  key: string;
  header: string;
  lift: 'squat' | 'bench';
  cell: (form: RackFormApi) => ReactNode;
}[] = [
  {
    key: 'rackSquat',
    header: 'Squat rack',
    lift: 'squat',
    cell: (form) => (
      <CellNumber label="Squat rack height" value={form.rackSquat} onChange={form.setRackSquat} onBlur={form.flushSave} step="1" />
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
      <CellNumber label="Bench height" value={form.rackBench} onChange={form.setRackBench} onBlur={form.flushSave} step="1" />
    ),
  },
  {
    key: 'benchSafety',
    header: 'Safety ht',
    lift: 'bench',
    cell: (form) => (
      <CellNumber label="Bench safety height" value={form.benchSafety} onChange={form.setBenchSafety} onBlur={form.flushSave} step="1" />
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

function RackRow({
  competitionId,
  entry,
  shownLifts,
}: {
  competitionId: string;
  entry: RackEntry;
  shownLifts: Lifts;
}) {
  const form = useRackForm({ competitionId, entry, shownLifts });
  const racksSet = entry.racksSet;
  // The frozen lifter column needs an opaque background or scrolled cells show through behind it.
  const rowBg = racksSet ? 'bg-green-50' : 'bg-white';

  return (
    <tr className={rowBg}>
      <td className={`${TABLE_TD} sticky left-0 z-10 ${rowBg}`}>
        <div className="whitespace-nowrap font-medium text-neutral-900">{entry.lifterName}</div>
        <div className="whitespace-nowrap text-xs text-neutral-500">
          {entry.flightName ?? 'No flight'}
          {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
        </div>
      </td>

      {RACK_TABLE_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
        <td key={column.key} className={TABLE_TD}>
          {column.cell(form)}
        </td>
      ))}

      <td className={TABLE_TD}>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => form.setRacks(!racksSet)}
            disabled={form.pending || !form.online}
            title={racksSet ? 'Tap to reopen' : 'Mark racks set'}
            className={CELL_PRIMARY}
          >
            {racksSet ? '✓ Set' : 'Set'}
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

// Memoised for the same reason as RackCard: a stable-prop table skips re-rendering (and so its rows
// skip too) when the manager re-renders for an unrelated row's save-state report.
const RackTable = memo(function RackTable({
  label,
  competitionId,
  entries,
  shownLifts,
}: {
  label: string;
  competitionId: string;
  entries: RackEntry[];
  shownLifts: Lifts;
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
            {RACK_TABLE_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
              <th key={column.key} scope="col" className={TABLE_TH_CENTER}>
                {column.header}
              </th>
            ))}
            <th scope="col" className={TABLE_TH_CENTER}>
              <span className="sr-only">Racks set</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <RackRow key={entry.id} competitionId={competitionId} entry={entry} shownLifts={shownLifts} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

// Rack columns for the printed backup sheet, shared by its header and its blank body cells so a header
// can't end up over the wrong (or a missing) write-in column — the silent-on-paper desync risk.
const RACK_PRINT_COLUMNS: readonly { key: string; header: string; lift: 'squat' | 'bench' }[] = [
  { key: 'rackSquat', header: 'Sq rack ht', lift: 'squat' },
  { key: 'squatSetting', header: 'Sq rack set', lift: 'squat' },
  { key: 'rackBench', header: 'Bench ht', lift: 'bench' },
  { key: 'benchSafety', header: 'Safety ht', lift: 'bench' },
  { key: 'benchSpotting', header: 'Spotting', lift: 'bench' },
];

function RackPrintTable({
  label,
  entries,
  shownLifts,
}: {
  label: string;
  entries: RackEntry[];
  shownLifts: Lifts;
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
            {RACK_PRINT_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
              <th key={column.key} className={PRINT_TH}>
                {column.header}
              </th>
            ))}
            <th className={PRINT_TH}>Racks set</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.id} className="break-inside-avoid">
              <td className={PRINT_TD}>{index + 1}</td>
              <td className={`${PRINT_TD} whitespace-nowrap text-left`}>{entry.lifterName}</td>
              <td className={PRINT_TD}>{entry.flightName ?? ''}</td>
              <td className={PRINT_TD}>{entry.lotNumber ?? ''}</td>
              {RACK_PRINT_COLUMNS.filter((column) => shownLifts[column.lift]).map((column) => (
                <td key={column.key} className={PRINT_BLANK} />
              ))}
              <td className={PRINT_BLANK} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Print-only (hidden on screen) backup sheet for the selected session, ordered the same way lifters are
// called to the platform. Capture fields are left blank for hand-recording; name/flight/lot are
// pre-printed. Always portrait (rack columns are narrow) via the named-@page class in globals.css.
// Memoised: it renders the whole session into a hidden portal at all times (so Cmd+P works, not just
// the button), but with stable props it skips re-rendering on every keystroke/save-state report.
const RackPrintSheet = memo(function RackPrintSheet({
  compName,
  sessionName,
  groups,
}: {
  compName: string;
  sessionName: string;
  groups: { key: string; label: string; entries: RackEntry[]; shownLifts: Lifts }[];
}) {
  // Portal to <body> so the print rule (which display:none's body's other children) leaves the sheet
  // standing. Mount guard: portals need the client DOM, absent during server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const totalLifters = groups.reduce((sum, group) => sum + group.entries.length, 0);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="print-backup-sheet print-portrait hidden text-neutral-900 print:block">
      <div className="mb-4 flex items-end justify-between gap-6 border-b border-neutral-500 pb-2">
        <div>
          <h1 className="text-lg font-bold">{compName}</h1>
          <p className="text-sm">Rack heights sheet (backup) — {sessionName}</p>
        </div>
        <div className="text-right text-xs leading-6">
          <p>Date: __________________</p>
          <p>Recorder: __________________</p>
        </div>
      </div>
      {totalLifters === 0 ? (
        <p className="text-sm">No squat or bench lifters in this session.</p>
      ) : (
        groups.map((group) => (
          <RackPrintTable key={group.key} label={group.label} entries={group.entries} shownLifts={group.shownLifts} />
        ))
      )}
    </div>,
    document.body,
  );
});

export function RackHeightsManager({
  competitionId,
  compSlug,
  compName,
  isTeamCompetition,
  lifts,
  sessions,
  entries,
  unflightedCount,
}: {
  competitionId: string;
  compSlug: string;
  compName: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  sessions: RackSessionOption[];
  entries: RackEntry[];
  unflightedCount: number;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [storedView, setStoredView] = usePersistentString(VIEW_STORAGE_KEY, 'cards');
  const [storedLayout, setStoredLayout] = usePersistentString(LAYOUT_STORAGE_KEY, 'normal');
  const view: ViewMode = storedView === 'table' ? 'table' : 'cards';
  const fullScreen = storedLayout === 'full';

  const online = useOnline();
  // Each row reports its non-clean save state here; the page-level indicator rolls them up.
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

  // Esc leaves the full-screen view (matching the weigh-in and run screens).
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

  // Only squat / bench lifters have rack settings, so drop any group that contests neither (a
  // deadlift-only comp, or the deadlift members of a team comp). The print sheet uses the whole
  // session in calling order; the count is over these rack-relevant entries.
  const printGroups = useMemo(
    () =>
      buildWeighInGroups(sessionEntries, isTeamCompetition)
        .map((group) => ({
          key: `${group.lift ?? 'all'}-${group.sex}`,
          label: weighInGroupLabel(group, isTeamCompetition),
          entries: group.entries,
          shownLifts: liftsForWeighInGroup(group, lifts, isTeamCompetition),
        }))
        .filter((group) => group.shownLifts.squat || group.shownLifts.bench),
    [sessionEntries, isTeamCompetition, lifts],
  );
  const relevantEntries = useMemo(() => printGroups.flatMap((group) => group.entries), [printGroups]);
  const racksSetCount = relevantEntries.filter((entry) => entry.racksSet).length;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      normalizedQuery === ''
        ? relevantEntries
        : relevantEntries.filter((entry) => entry.lifterName.toLowerCase().includes(normalizedQuery)),
    [relevantEntries, normalizedQuery],
  );
  // Precompute the per-group ordering and lift-set once so the row props stay referentially stable —
  // that lets the memoised rows skip re-rendering when an unrelated row reports its save state.
  const renderGroups = useMemo(
    () =>
      buildWeighInGroups(visibleEntries, isTeamCompetition)
        .map((group) => ({
          key: `${group.lift ?? 'all'}-${group.sex}`,
          label: weighInGroupLabel(group, isTeamCompetition),
          // Lifters still to do stay at the top in calling order; the done ones sink to the bottom (sort
          // is stable, so calling order holds within each part).
          ordered: group.entries.toSorted((a, b) => Number(a.racksSet) - Number(b.racksSet)),
          shownLifts: liftsForWeighInGroup(group, lifts, isTeamCompetition),
        }))
        .filter((group) => group.shownLifts.squat || group.shownLifts.bench),
    [visibleEntries, isTeamCompetition, lifts],
  );
  const selectedSessionName = sessions.find((session) => session.id === selectedSessionId)?.name ?? '';

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
            <SegmentedToggle
              ariaLabel="Layout view"
              value={view}
              onChange={setStoredView}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Table' },
              ]}
            />
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
              <button type="button" onClick={() => setStoredLayout(fullScreen ? 'normal' : 'full')} className={GHOST_BUTTON}>
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
                    active ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {session.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {relevantEntries.length === 0
                ? 'No squat or bench lifters in this session.'
                : `${racksSetCount} of ${relevantEntries.length} racks set · changes save automatically`}
            </p>
            {relevantEntries.length > 0 ? (
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

          {relevantEntries.length > 0 && visibleEntries.length === 0 ? (
            <p className="text-sm text-neutral-500">No lifters match “{query.trim()}”.</p>
          ) : null}

          {renderGroups.map(({ key, label, ordered, shownLifts }) => {
            if (view === 'table') {
              return <RackTable key={key} label={label} competitionId={competitionId} entries={ordered} shownLifts={shownLifts} />;
            }

            return (
              <div key={key}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{label}</h2>
                <div className="mt-3 space-y-4">
                  {ordered.map((entry) => (
                    <RackCard key={entry.id} competitionId={competitionId} entry={entry} shownLifts={shownLifts} />
                  ))}
                </div>
              </div>
            );
          })}

          {unflightedCount > 0 ? (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
              {unflightedCount} registered {unflightedCount === 1 ? 'lifter is' : 'lifters are'} not assigned to a flight yet,
              so they don&apos;t appear here. Assign them on the{' '}
              <Link href={`/${compSlug}/flights`} className="font-medium text-neutral-900 underline">
                sessions &amp; flights
              </Link>{' '}
              screen.
            </p>
          ) : null}
        </div>
      </div>

      <RackPrintSheet compName={compName} sessionName={selectedSessionName} groups={printGroups} />
    </SaveContext.Provider>
  );
}
