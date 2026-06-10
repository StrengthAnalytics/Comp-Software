'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignEntryTeamAction,
  createTeamAction,
  deleteTeamAction,
  updateTeamAction,
} from '@/actions/teams';
import { BulkAddTeams } from '@/components/teams/bulk-add-teams';
import { LIFT_LABELS } from '@/lib/constants';
import { TEAM_LIFTS, type TeamLift } from '@/types/team';
import type { ActionResult } from '@/types/action-result';
import { buttonClasses } from '@/components/ui/button';

export type TeamRow = { id: string; name: string; sort_order: number };
export type TeamMemberEntry = {
  id: string;
  team_id: string | null;
  team_lift: TeamLift | null;
  lifter_name: string;
};

type Assignment = { teamId: string | null; teamLift: TeamLift | null };

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON = buttonClasses('secondary');
const PRIMARY_BUTTON = buttonClasses('primary');

function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

function TeamSlot({
  lift,
  member,
  unassigned,
  onAssign,
  onClear,
}: {
  lift: TeamLift;
  member: TeamMemberEntry | undefined;
  unassigned: TeamMemberEntry[];
  onAssign: (entryId: string) => void;
  onClear: (entryId: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-100 py-2">
      <span className="w-20 text-sm font-medium text-neutral-700">{LIFT_LABELS[lift]}</span>
      {member ? (
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm text-neutral-900">{member.lifter_name}</span>
          <button type="button" onClick={() => onClear(member.id)} className={GHOST_BUTTON}>
            Remove
          </button>
        </div>
      ) : (
        <select
          aria-label={`Assign ${LIFT_LABELS[lift]} lifter`}
          value=""
          onChange={(event) => {
            if (event.target.value !== '') {
              onAssign(event.target.value);
            }
          }}
          className={`${INPUT_CLASS} flex-1`}
        >
          <option value="">— choose a lifter —</option>
          {unassigned.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.lifter_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TeamCard({
  competitionId,
  team,
  memberByLift,
  unassigned,
  onAssign,
  onClear,
}: {
  competitionId: string;
  team: TeamRow;
  memberByLift: Map<TeamLift, TeamMemberEntry>;
  unassigned: TeamMemberEntry[];
  onAssign: (entryId: string, teamId: string, teamLift: TeamLift) => void;
  onClear: (entryId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(team.name);
  const [sortOrder, setSortOrder] = useState(team.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name !== team.name || sortOrder !== team.sort_order;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamAction({ id: team.id, name, sortOrder });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!globalThis.confirm(`Delete team “${team.name}”? Its members will be unassigned.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteTeamAction({ id: team.id, competitionId });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Team name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <input
          aria-label="Sort order"
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
      </div>

      <div className="mt-3">
        {TEAM_LIFTS.map((lift) => (
          <TeamSlot
            key={lift}
            lift={lift}
            member={memberByLift.get(lift)}
            unassigned={unassigned}
            onAssign={(entryId) => onAssign(entryId, team.id, lift)}
            onClear={onClear}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function UnassignedBody({ total, unassigned }: { total: number; unassigned: TeamMemberEntry[] }) {
  if (total === 0) {
    return <p className="mt-2 text-sm text-neutral-500">No lifters registered yet. Add lifters on the entries screen first.</p>;
  }
  if (unassigned.length === 0) {
    return <p className="mt-2 text-sm text-neutral-500">Every registered lifter is on a team.</p>;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {unassigned.map((entry) => (
        <li key={entry.id} className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700">
          {entry.lifter_name}
        </li>
      ))}
    </ul>
  );
}

function AddTeam({ competitionId, nextSortOrder }: { competitionId: string; nextSortOrder: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createTeamAction({ competitionId, name, sortOrder: nextSortOrder });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      setName('');
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="New team name"
          placeholder="e.g. City Barbell A"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add team
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function TeamsManager({
  competitionId,
  teams,
  entries,
}: {
  competitionId: string;
  teams: TeamRow[];
  entries: TeamMemberEntry[];
}) {
  // Optimistic assignment state, seeded from the server rows and re-seeded on a structural refresh.
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, { teamId: entry.team_id, teamLift: entry.team_lift }])),
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setAssignments(
      Object.fromEntries(entries.map((entry) => [entry.id, { teamId: entry.team_id, teamLift: entry.team_lift }])),
    );
  }, [entries]);

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const unassigned = useMemo(
    () => entries.filter((entry) => (assignments[entry.id]?.teamId ?? null) === null),
    [entries, assignments],
  );

  function memberFor(teamId: string, lift: TeamLift): TeamMemberEntry | undefined {
    for (const [entryId, assignment] of Object.entries(assignments)) {
      if (assignment.teamId === teamId && assignment.teamLift === lift) {
        return entryById.get(entryId);
      }
    }
    return undefined;
  }

  function setAssignment(entryId: string, next: Assignment) {
    const previous = assignments[entryId] ?? { teamId: null, teamLift: null };
    if (previous.teamId === next.teamId && previous.teamLift === next.teamLift) {
      return;
    }
    setMoveError(null);
    setAssignments((current) => ({ ...current, [entryId]: next }));
    startTransition(async () => {
      const result = await assignEntryTeamAction({
        entryId,
        competitionId,
        teamId: next.teamId,
        teamLift: next.teamLift,
      });
      if (result.status === 'error') {
        setAssignments((current) => ({ ...current, [entryId]: previous }));
        setMoveError(readError(result));
      }
    });
  }

  const assign = (entryId: string, teamId: string, teamLift: TeamLift) =>
    setAssignment(entryId, { teamId, teamLift });
  const clear = (entryId: string) => setAssignment(entryId, { teamId: null, teamLift: null });

  return (
    <div className="space-y-6">
      {moveError ? (
        <p role="alert" className="text-sm text-red-600">
          {moveError}
        </p>
      ) : null}

      {teams.length > 0 ? (
        <div className="space-y-4">
          {teams.map((team) => {
            const memberByLift = new Map<TeamLift, TeamMemberEntry>();
            for (const lift of TEAM_LIFTS) {
              const member = memberFor(team.id, lift);
              if (member) {
                memberByLift.set(lift, member);
              }
            }
            return (
              <TeamCard
                key={team.id}
                competitionId={competitionId}
                team={team}
                memberByLift={memberByLift}
                unassigned={unassigned}
                onAssign={assign}
                onClear={clear}
              />
            );
          })}
        </div>
      ) : null}

      <AddTeam competitionId={competitionId} nextSortOrder={teams.length} />

      <BulkAddTeams competitionId={competitionId} />

      <div>
        <h2 className="text-sm font-semibold text-neutral-700">
          Unassigned lifters{entries.length > 0 ? ` (${unassigned.length})` : ''}
        </h2>
        <UnassignedBody total={entries.length} unassigned={unassigned} />
      </div>
    </div>
  );
}
