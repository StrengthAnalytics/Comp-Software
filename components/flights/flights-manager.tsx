'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { assignEntryFlightAction } from '@/actions/entries';
import { MAX_FLIGHT_SIZE } from '@/lib/constants';
import { compareFlightOrder } from '@/lib/flights/order';
import { sessionDisplayLabels } from '@/lib/sessions/schedule';
import { ScheduleBuilder } from '@/components/flights/schedule-builder';
import { ScheduleEditor } from '@/components/flights/schedule-editor';
import { TeamFlightBoard, type BoardTeam } from '@/components/flights/team-flight-board';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { BoardEntry, FlightRow, PlatformOption, SessionRow } from '@/components/flights/flights-types';
import { readError } from '@/components/station/save-state';

export type { BoardEntry, FlightRow, PlatformOption, SessionRow } from '@/components/flights/flights-types';

const UNASSIGNED = 'unassigned';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

// ----- Roster board --------------------------------------------------------------------------

function FlightSelect({
  value,
  onChange,
  sessions,
  flightsBySession,
  sessionLabels,
}: {
  value: string | null;
  onChange: (flightId: string | null) => void;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  sessionLabels: Map<string, string>;
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
          <optgroup key={session.id} label={sessionLabels.get(session.id) ?? session.name}>
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
  sessionLabels,
  onMove,
}: {
  entry: BoardEntry;
  currentFlightId: string | null;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  sessionLabels: Map<string, string>;
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
        sessionLabels={sessionLabels}
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
  sessionLabels,
  currentFlightId,
  onMove,
}: {
  title: string;
  entries: BoardEntry[];
  warnOver: boolean;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  sessionLabels: Map<string, string>;
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
              sessionLabels={sessionLabels}
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
  startsOn,
  endsOn,
  platforms,
  sessions,
  flights,
  entries,
  teams,
}: {
  competitionId: string;
  compSlug: string;
  isTeamCompetition: boolean;
  startsOn: string | null;
  endsOn: string | null;
  platforms: PlatformOption[];
  sessions: SessionRow[];
  flights: FlightRow[];
  entries: BoardEntry[];
  teams: BoardTeam[];
}) {
  // A comp with no sessions starts in the guided builder; "add sessions by hand" drops into the
  // editor with its own add-a-session buttons.
  const [builderDismissed, setBuilderDismissed] = useState(false);
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

  const platformNamesById = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform.name])),
    [platforms],
  );
  // Sessions are numbered per day, so the roster and the flight pickers spell out the day (and the
  // platform) whenever a bare name would be ambiguous.
  const sessionLabels = useMemo(
    () => sessionDisplayLabels(sessions, platformNamesById),
    [sessions, platformNamesById],
  );
  const lifterCountByFlight = useMemo(() => {
    const map = new Map<string, number>();
    for (const [flightId, list] of entriesByFlight) {
      if (flightId !== UNASSIGNED) {
        map.set(flightId, list.length);
      }
    }
    return map;
  }, [entriesByFlight]);

  const unassigned = entriesByFlight.get(UNASSIGNED) ?? [];
  const hasFlights = flights.length > 0;
  const showBuilder = sessions.length === 0 && !builderDismissed;

  return (
    <div className="space-y-10">
      {showBuilder ? (
        <ScheduleBuilder
          competitionId={competitionId}
          startsOn={startsOn}
          endsOn={endsOn}
          entryCount={entries.length}
          existingPlatformNames={platforms.map((platform) => platform.name)}
          onSkip={() => setBuilderDismissed(true)}
        />
      ) : (
        <ScheduleEditor
          competitionId={competitionId}
          startsOn={startsOn}
          endsOn={endsOn}
          platforms={platforms}
          sessions={sessions}
          flights={flights}
          lifterCountByFlight={lifterCountByFlight}
        />
      )}

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
              sessionLabels={sessionLabels}
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
                    <h3 className="text-sm font-semibold text-neutral-700">
                      {sessionLabels.get(session.id) ?? session.name}
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {sessionFlights.map((flight) => (
                        <Lane
                          key={flight.id}
                          title={flight.name}
                          entries={entriesByFlight.get(flight.id) ?? []}
                          warnOver
                          sessions={sessions}
                          flightsBySession={flightsBySession}
                          sessionLabels={sessionLabels}
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
                Build the schedule above to start assigning lifters.
              </p>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
