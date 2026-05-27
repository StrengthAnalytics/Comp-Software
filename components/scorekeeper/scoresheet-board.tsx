'use client';

import { useMemo, useState, useTransition } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { ATTEMPT_RESULT_LABELS, LIFT_LABELS, type Lifts } from '@/lib/constants';
import {
  compareRunningOrder,
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import {
  changeAttemptWeightAction,
  declareAttemptAction,
  setAttemptResultAction,
} from '@/actions/attempts';
import type { ActionResult } from '@/types/action-result';

type AttemptRow = Database['public']['Tables']['attempts']['Row'];
type EntryRow = Database['public']['Tables']['entries']['Row'];
type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

export type BoardPlatform = { id: string; name: string };
export type BoardSession = { id: string; name: string; sortOrder: number; platformId: string | null };
export type BoardFlight = { id: string; sessionId: string; name: string; sortOrder: number };
export type BoardEntry = {
  id: string;
  lifterName: string;
  flightId: string | null;
  lotNumber: number | null;
  teamLift: LiftType | null;
};
export type BoardAttempt = {
  id: string;
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
  weightChanges: number;
};

type ScoresheetBoardProps = {
  competitionId: string;
  isTeamCompetition: boolean;
  lifts: Lifts;
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

const INPUT_CLASS =
  'w-16 rounded border border-neutral-300 px-1.5 py-1 text-sm tabular-nums text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON = 'rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

function attemptKey(entryId: string, lift: LiftType, attemptNumber: number): string {
  return `${entryId}:${lift}:${attemptNumber}`;
}

function mapAttempt(row: AttemptRow): BoardAttempt {
  return {
    id: row.id,
    entryId: row.entry_id,
    lift: row.lift,
    attemptNumber: row.attempt_number,
    weightKg: row.weight_kg,
    result: row.result,
    weightChanges: row.weight_changes,
  };
}

// Attempts are keyed by their natural key (entry + lift + attempt number) so an optimistic insert and
// the realtime insert that follows it collapse onto the same cell instead of duplicating.
function applyAttemptChange(
  current: Map<string, BoardAttempt>,
  payload: RealtimePostgresChangesPayload<AttemptRow>,
): Map<string, BoardAttempt> {
  const next = new Map(current);
  if (payload.eventType === 'DELETE') {
    const old = payload.old;
    if (old.entry_id && old.lift && old.attempt_number) {
      next.delete(attemptKey(old.entry_id, old.lift, old.attempt_number));
    }
    return next;
  }
  const attempt = mapAttempt(payload.new);
  next.set(attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt);
  return next;
}

function applyEntryChange(
  rows: BoardEntry[],
  payload: RealtimePostgresChangesPayload<EntryRow>,
  nameById: Map<string, string>,
): BoardEntry[] {
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    return removedId ? rows.filter((row) => row.id !== removedId) : rows;
  }
  const changed = payload.new;
  const existing = rows.find((row) => row.id === changed.id);
  const mapped: BoardEntry = {
    id: changed.id,
    lifterName: existing?.lifterName ?? nameById.get(changed.id) ?? '—',
    flightId: changed.flight_id,
    lotNumber: changed.lot_number,
    teamLift: changed.team_lift,
  };
  const index = rows.findIndex((row) => row.id === mapped.id);
  if (index === -1) {
    return [...rows, mapped];
  }
  const next = [...rows];
  next[index] = mapped;
  return next;
}

type RunRow = RunningOrderFields & { entryId: string; lifterName: string; flightName: string };

type PlatformView = {
  key: string;
  platformName: string | null;
  sessionName: string | null;
  positions: PlatformPositions<RunRow>;
  roster: { entry: BoardEntry; flightName: string }[];
};

function buildPlatformViews({
  platforms,
  sessions,
  flights,
  entries,
  attempts,
}: {
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: Map<string, BoardAttempt>;
}): PlatformView[] {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const rows: (RunRow & { result: AttemptResult; sessionId: string; sessionSortOrder: number; platformKey: string })[] = [];
  for (const attempt of attempts.values()) {
    const entry = entryById.get(attempt.entryId);
    const flight = entry?.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!entry || !flight || !session) {
      continue;
    }
    rows.push({
      entryId: attempt.entryId,
      lift: attempt.lift,
      attemptNumber: attempt.attemptNumber,
      weightKg: attempt.weightKg,
      lotNumber: entry.lotNumber,
      flightSortOrder: flight.sortOrder,
      result: attempt.result,
      lifterName: entry.lifterName,
      flightName: flight.name,
      sessionId: session.id,
      sessionSortOrder: session.sortOrder,
      platformKey: session.platformId ?? 'none',
    });
  }

  // Every session that holds a flight, grouped by platform, so a platform with lifters assigned but
  // no attempts yet still shows up.
  const platformKeys = new Set<string>();
  for (const session of sessions) {
    platformKeys.add(session.platformId ?? 'none');
  }
  for (const row of rows) {
    platformKeys.add(row.platformKey);
  }

  const views: PlatformView[] = [];
  for (const key of platformKeys) {
    const groupRows = rows.filter((row) => row.platformKey === key);

    const pending = groupRows.filter((row) => row.result === 'pending' && row.weightKg !== null);
    const firstPending = pending.toSorted((a, b) =>
      a.sessionSortOrder === b.sessionSortOrder
        ? compareRunningOrder(a, b)
        : a.sessionSortOrder - b.sessionSortOrder,
    )[0];
    // Fall back to the latest session that has attempts, so a finished session stays open for review.
    const latest = groupRows.toSorted((a, b) => b.sessionSortOrder - a.sessionSortOrder)[0];
    const liveSessionId = firstPending?.sessionId ?? latest?.sessionId ?? null;

    const sessionRows = liveSessionId ? groupRows.filter((row) => row.sessionId === liveSessionId) : [];
    const sessionFlightIds = new Set(
      flights.filter((flight) => flight.sessionId === liveSessionId).map((flight) => flight.id),
    );
    const roster = entries
      .filter((entry) => entry.flightId !== null && sessionFlightIds.has(entry.flightId))
      .map((entry) => ({ entry, flight: entry.flightId ? flightById.get(entry.flightId) : undefined }))
      .filter((item): item is { entry: BoardEntry; flight: BoardFlight } => item.flight !== undefined)
      .toSorted((a, b) =>
        a.flight.sortOrder === b.flight.sortOrder
          ? (a.entry.lotNumber ?? Number.POSITIVE_INFINITY) - (b.entry.lotNumber ?? Number.POSITIVE_INFINITY)
          : a.flight.sortOrder - b.flight.sortOrder,
      )
      .map((item) => ({ entry: item.entry, flightName: item.flight.name }));

    views.push({
      key,
      platformName: key === 'none' ? null : (platformById.get(key)?.name ?? null),
      sessionName: liveSessionId ? (sessionById.get(liveSessionId)?.name ?? null) : null,
      positions: selectPlatformPositions(sessionRows),
      roster,
    });
  }

  return views.toSorted((a, b) => (a.platformName ?? '').localeCompare(b.platformName ?? ''));
}

