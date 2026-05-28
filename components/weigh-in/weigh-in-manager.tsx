'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { assignEntryWeightClassAction, weighInAction } from '@/actions/entries';
import {
  BENCH_SPOTTING_LABELS,
  BENCH_SPOTTINGS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  GENDER_LABELS,
  LIFT_LABELS,
  SQUAT_RACK_SETTING_LABELS,
  SQUAT_RACK_SETTINGS,
  type BenchSpotting,
  type Gender,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { OptionalSelectField } from '@/components/optional-select-field';
import { numberToInput, parseOptionalNumber } from '@/lib/number-input';
import { buildWeighInGroups, type WeighInGroup } from '@/lib/weigh-in/order';
import {
  findWeightClassForBodyweight,
  isBodyweightInClass,
  type WeightClassBounds,
} from '@/lib/weigh-in/weight-class';
import type { ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';
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

const INPUT_BASE = 'rounded-md border px-3 py-2 text-sm text-neutral-900 focus:outline-none';
const INPUT_CLASS = `${INPUT_BASE} border-neutral-300 focus:border-neutral-500`;
// Empty fields that must be filled before a lifter can be marked weighed-in (bodyweight, openers).
const INPUT_REQUIRED_CLASS = `${INPUT_BASE} border-red-400 bg-red-50 focus:border-red-500`;
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
// Weigh-in fields hold short values (weights, hole numbers, a short setting), so each box is a fixed
// compact width and the row wraps — roughly half the width of the old full-stretch grid cells.
const FIELD_CLASS = 'flex w-32 flex-col gap-1';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const TAB_BASE = 'rounded-md px-3 py-2 text-sm font-medium';

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

// A team member contests only their assigned lift, so only that opener (and its rack height) is
// captured at the scale. Everyone else shows the comp's contested lifts.
function liftsForEntry(entry: WeighInEntry, lifts: Lifts, isTeamComp: boolean): Lifts {
  if (isTeamComp && entry.teamLift) {
    return {
      squat: entry.teamLift === 'squat',
      bench: entry.teamLift === 'bench',
      deadlift: entry.teamLift === 'deadlift',
    };
  }
  return lifts;
}

// Compact opener readout for the collapsed (weighed-in) row, covering only the lifts this entry
// contests.
function openerSummary(entry: WeighInEntry, shownLifts: Lifts): string {
  const parts: string[] = [];
  if (shownLifts.squat) {
    parts.push(`S ${entry.openerSquatKg ?? '—'}`);
  }
  if (shownLifts.bench) {
    parts.push(`B ${entry.openerBenchKg ?? '—'}`);
  }
  if (shownLifts.deadlift) {
    parts.push(`DL ${entry.openerDeadliftKg ?? '—'}`);
  }
  return parts.join(' / ');
}

function groupLabel(group: WeighInGroup<WeighInEntry>, isTeamComp: boolean): string {
  const sex = GENDER_LABELS[group.sex];
  if (group.lift) {
    return `${LIFT_LABELS[group.lift]} · ${sex}`;
  }
  return isTeamComp ? `No team role · ${sex}` : sex;
}

function NumberField({
  label,
  value,
  onChange,
  step,
  invalid = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
  invalid?: boolean;
  required?: boolean;
}) {
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_CLASS}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className={invalid ? INPUT_REQUIRED_CLASS : INPUT_CLASS}
      />
    </label>
  );
}

