'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPlatformAction,
  deletePlatformAction,
  updatePlatformAction,
} from '@/actions/platforms';
import {
  createSessionAction,
  deleteSessionAction,
  updateSessionAction,
} from '@/actions/sessions';
import { createFlightAction, deleteFlightAction, updateFlightAction } from '@/actions/flights';
import { assignEntryFlightAction } from '@/actions/entries';
import { MAX_FLIGHT_SIZE } from '@/lib/constants';
import { compareFlightOrder } from '@/lib/flights/order';
import { TeamFlightBoard, type BoardTeam } from '@/components/flights/team-flight-board';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { ActionResult } from '@/types/action-result';
import Link from 'next/link';

export type PlatformOption = { id: string; name: string };
export type SessionRow = {
  id: string;
  name: string;
  session_date: string | null;
  weigh_in_time: string | null;
  lift_off_time: string | null;
  platform_id: string | null;
  sort_order: number;
};
export type FlightRow = { id: string; session_id: string; name: string; sort_order: number };
export type BoardEntry = {
  id: string;
  flight_id: string | null;
  lot_number: number | null;
  opener_kg: number | null;
  weight_class_name: string | null;
  lifter_name: string;
};

const UNASSIGNED = 'unassigned';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
const GHOST_BUTTON = buttonClasses('secondary');
const PRIMARY_BUTTON = buttonClasses('primary');

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

function timeForInput(value: string | null): string {
  return (value ?? '').slice(0, 5);
}

// ----- Platforms -----------------------------------------------------------------------------

