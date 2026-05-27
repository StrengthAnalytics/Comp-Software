'use client';

import { useMemo, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { LIFT_LABELS } from '@/lib/constants';
import {
  compareRunningOrder,
  selectPlatformPositions,
  type PlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';

type AttemptRow = Database['public']['Tables']['attempts']['Row'];
type EntryRow = Database['public']['Tables']['entries']['Row'];
type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

export type BoardPlatform = { id: string; name: string };
export type BoardSession = { id: string; name: string; sortOrder: number; platformId: string | null };
export type BoardFlight = { id: string; sessionId: string; name: string; sortOrder: number };
export type BoardEntry = { id: string; lifterName: string; flightId: string | null; lotNumber: number | null };
export type BoardAttempt = {
  id: string;
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
};

type ScoresheetBoardProps = {
  competitionId: string;
  platforms: BoardPlatform[];
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// A row in the running order: an attempt joined to the lifter, flight and session it belongs to.
type RunRow = RunningOrderFields & {
  id: string;
  result: AttemptResult;
  lifterName: string;
  flightName: string;
  sessionId: string;
  sessionName: string;
  sessionSortOrder: number;
  platformId: string | null;
};

type PlatformQueue = {
  key: string;
  platformName: string | null;
  sessionName: string | null;
  positions: PlatformPositions<RunRow>;
  queue: RunRow[];
};

function applyAttemptChange(
  rows: BoardAttempt[],
  payload: RealtimePostgresChangesPayload<AttemptRow>,
): BoardAttempt[] {
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    return removedId ? rows.filter((row) => row.id !== removedId) : rows;
  }

  const changed = payload.new;
  const mapped: BoardAttempt = {
    id: changed.id,
    entryId: changed.entry_id,
    lift: changed.lift,
    attemptNumber: changed.attempt_number,
    weightKg: changed.weight_kg,
    result: changed.result,
  };
  const index = rows.findIndex((row) => row.id === mapped.id);
  if (index === -1) {
    return [...rows, mapped];
  }
  const next = [...rows];
  next[index] = mapped;
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
    // Lifter names are joined server-side and don't change mid-meet; reuse the known name.
    lifterName: existing?.lifterName ?? nameById.get(changed.id) ?? '—',
    flightId: changed.flight_id,
    lotNumber: changed.lot_number,
  };
  const index = rows.findIndex((row) => row.id === mapped.id);
  if (index === -1) {
    return [...rows, mapped];
  }
  const next = [...rows];
  next[index] = mapped;
  return next;
}

function buildPlatformQueues({
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
  attempts: BoardAttempt[];
}): { queues: PlatformQueue[]; unassignedCount: number } {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const unassignedEntries = new Set<string>();
  const rows: RunRow[] = [];
  for (const attempt of attempts) {
    const entry = entryById.get(attempt.entryId);
    if (!entry) {
      continue;
    }
    const flight = entry.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!flight || !session) {
      unassignedEntries.add(attempt.entryId);
      continue;
    }
    rows.push({
      id: attempt.id,
      lift: attempt.lift,
      attemptNumber: attempt.attemptNumber,
      weightKg: attempt.weightKg,
      lotNumber: entry.lotNumber,
      flightSortOrder: flight.sortOrder,
      result: attempt.result,
      lifterName: entry.lifterName,
      flightName: flight.name,
      sessionId: session.id,
      sessionName: session.name,
      sessionSortOrder: session.sortOrder,
      platformId: session.platformId,
    });
  }

  const groups = new Map<string, RunRow[]>();
  for (const row of rows) {
    const key = row.platformId ?? 'none';
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const queues: PlatformQueue[] = [];
  for (const [key, groupRows] of groups) {
    // The live session is the earliest (by sort order) that still has a pending, declared attempt.
    const pending = groupRows.filter((row) => row.result === 'pending' && row.weightKg !== null);
    const firstPending = pending.toSorted((a, b) =>
      a.sessionSortOrder === b.sessionSortOrder
        ? compareRunningOrder(a, b)
        : a.sessionSortOrder - b.sessionSortOrder,
    )[0];
    const liveSessionId = firstPending?.sessionId ?? null;

    const sessionRows = liveSessionId ? groupRows.filter((row) => row.sessionId === liveSessionId) : [];
    queues.push({
      key,
      platformName: key === 'none' ? null : (platformById.get(key)?.name ?? null),
      sessionName: firstPending?.sessionName ?? null,
      positions: selectPlatformPositions(sessionRows),
      queue: sessionRows
        .filter((row) => row.result === 'pending' && row.weightKg !== null)
        .toSorted(compareRunningOrder),
    });
  }

  queues.sort((a, b) => (a.platformName ?? '').localeCompare(b.platformName ?? ''));
  return { queues, unassignedCount: unassignedEntries.size };
}

export function ScoresheetBoard({
  competitionId,
  platforms,
  sessions,
  flights,
  entries: initialEntries,
  attempts: initialAttempts,
}: ScoresheetBoardProps) {
  const [attempts, setAttempts] = useState<BoardAttempt[]>(initialAttempts);
  const [entries, setEntries] = useState<BoardEntry[]>(initialEntries);

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

  const { queues, unassignedCount } = useMemo(
    () => buildPlatformQueues({ platforms, sessions, flights, entries, attempts }),
    [platforms, sessions, flights, entries, attempts],
  );

  if (queues.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
        <p className="text-sm text-neutral-600">
          No attempts yet. Weigh lifters in to populate round one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {unassignedCount > 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unassignedCount} weighed-in {unassignedCount === 1 ? 'lifter is' : 'lifters are'} not assigned
          to a flight and won&apos;t appear in the running order.
        </p>
      ) : null}

      {queues.map((platformQueue) => (
        <PlatformPanel key={platformQueue.key} platformQueue={platformQueue} />
      ))}
    </div>
  );
}

function PlatformPanel({ platformQueue }: { platformQueue: PlatformQueue }) {
  const { platformName, sessionName, positions, queue } = platformQueue;
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

      {queue.length > 0 ? (
        <RunningOrderTable rows={queue} />
      ) : (
        <p className="text-sm text-neutral-500">No lifters in the running order.</p>
      )}
    </section>
  );
}

function PositionCard({ label, row, highlight }: { label: string; row: RunRow | null; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? 'rounded-md border-2 border-neutral-900 p-3'
          : 'rounded-md border border-neutral-200 p-3'
      }
    >
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

function RunningOrderTable({ rows }: { rows: RunRow[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
          <th scope="col" className="py-2 pr-3 font-medium">
            #
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Lifter
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Flight
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Lift
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Att.
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Weight
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id}
            className={
              index === 0
                ? 'border-b border-neutral-100 bg-neutral-50 font-medium'
                : 'border-b border-neutral-100'
            }
          >
            <td className="py-2 pr-3 tabular-nums text-neutral-500">{index + 1}</td>
            <td className="py-2 pr-3">{row.lifterName}</td>
            <td className="py-2 pr-3 text-neutral-600">{row.flightName}</td>
            <td className="py-2 pr-3 text-neutral-600">{LIFT_LABELS[row.lift]}</td>
            <td className="py-2 pr-3 tabular-nums text-neutral-600">{row.attemptNumber}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{row.weightKg} kg</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