function WeighInCard({
  competitionId,
  entry,
  lifts,
  isTeamComp,
  weightClasses,
}: {
  competitionId: string;
  entry: WeighInEntry;
  lifts: Lifts;
  isTeamComp: boolean;
  weightClasses: WeightClassOption[];
}) {
  const router = useRouter();
  const shownLifts = liftsForEntry(entry, lifts, isTeamComp);
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
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(nextStatus: EntryStatus) {
    setStatus(nextStatus);
    setError(null);
    startTransition(async () => {
      const result = await weighInAction({
        id: entry.id,
        competitionId,
        bodyweightKg: parseOptionalNumber(bodyweight),
        openerSquatKg: shownLifts.squat ? parseOptionalNumber(openerSquat) : null,
        openerBenchKg: shownLifts.bench ? parseOptionalNumber(openerBench) : null,
        openerDeadliftKg: shownLifts.deadlift ? parseOptionalNumber(openerDeadlift) : null,
        rackHeightSquat: shownLifts.squat ? parseOptionalNumber(rackSquat) : null,
        squatRackSetting: shownLifts.squat && squatSetting !== '' ? squatSetting : null,
        rackHeightBench: shownLifts.bench ? parseOptionalNumber(rackBench) : null,
        benchSafetyHeight: shownLifts.bench ? parseOptionalNumber(benchSafety) : null,
        benchSpotting: shownLifts.bench && benchSpotting !== '' ? benchSpotting : null,
        status: nextStatus,
      });
      if (result.status === 'error') {
        setStatus(entry.status);
        setError(readError(result));
        return;
      }
      // Collapse once saved; a freshly weighed-in lifter folds away to keep the to-do list short.
      setManuallyExpanded(false);
      router.refresh();
    });
  }

  function changeWeightClass(next: string) {
    const previous = weightClassId;
    setWeightClassId(next);
    setError(null);
    startTransition(async () => {
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
    });
  }

  const weighedIn = entry.status === 'weighed_in';
  const saveLabel = weighedIn ? 'Save weigh-in' : 'Save & mark weighed in';
  // Weighed-in lifters collapse to a compact row; everyone still to do stays open.
  const expanded = !weighedIn || manuallyExpanded;

  // Team comps score purely on IPF GL points, so weight class is irrelevant — the field and its
  // bodyweight check are dropped for team weigh-ins.
  const showWeightClass = !isTeamComp;
  // A lifter only competes in classes for their own gender.
  const classOptions = weightClasses.filter((weightClass) => weightClass.gender === entry.sex);
  const assignedClass = weightClasses.find((weightClass) => weightClass.id === weightClassId) ?? null;
  const bodyweightValue = parseOptionalNumber(bodyweight);
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

  // A lifter is weighed in on bodyweight and openers alone; rack details can follow at the platform.
  const openerMissing =
    (shownLifts.squat && parseOptionalNumber(openerSquat) === null) ||
    (shownLifts.bench && parseOptionalNumber(openerBench) === null) ||
    (shownLifts.deadlift && parseOptionalNumber(openerDeadlift) === null);
  const canMarkWeighedIn = parseOptionalNumber(bodyweight) !== null && !openerMissing;

  if (!expanded) {
    const summary = openerSummary(entry, shownLifts);
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold tracking-tight">{entry.lifterName}</span>
          <span className="text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
          </span>
          <span className="text-xs text-neutral-700">
            BW {entry.bodyweightKg ?? '—'}
            {showWeightClass && assignedClass ? ` · ${assignedClass.name}` : ''}
            {summary ? ` · ${summary}` : ''}
          </span>
          {classWarning ? <span className="text-xs font-medium text-amber-700">⚠ {classWarning}</span> : null}
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

      {classWarning ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {classWarning}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {showWeightClass ? (
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Weight class</span>
            <select
              value={weightClassId}
              onChange={(event) => changeWeightClass(event.target.value)}
              disabled={pending}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              {classOptions.map((weightClass) => (
                <option key={weightClass.id} value={weightClass.id}>
                  {weightClass.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <NumberField
          label="Bodyweight (kg)"
          value={bodyweight}
          onChange={setBodyweight}
          step="0.1"
          required
          invalid={parseOptionalNumber(bodyweight) === null}
        />

        {shownLifts.squat ? (
          <NumberField
            label="Opening squat (kg)"
            value={openerSquat}
            onChange={setOpenerSquat}
            step="0.5"
            required
            invalid={parseOptionalNumber(openerSquat) === null}
          />
        ) : null}
        {shownLifts.bench ? (
          <NumberField
            label="Opening bench (kg)"
            value={openerBench}
            onChange={setOpenerBench}
            step="0.5"
            required
            invalid={parseOptionalNumber(openerBench) === null}
          />
        ) : null}
        {shownLifts.deadlift ? (
          <NumberField
            label="Opening deadlift (kg)"
            value={openerDeadlift}
            onChange={setOpenerDeadlift}
            step="0.5"
            required
            invalid={parseOptionalNumber(openerDeadlift) === null}
          />
        ) : null}

        {shownLifts.squat ? (
          <NumberField label="Squat rack height" value={rackSquat} onChange={setRackSquat} step="1" />
        ) : null}
        {shownLifts.squat ? (
          <OptionalSelectField
            label="Squat rack setting"
            value={squatSetting}
            onChange={setSquatSetting}
            options={SQUAT_RACK_SETTINGS}
            labels={SQUAT_RACK_SETTING_LABELS}
            wrapperClassName={FIELD_CLASS}
            selectClassName={INPUT_CLASS}
          />
        ) : null}
        {shownLifts.bench ? (
          <NumberField label="Bench height" value={rackBench} onChange={setRackBench} step="1" />
        ) : null}
        {shownLifts.bench ? (
          <NumberField label="Bench safety height" value={benchSafety} onChange={setBenchSafety} step="1" />
        ) : null}
        {shownLifts.bench ? (
          <OptionalSelectField
            label="Bench spotting"
            value={benchSpotting}
            onChange={setBenchSpotting}
            options={BENCH_SPOTTINGS}
            labels={BENCH_SPOTTING_LABELS}
            wrapperClassName={FIELD_CLASS}
            selectClassName={INPUT_CLASS}
          />
        ) : null}

        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Status</span>
          <select
            value={status}
            onChange={(event) => {
              // The select only renders ENTRY_STATUSES values, so this narrowing is exact.
              setStatus(event.target.value as EntryStatus);
            }}
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
          onClick={() => save('weighed_in')}
          disabled={pending || !canMarkWeighedIn}
          className={PRIMARY_BUTTON}
        >
          {pending ? 'Saving…' : saveLabel}
        </button>
        <button type="button" onClick={() => save(status)} disabled={pending} className={GHOST_BUTTON}>
          Save progress
        </button>
        {weighedIn ? (
          <button
            type="button"
            onClick={() => setManuallyExpanded(false)}
            disabled={pending}
            className={GHOST_BUTTON}
          >
            Collapse
          </button>
        ) : null}
        {canMarkWeighedIn ? null : (
          <span className="text-xs text-neutral-500">Needs bodyweight and openers to weigh in</span>
        )}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function WeighInManager({
  competitionId,
  compSlug,
  isTeamCompetition,
  lifts,
  sessions,
  weightClasses,
  entries,
  unflightedCount,
}: {
  competitionId: string;
  compSlug: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  sessions: WeighInSessionOption[];
  weightClasses: WeightClassOption[];
  entries: WeighInEntry[];
  unflightedCount: number;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? null);
  const [query, setQuery] = useState('');

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

  return (
    <div className="space-y-6">
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
          {sessionEntries.length === 0
            ? 'No lifters assigned to this session yet.'
            : `${weighedInCount} of ${sessionEntries.length} weighed in`}
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

      {groups.map((group) => {
        // Lifters still to weigh in stay at the top in calling order; the weighed-in ones sink to
        // the bottom (sort is stable, so calling order holds within each part).
        const ordered = group.entries.toSorted(
          (a, b) => Number(a.status === 'weighed_in') - Number(b.status === 'weighed_in'),
        );
        return (
          <div key={`${group.lift ?? 'all'}-${group.sex}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {groupLabel(group, isTeamCompetition)}
            </h2>
            <div className="mt-3 space-y-4">
              {ordered.map((entry) => (
                <WeighInCard
                  key={entry.id}
                  competitionId={competitionId}
                  entry={entry}
                  lifts={lifts}
                  isTeamComp={isTeamCompetition}
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
  );
}