function PlatformRow({ platform }: { platform: PlatformOption }) {
  const router = useRouter();
  const [name, setName] = useState(platform.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePlatformAction({ id: platform.id, name });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePlatformAction({ id: platform.id });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        aria-label="Platform name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${INPUT_CLASS} flex-1`}
      />
      <button type="button" onClick={save} disabled={pending || name.trim() === '' || name === platform.name} className={GHOST_BUTTON}>
        Save
      </button>
      <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
        Delete
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PlatformsEditor({ competitionId, platforms }: { competitionId: string; platforms: PlatformOption[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createPlatformAction({ competitionId, name });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      setName('');
      router.refresh();
    });
  }

  return (
    <Card title="Platforms">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Most meets run on a single platform. Add a second only if you are running more than one at once.
      </p>

      <div className="divide-y divide-neutral-100">
        {platforms.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No platforms added — sessions will use the single default platform.</p>
        ) : (
          platforms.map((platform) => <PlatformRow key={platform.id} platform={platform} />)
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <input
          aria-label="New platform name"
          placeholder="e.g. Platform 2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add platform
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// ----- Flights (structure within a session) --------------------------------------------------

function FlightRowEditor({ flight }: { flight: FlightRow }) {
  const router = useRouter();
  const [name, setName] = useState(flight.name);
  const [sortOrder, setSortOrder] = useState(flight.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name !== flight.name || sortOrder !== flight.sort_order;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateFlightAction({ id: flight.id, name, sortOrder });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteFlightAction({ id: flight.id });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        aria-label="Flight name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${INPUT_CLASS} flex-1`}
      />
      <input
        aria-label="Flight sort order"
        type="number"
        value={sortOrder}
        onChange={(event) => setSortOrder(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <button type="button" onClick={save} disabled={pending || !dirty || name.trim() === ''} className={GHOST_BUTTON}>
        Save
      </button>
      <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
        Delete
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FlightsEditor({
  competitionId,
  sessionId,
  flights,
}: {
  competitionId: string;
  sessionId: string;
  flights: FlightRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createFlightAction({ competitionId, sessionId, name, sortOrder: flights.length });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      setName('');
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <h4 className="text-sm font-semibold text-neutral-700">Flights</h4>
      <div className="mt-2 divide-y divide-neutral-100">
        {flights.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No flights in this session yet.</p>
        ) : (
          flights.map((flight) => <FlightRowEditor key={flight.id} flight={flight} />)
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          aria-label="New flight name"
          placeholder="e.g. Flight A"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add flight
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ----- Sessions ------------------------------------------------------------------------------

function SessionCard({
  competitionId,
  session,
  flights,
  platforms,
}: {
  competitionId: string;
  session: SessionRow;
  flights: FlightRow[];
  platforms: PlatformOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(session.name);
  const [sessionDate, setSessionDate] = useState(session.session_date ?? '');
  const [weighInTime, setWeighInTime] = useState(timeForInput(session.weigh_in_time));
  const [liftOffTime, setLiftOffTime] = useState(timeForInput(session.lift_off_time));
  const [platformId, setPlatformId] = useState(session.platform_id ?? '');
  const [sortOrder, setSortOrder] = useState(session.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showPlatform = platforms.length > 1;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSessionAction({
        id: session.id,
        competitionId,
        name,
        sessionDate: sessionDate.trim() || null,
        weighInTime: weighInTime.trim() || null,
        liftOffTime: liftOffTime.trim() || null,
        platformId: platformId === '' ? null : platformId,
        sortOrder,
      });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteSessionAction({ id: session.id });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Session name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Date</span>
          <input
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Weigh-ins open at</span>
          <input
            type="time"
            value={weighInTime}
            onChange={(event) => setWeighInTime(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Lifting starts at</span>
          <input
            type="time"
            value={liftOffTime}
            onChange={(event) => setLiftOffTime(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        {showPlatform ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Platform</span>
            <select value={platformId} onChange={(event) => setPlatformId(event.target.value)} className={INPUT_CLASS}>
              <option value="">—</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Sort order</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={save} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
          Delete session
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <FlightsEditor competitionId={competitionId} sessionId={session.id} flights={flights} />
    </section>
  );
}

function AddSession({ competitionId, nextSortOrder }: { competitionId: string; nextSortOrder: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createSessionAction({
        competitionId,
        name,
        sessionDate: null,
        weighInTime: null,
        liftOffTime: null,
        platformId: null,
        sortOrder: nextSortOrder,
      });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      setName('');
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="New session name"
          placeholder="e.g. Morning session"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add session
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// ----- Roster board --------------------------------------------------------------------------

function FlightSelect({
  value,
  onChange,
  sessions,
  flightsBySession,
}: {
  value: string | null;
  onChange: (flightId: string | null) => void;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
}) {
  return (
    <select
      aria-label="Move to flight"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      className={`${INPUT_CLASS} max-w-[12rem]`}
    >
      <option value="">Unassigned</option>
      {sessions.map((session) => {
        const flights = flightsBySession.get(session.id) ?? [];
        if (flights.length === 0) {
          return null;
        }
        return (
          <optgroup key={session.id} label={session.name}>
            {flights.map((flight) => (
              <option key={flight.id} value={flight.id}>
                {flight.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function EntryChip({
  entry,
  currentFlightId,
  sessions,
  flightsBySession,
  onMove,
}: {
  entry: BoardEntry;
  currentFlightId: string | null;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  onMove: (entryId: string, flightId: string | null) => void;
}) {
  const meta = [
    entry.lot_number === null ? 'No lot' : `Lot ${entry.lot_number}`,
    entry.opener_kg === null ? null : `${entry.opener_kg} kg`,
    entry.weight_class_name,
  ].filter((part): part is string => part !== null);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900">{entry.lifter_name}</p>
        <p className="truncate text-xs text-neutral-500">{meta.join(' · ')}</p>
      </div>
      <FlightSelect
        value={currentFlightId}
        onChange={(flightId) => onMove(entry.id, flightId)}
        sessions={sessions}
        flightsBySession={flightsBySession}
      />
    </div>
  );
}

function Lane({
  title,
  entries,
  warnOver,
  sessions,
  flightsBySession,
  currentFlightId,
  onMove,
}: {
  title: string;
  entries: BoardEntry[];
  warnOver: boolean;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  currentFlightId: (entryId: string) => string | null;
  onMove: (entryId: string, flightId: string | null) => void;
}) {
  const over = warnOver && entries.length > MAX_FLIGHT_SIZE;

  return (
    <div className="flex min-w-[16rem] flex-1 flex-col rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-800">{title}</h4>
        <span className={over ? 'text-xs font-medium text-amber-700' : 'text-xs text-neutral-500'}>
          {entries.length}
          {over ? ` · over ${MAX_FLIGHT_SIZE}` : ''}
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {entries.length === 0 ? (
          <p className="text-xs text-neutral-400">No lifters.</p>
        ) : (
          entries.map((entry) => (
            <EntryChip
              key={entry.id}
              entry={entry}
              currentFlightId={currentFlightId(entry.id)}
              sessions={sessions}
              flightsBySession={flightsBySession}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function FlightsManager({
  competitionId,
  compSlug,
  isTeamCompetition,
  platforms,
  sessions,
  flights,
  entries,
  teams,
}: {
  competitionId: string;
  compSlug: string;
  isTeamCompetition: boolean;
  platforms: PlatformOption[];
  sessions: SessionRow[];
  flights: FlightRow[];
  entries: BoardEntry[];
  teams: BoardTeam[];
}) {
  // Optimistic assignment state: seeded from the server rows and re-seeded whenever a structural
  // refresh hands us new entries. A "move" updates this immediately and reconciles on failure.
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, entry.flight_id])),
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setAssignments(Object.fromEntries(entries.map((entry) => [entry.id, entry.flight_id])));
  }, [entries]);

  const flightsBySession = useMemo(() => {
    const map = new Map<string, FlightRow[]>();
    for (const flight of flights.toSorted((a, b) => a.sort_order - b.sort_order)) {
      const list = map.get(flight.session_id) ?? [];
      list.push(flight);
      map.set(flight.session_id, list);
    }
    return map;
  }, [flights]);

  const entriesByFlight = useMemo(() => {
    const map = new Map<string, BoardEntry[]>();
    for (const entry of entries) {
      const key = assignments[entry.id] ?? UNASSIGNED;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.toSorted((a, b) =>
          compareFlightOrder(
            { openerKg: a.opener_kg, lotNumber: a.lot_number },
            { openerKg: b.opener_kg, lotNumber: b.lot_number },
          ),
        ),
      );
    }
    return map;
  }, [entries, assignments]);

  const currentFlightId = (entryId: string): string | null => assignments[entryId] ?? null;

  function moveEntry(entryId: string, flightId: string | null) {
    const previous = assignments[entryId] ?? null;
    if (previous === flightId) {
      return;
    }
    setMoveError(null);
    setAssignments((current) => ({ ...current, [entryId]: flightId }));
    startTransition(async () => {
      const result = await assignEntryFlightAction({ entryId, competitionId, flightId });
      if (result.status === 'error') {
        setAssignments((current) => ({ ...current, [entryId]: previous }));
        setMoveError(readError(result));
      }
    });
  }

  const unassigned = entriesByFlight.get(UNASSIGNED) ?? [];
  const hasFlights = flights.length > 0;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Sessions &amp; flights</h2>
        <PlatformsEditor competitionId={competitionId} platforms={platforms} />
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            competitionId={competitionId}
            session={session}
            flights={flightsBySession.get(session.id) ?? []}
            platforms={platforms}
          />
        ))}
        <AddSession competitionId={competitionId} nextSortOrder={sessions.length} />
      </div>

      {isTeamCompetition ? (
        <TeamFlightBoard
          competitionId={competitionId}
          compSlug={compSlug}
          sessions={sessions}
          flights={flights}
          teams={teams}
        />
      ) : (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Roster</h2>
          {entries.length > 0 ? (
            <span className="text-sm text-neutral-500">
              {unassigned.length === 0 ? 'All lifters assigned' : `${unassigned.length} unassigned`}
            </span>
          ) : null}
        </div>

        {moveError ? (
          <p role="alert" className="text-sm text-red-600">
            {moveError}
          </p>
        ) : null}

        {entries.length === 0 ? (
          <EmptyState
            title="No lifters to assign yet"
            description="Flights are the groups of 8–14 lifters who lift together. Register lifters first, then come back here to place them into sessions and flights."
            action={
              <Link href={`/${compSlug}/entries`} className={buttonClasses('secondary')}>
                Go to Lifters
              </Link>
            }
          />
        ) : (
          <>
            <Lane
              title="Unassigned"
              entries={unassigned}
              warnOver={false}
              sessions={sessions}
              flightsBySession={flightsBySession}
              currentFlightId={currentFlightId}
              onMove={moveEntry}
            />

            {hasFlights ? (
              sessions.map((session) => {
                const sessionFlights = flightsBySession.get(session.id) ?? [];
                if (sessionFlights.length === 0) {
                  return null;
                }
                return (
                  <div key={session.id} className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-700">{session.name}</h3>
                    <div className="flex flex-wrap gap-3">
                      {sessionFlights.map((flight) => (
                        <Lane
                          key={flight.id}
                          title={flight.name}
                          entries={entriesByFlight.get(flight.id) ?? []}
                          warnOver
                          sessions={sessions}
                          flightsBySession={flightsBySession}
                          currentFlightId={currentFlightId}
                          onMove={moveEntry}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-neutral-500">
                Add a session and at least one flight above to start assigning lifters.
              </p>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
