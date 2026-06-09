'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { assignTeamFlightAction } from '@/actions/flights';
import { LIFT_LABELS, MAX_FLIGHT_SIZE } from '@/lib/constants';
import type { TeamLift } from '@/types/team';
import type { ActionResult } from '@/types/action-result';
import type { FlightRow, SessionRow } from '@/components/flights/flights-manager';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export type BoardTeamMember = { lift: TeamLift; lifter_name: string };
export type BoardTeam = {
  id: string;
  name: string;
  sort_order: number;
  flightId: string | null;
  members: BoardTeamMember[];
};

const UNASSIGNED = 'unassigned';

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

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

function TeamChip({
  team,
  currentFlightId,
  sessions,
  flightsBySession,
  onMove,
}: {
  team: BoardTeam;
  currentFlightId: string | null;
  sessions: SessionRow[];
  flightsBySession: Map<string, FlightRow[]>;
  onMove: (teamId: string, flightId: string | null) => void;
}) {
  const filled = team.members.length;
  const memberLine =
    filled === 0
      ? 'No members yet'
      : team.members.map((member) => `${LIFT_LABELS[member.lift]}: ${member.lifter_name}`).join(' · ');

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{team.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {memberLine}
            {filled > 0 && filled < 3 ? ` · incomplete (${filled}/3)` : ''}
          </p>
        </div>
        <FlightSelect
          value={currentFlightId}
          onChange={(flightId) => onMove(team.id, flightId)}
          sessions={sessions}
          flightsBySession={flightsBySession}
        />
      </div>
    </div>
  );
}

function Lane({ title, count, warnOver, children }: { title: string; count: number; warnOver: boolean; children: React.ReactNode }) {
  const over = warnOver && count > MAX_FLIGHT_SIZE;
  return (
    <div className="flex min-w-[18rem] flex-1 flex-col rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-neutral-800">{title}</h4>
        <span className={over ? 'text-xs font-medium text-amber-700' : 'text-xs text-neutral-500'}>
          {count}
          {over ? ` · over ${MAX_FLIGHT_SIZE}` : ''}
        </span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function TeamFlightBoard({
  competitionId,
  compSlug,
  sessions,
  flights,
  teams,
}: {
  competitionId: string;
  compSlug: string;
  sessions: SessionRow[];
  flights: FlightRow[];
  teams: BoardTeam[];
}) {
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(teams.map((team) => [team.id, team.flightId])),
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setAssignments(Object.fromEntries(teams.map((team) => [team.id, team.flightId])));
  }, [teams]);

  const flightsBySession = useMemo(() => {
    const map = new Map<string, FlightRow[]>();
    for (const flight of flights.toSorted((a, b) => a.sort_order - b.sort_order)) {
      const list = map.get(flight.session_id) ?? [];
      list.push(flight);
      map.set(flight.session_id, list);
    }
    return map;
  }, [flights]);

  const teamsByFlight = useMemo(() => {
    const map = new Map<string, BoardTeam[]>();
    for (const team of teams) {
      const key = assignments[team.id] ?? UNASSIGNED;
      const list = map.get(key) ?? [];
      list.push(team);
      map.set(key, list);
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.toSorted((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      );
    }
    return map;
  }, [teams, assignments]);

  function moveTeam(teamId: string, flightId: string | null) {
    const previous = assignments[teamId] ?? null;
    if (previous === flightId) {
      return;
    }
    setMoveError(null);
    setAssignments((current) => ({ ...current, [teamId]: flightId }));
    startTransition(async () => {
      const result = await assignTeamFlightAction({ teamId, competitionId, flightId });
      if (result.status === 'error') {
        setAssignments((current) => ({ ...current, [teamId]: previous }));
        setMoveError(readError(result));
      }
    });
  }

  const currentFlightId = (teamId: string): string | null => assignments[teamId] ?? null;
  const unassigned = teamsByFlight.get(UNASSIGNED) ?? [];
  const hasFlights = flights.length > 0;

  const renderTeam = (team: BoardTeam) => (
    <TeamChip
      key={team.id}
      team={team}
      currentFlightId={currentFlightId(team.id)}
      sessions={sessions}
      flightsBySession={flightsBySession}
      onMove={moveTeam}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Roster</h2>
        {teams.length > 0 ? (
          <span className="text-sm text-neutral-500">
            {unassigned.length === 0 ? 'All teams assigned' : `${unassigned.length} unassigned`}
          </span>
        ) : null}
      </div>

      {moveError ? (
        <p role="alert" className="text-sm text-red-600">
          {moveError}
        </p>
      ) : null}

      {teams.length === 0 ? (
        <EmptyState
          title="No teams to assign yet"
          description="This is a team competition, so flights are filled by team, not by lifter — every member of a team moves together. Create teams first, then come back here to place them."
          action={
            <Link href={`/${compSlug}/teams`} className={buttonClasses('secondary')}>
              Go to Teams
            </Link>
          }
        />
      ) : (
        <>
          <Lane title="Unassigned" count={unassigned.length} warnOver={false}>
            {unassigned.length === 0 ? (
              <p className="text-xs text-neutral-400">No teams.</p>
            ) : (
              unassigned.map((team) => renderTeam(team))
            )}
          </Lane>

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
                    {sessionFlights.map((flight) => {
                      const flightTeams = teamsByFlight.get(flight.id) ?? [];
                      return (
                        <Lane key={flight.id} title={flight.name} count={flightTeams.length} warnOver>
                          {flightTeams.length === 0 ? (
                            <p className="text-xs text-neutral-400">No teams.</p>
                          ) : (
                            flightTeams.map((team) => renderTeam(team))
                          )}
                        </Lane>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-500">
              Add a session and at least one flight above to start assigning teams.
            </p>
          )}
        </>
      )}
    </div>
  );
}