function resultTextClass(result: AttemptResult): string {
  if (result === 'good_lift') {
    return 'text-green-700';
  }
  if (result === 'no_lift') {
    return 'text-red-700';
  }
  return 'text-neutral-500';
}

export function ScoresheetBoard({
  competitionId,
  isTeamCompetition,
  lifts,
  platforms,
  sessions,
  flights,
  entries: initialEntries,
  attempts: initialAttempts,
}: ScoresheetBoardProps) {
  const [attempts, setAttempts] = useState<Map<string, BoardAttempt>>(
    () => new Map(initialAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
  );
  const [entries, setEntries] = useState<BoardEntry[]>(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const nameById = useMemo(
    () => new Map(initialEntries.map((entry) => [entry.id, entry.lifterName])),
    [initialEntries],
  );

  useAttemptsSubscription(competitionId, (payload) => {
    setAttempts((current) => applyAttemptChange(current, payload));
  });
  useEntriesSubscription(competitionId, (payload) => {
    setEntries((current) => applyEntryChange(current, payload, nameById));
  });

  const columnLifts = useMemo(
    () => (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => lifts[lift]),
    [lifts],
  );

  const views = useMemo(
    () => buildPlatformViews({ platforms, sessions, flights, entries, attempts }),
    [platforms, sessions, flights, entries, attempts],
  );

  function declare(entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) {
    const key = attemptKey(entry.id, lift, attemptNumber);
    const previous = attempts.get(key);
    setError(null);
    setAttempts((current) => {
      const next = new Map(current);
      next.set(key, {
        id: previous?.id ?? `temp:${key}`,
        entryId: entry.id,
        lift,
        attemptNumber,
        weightKg,
        result: 'pending',
        weightChanges: previous?.weightChanges ?? 0,
      });
      return next;
    });
    startTransition(async () => {
      const result = await declareAttemptAction({ competitionId, entryId: entry.id, lift, attemptNumber, weightKg });
      if (result.status === 'error') {
        setAttempts((current) => {
          const next = new Map(current);
          if (previous) {
            next.set(key, previous);
          } else {
            next.delete(key);
          }
          return next;
        });
        setError(readError(result));
        return;
      }
      // Adopt the real id so a follow-up result/change targets the persisted row.
      setAttempts((current) => {
        const existing = current.get(key);
        if (!existing) {
          return current;
        }
        const next = new Map(current);
        next.set(key, { ...existing, id: result.data.id });
        return next;
      });
    });
  }

  function patchAttempt(key: string, patch: Partial<BoardAttempt>) {
    setAttempts((current) => {
      const existing = current.get(key);
      if (!existing) {
        return current;
      }
      const next = new Map(current);
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }

  function changeWeight(attempt: BoardAttempt, weightKg: number) {
    const key = attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber);
    setError(null);
    patchAttempt(key, { weightKg, weightChanges: attempt.weightChanges + 1 });
    startTransition(async () => {
      const result = await changeAttemptWeightAction({ competitionId, attemptId: attempt.id, weightKg });
      if (result.status === 'error') {
        patchAttempt(key, { weightKg: attempt.weightKg, weightChanges: attempt.weightChanges });
        setError(readError(result));
      }
    });
  }

  function setResult(attempt: BoardAttempt, result: AttemptResult) {
    const key = attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber);
    setError(null);
    patchAttempt(key, { result });
    startTransition(async () => {
      const outcome = await setAttemptResultAction({ competitionId, attemptId: attempt.id, result });
      if (outcome.status === 'error') {
        patchAttempt(key, { result: attempt.result });
        setError(readError(outcome));
      }
    });
  }

  const hasRoster = views.some((view) => view.roster.length > 0);

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {hasRoster ? (
        views.map((view) => (
          <PlatformPanel
            key={view.key}
            view={view}
            attempts={attempts}
            columnLifts={columnLifts}
            isTeamCompetition={isTeamCompetition}
            onDeclare={declare}
            onChangeWeight={changeWeight}
            onSetResult={setResult}
          />
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">
            No lifters in a flight yet. Assign lifters to flights and weigh them in to start the run.
          </p>
        </div>
      )}
    </div>
  );
}

function PlatformPanel({
  view,
  attempts,
  columnLifts,
  isTeamCompetition,
  onDeclare,
  onChangeWeight,
  onSetResult,
}: {
  view: PlatformView;
  attempts: Map<string, BoardAttempt>;
  columnLifts: LiftType[];
  isTeamCompetition: boolean;
  onDeclare: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onChangeWeight: (attempt: BoardAttempt, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  const { platformName, sessionName, positions, roster } = view;
  const current = positions.onPlatform;

  return (
    <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <header>
        {platformName ? (
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{platformName}</p>
        ) : null}
        <h2 className="text-lg font-semibold text-neutral-900">{sessionName ?? 'No live session'}</h2>
        {current ? (
          <p className="text-sm text-neutral-500">
            {LIFT_LABELS[current.lift]} · Round {current.attemptNumber}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PositionCard label="On platform" row={positions.onPlatform} highlight />
        <PositionCard label="On deck" row={positions.onDeck} />
        <PositionCard label="In the hole" row={positions.inTheHole} />
      </div>

      {roster.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-500">
                <th scope="col" rowSpan={2} className="border-b border-neutral-200 py-2 pr-3 font-medium">
                  Lifter
                </th>
                <th scope="col" rowSpan={2} className="border-b border-neutral-200 py-2 pr-3 font-medium">
                  Flight
                </th>
                {columnLifts.map((lift) => (
                  <th
                    key={lift}
                    scope="colgroup"
                    colSpan={3}
                    className="border-b border-l border-neutral-200 px-2 py-2 text-center font-medium"
                  >
                    {LIFT_LABELS[lift]}
                  </th>
                ))}
              </tr>
              <tr className="text-xs text-neutral-400">
                {columnLifts.flatMap((lift) =>
                  [1, 2, 3].map((attemptNumber) => (
                    <th
                      key={`${lift}-${attemptNumber}`}
                      scope="col"
                      className={
                        attemptNumber === 1
                          ? 'border-b border-l border-neutral-200 px-2 py-1 text-center font-normal'
                          : 'border-b border-neutral-200 px-2 py-1 text-center font-normal'
                      }
                    >
                      {attemptNumber}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {roster.map(({ entry, flightName }) => (
                <tr key={entry.id} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-3 font-medium text-neutral-900">{entry.lifterName}</td>
                  <td className="py-2 pr-3 text-neutral-500">{flightName}</td>
                  {columnLifts.flatMap((lift) =>
                    [1, 2, 3].map((attemptNumber) => {
                      const active = isTeamCompetition ? entry.teamLift === lift : true;
                      const attempt = attempts.get(attemptKey(entry.id, lift, attemptNumber));
                      const isCurrent =
                        current?.entryId === entry.id &&
                        current.lift === lift &&
                        current.attemptNumber === attemptNumber;
                      return (
                        <td
                          key={`${entry.id}-${lift}-${attemptNumber}`}
                          className={
                            attemptNumber === 1
                              ? 'border-l border-neutral-200 px-2 py-2'
                              : 'px-2 py-2'
                          }
                        >
                          {active ? (
                            <AttemptCell
                              entry={entry}
                              lift={lift}
                              attemptNumber={attemptNumber}
                              attempt={attempt}
                              isCurrent={isCurrent}
                              onDeclare={onDeclare}
                              onChangeWeight={onChangeWeight}
                              onSetResult={onSetResult}
                            />
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No lifters in this session.</p>
      )}
    </section>
  );
}

function PositionCard({ label, row, highlight }: { label: string; row: RunRow | null; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-md border-2 border-neutral-900 p-3' : 'rounded-md border border-neutral-200 p-3'}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      {row ? (
        <>
          <p className="mt-1 font-semibold text-neutral-900">{row.lifterName}</p>
          <p className="text-sm text-neutral-600">
            {row.weightKg} kg · {LIFT_LABELS[row.lift]} {row.attemptNumber} · {row.flightName}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-neutral-400">—</p>
      )}
    </div>
  );
}

function AttemptCell({
  entry,
  lift,
  attemptNumber,
  attempt,
  isCurrent,
  onDeclare,
  onChangeWeight,
  onSetResult,
}: {
  entry: BoardEntry;
  lift: LiftType;
  attemptNumber: number;
  attempt: BoardAttempt | undefined;
  isCurrent: boolean;
  onDeclare: (entry: BoardEntry, lift: LiftType, attemptNumber: number, weightKg: number) => void;
  onChangeWeight: (attempt: BoardAttempt, weightKg: number) => void;
  onSetResult: (attempt: BoardAttempt, result: AttemptResult) => void;
}) {
  const [draft, setDraft] = useState('');

  const wrapperClass = isCurrent ? 'rounded ring-2 ring-neutral-900 p-1' : 'p-1';

  // Undeclared: capture the first weight.
  if (!attempt || attempt.weightKg === null) {
    const submitDeclare = () => {
      const value = Number(draft);
      if (Number.isFinite(value) && value > 0) {
        onDeclare(entry, lift, attemptNumber, value);
        setDraft('');
      }
    };
    return (
      <div className={`flex items-center gap-1 ${wrapperClass}`}>
        <input
          aria-label={`Declare ${LIFT_LABELS[lift]} attempt ${attemptNumber} for ${entry.lifterName}`}
          type="number"
          inputMode="decimal"
          step="0.5"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitDeclare();
            }
          }}
          className={INPUT_CLASS}
        />
        <button type="button" onClick={submitDeclare} disabled={draft.trim() === ''} className={GHOST_BUTTON}>
          Set
        </button>
      </div>
    );
  }

  // Resulted: show the call with the option to reopen for a correction.
  if (attempt.result !== 'pending') {
    const resulted = attempt;
    return (
      <div className={`flex flex-col gap-1 ${wrapperClass}`}>
        <span className="tabular-nums text-neutral-700">{resulted.weightKg} kg</span>
        <span className={`rounded px-1.5 py-0.5 text-center text-xs font-medium ${resultTextClass(resulted.result)}`}>
          {ATTEMPT_RESULT_LABELS[resulted.result]}
        </span>
        <button type="button" onClick={() => onSetResult(resulted, 'pending')} className={GHOST_BUTTON}>
          Reopen
        </button>
      </div>
    );
  }

  // Declared and pending: record a good/no lift, and (for attempts 2 and 3) optionally raise the bar.
  const declared = attempt;
  const currentWeight = declared.weightKg ?? 0;
  const canChange = (attemptNumber === 2 || attemptNumber === 3) && declared.weightChanges < 1;
  const submitChange = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value > currentWeight) {
      onChangeWeight(declared, value);
      setDraft('');
    }
  };
  return (
    <div className={`flex flex-col gap-1 ${wrapperClass}`}>
      <span className="tabular-nums text-neutral-900">{declared.weightKg} kg</span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`Good lift for ${entry.lifterName}`}
          onClick={() => onSetResult(declared, 'good_lift')}
          className="rounded border border-green-600 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50"
        >
          ✓
        </button>
        <button
          type="button"
          aria-label={`No lift for ${entry.lifterName}`}
          onClick={() => onSetResult(declared, 'no_lift')}
          className="rounded border border-red-600 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          ✗
        </button>
      </div>
      {canChange ? (
        <div className="flex items-center gap-1">
          <input
            aria-label={`Change weight for ${entry.lifterName}`}
            type="number"
            inputMode="decimal"
            step="0.5"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submitChange();
              }
            }}
            className={INPUT_CLASS}
          />
          <button type="button" onClick={submitChange} disabled={draft.trim() === ''} className={GHOST_BUTTON}>
            Raise
          </button>
        </div>
      ) : null}
    </div>
  );
}
