'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { weighInAction } from '@/actions/entries';
import {
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  GENDER_LABELS,
  LIFT_LABELS,
  type Gender,
  type Lifts,
} from '@/lib/constants';
import { buildWeighInGroups, type WeighInGroup } from '@/lib/weigh-in/order';
import type { ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';
import type { TeamLift } from '@/types/team';

type EntryStatus = Database['public']['Enums']['entry_status'];

export type WeighInEntry = {
  id: string;
  sessionId: string | null;
  flightName: string | null;
  flightSortOrder: number | null;
  lifterName: string;
  sex: Gender;
  teamLift: TeamLift | null;
  lotNumber: number | null;
  bodyweightKg: number | null;
  openerSquatKg: number | null;
  openerBenchKg: number | null;
  openerDeadliftKg: number | null;
  rackHeightSquat: string | null;
  rackHeightBench: string | null;
  status: EntryStatus;
};

export type WeighInSessionOption = { id: string; name: string };

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const TAB_BASE = 'rounded-md px-3 py-2 text-sm font-medium';

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function numberToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />
    </label>
  );
}

function WeighInCard({
  competitionId,
  entry,
  lifts,
  isTeamComp,
}: {
  competitionId: string;
  entry: WeighInEntry;
  lifts: Lifts;
  isTeamComp: boolean;
}) {
  const router = useRouter();
  const shownLifts = liftsForEntry(entry, lifts, isTeamComp);
  const [bodyweight, setBodyweight] = useState(numberToInput(entry.bodyweightKg));
  const [openerSquat, setOpenerSquat] = useState(numberToInput(entry.openerSquatKg));
  const [openerBench, setOpenerBench] = useState(numberToInput(entry.openerBenchKg));
  const [openerDeadlift, setOpenerDeadlift] = useState(numberToInput(entry.openerDeadliftKg));
  const [rackSquat, setRackSquat] = useState(entry.rackHeightSquat ?? '');
  const [rackBench, setRackBench] = useState(entry.rackHeightBench ?? '');
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [error, setError] = useState<string | null>(null);
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
        rackHeightSquat: shownLifts.squat ? rackSquat.trim() || null : null,
        rackHeightBench: shownLifts.bench ? rackBench.trim() || null : null,
        status: nextStatus,
      });
      if (result.status === 'error') {
        setStatus(entry.status);
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  const weighedIn = entry.status === 'weighed_in';
  const saveLabel = weighedIn ? 'Save weigh-in' : 'Save & mark weighed in';

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold tracking-tight">{entry.lifterName}</h4>
          <p className="mt-0.5 text-xs text-neutral-500">
            {entry.flightName ?? 'No flight'}
            {entry.lotNumber === null ? '' : ` · Lot ${entry.lotNumber}`}
            {weighedIn ? ' · Weighed in' : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <NumberField label="Bodyweight (kg)" value={bodyweight} onChange={setBodyweight} step="0.1" />

        {shownLifts.squat ? (
          <NumberField label="Opening squat (kg)" value={openerSquat} onChange={setOpenerSquat} step="0.5" />
        ) : null}
        {shownLifts.bench ? (
          <NumberField label="Opening bench (kg)" value={openerBench} onChange={setOpenerBench} step="0.5" />
        ) : null}
        {shownLifts.deadlift ? (
          <NumberField label="Opening deadlift (kg)" value={openerDeadlift} onChange={setOpenerDeadlift} step="0.5" />
        ) : null}

        {shownLifts.squat ? <TextField label="Squat rack height" value={rackSquat} onChange={setRackSquat} /> : null}
        {shownLifts.bench ? <TextField label="Bench rack height" value={rackBench} onChange={setRackBench} /> : null}

        <label className="flex flex-col gap-1">
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
        <button type="button" onClick={() => save('weighed_in')} disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : saveLabel}
        </button>
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
  entries,
  unflightedCount,
}: {
  competitionId: string;
  compSlug: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  sessions: WeighInSessionOption[];
  entries: WeighInEntry[];
  unflightedCount: number;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? null);

  const sessionEntries = useMemo(
    () => entries.filter((entry) => entry.sessionId === selectedSessionId),
    [entries, selectedSessionId],
  );
  const groups = useMemo(
    () => buildWeighInGroups(sessionEntries, isTeamCompetition),
    [sessionEntries, isTeamCompetition],
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

      <p className="text-sm text-neutral-600">
        {sessionEntries.length === 0
          ? 'No lifters assigned to this session yet.'
          : `${weighedInCount} of ${sessionEntries.length} weighed in`}
      </p>

      {groups.map((group) => (
        <div key={`${group.lift ?? 'all'}-${group.sex}`}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {groupLabel(group, isTeamCompetition)}
          </h3>
          <div className="mt-3 space-y-4">
            {group.entries.map((entry) => (
              <WeighInCard
                key={entry.id}
                competitionId={competitionId}
                entry={entry}
                lifts={lifts}
                isTeamComp={isTeamCompetition}
              />
            ))}
          </div>
        </div>
      ))}

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
