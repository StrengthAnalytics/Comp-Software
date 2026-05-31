'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { KitType, Sex } from '@/lib/scoring/ipf-gl';
import { computeTeamStandings, type StandingMemberInput, type StandingTeamInput, type TeamStanding } from '@/lib/scoring/team-standings';
import type { TeamLift } from '@/types/team';
import { useAttemptsSubscription } from '@/lib/realtime/use-attempts-subscription';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import { applyAttemptChange, attemptKey } from '@/lib/realtime/use-board-state';
import type { BoardAttempt } from '@/lib/scorekeeper/board-types';
import { deriveConnectionState, type ConnectionState } from '@/lib/realtime/connection-status';
import type { ChannelStatus } from '@/lib/realtime/use-postgres-changes';
import { useOnline } from '@/lib/use-online';

type EntryRow = Database['public']['Tables']['entries']['Row'];

// A team member as the standings need them, keyed by entry id. lifterName/sex come from the PII-free
// public_lifters view at load time (the entries realtime row can't carry them), so a reconciled change
// preserves the loaded name/sex; bodyweight and the team assignment ride the entry row and update live.
export type StandingMemberSeed = {
  entryId: string;
  teamId: string | null;
  lift: TeamLift | null;
  lifterName: string;
  sex: Sex;
  bodyweightKg: number;
};

export type TeamSeed = { id: string; name: string };

// Pure: fold an entries realtime change into the members-by-entry map. Name/sex aren't on the entry
// row, so they're preserved from the existing seed (or the load-time maps), defaulting like asSex.
export function applyTeamMemberChange(
  members: Map<string, StandingMemberSeed>,
  payload: RealtimePostgresChangesPayload<EntryRow>,
  nameById: Map<string, string>,
  sexById: Map<string, Sex>,
): Map<string, StandingMemberSeed> {
  const next = new Map(members);
  if (payload.eventType === 'DELETE') {
    const removedId = payload.old.id;
    if (removedId) {
      next.delete(removedId);
    }
    return next;
  }
  const row = payload.new;
  const existing = next.get(row.id);
  next.set(row.id, {
    entryId: row.id,
    teamId: row.team_id,
    lift: row.team_lift,
    lifterName: existing?.lifterName ?? nameById.get(row.id) ?? 'Unknown lifter',
    sex: existing?.sex ?? sexById.get(row.id) ?? 'male',
    bodyweightKg: row.bodyweight_kg ?? 0,
  });
  return next;
}

// Live team standings for the public results page: seeds members and their best good lifts from the
// server snapshot, reconciles attempt and entry changes (scoped to the competition) and recomputes the
// ranked table, so a team's score moves as lifts are decided without a refresh. Teams themselves carry
// no realtime channel (the teams table has no logical replication), so a team rename or a brand-new
// team only appears on the next load — both rare mid-meet, and an empty new team scores 0 regardless.
export function useTeamStandings({
  competitionId,
  kitType,
  teams,
  initialMembers,
  initialBestAttempts,
}: {
  competitionId: string;
  kitType: KitType;
  teams: TeamSeed[];
  initialMembers: StandingMemberSeed[];
  initialBestAttempts: BoardAttempt[];
}): { standings: TeamStanding[]; connection: ConnectionState } {
  const [attempts, setAttempts] = useState<Map<string, BoardAttempt>>(
    () => new Map(initialBestAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])),
  );
  const [members, setMembers] = useState<Map<string, StandingMemberSeed>>(
    () => new Map(initialMembers.map((member) => [member.entryId, member])),
  );

  const nameById = useMemo(() => new Map(initialMembers.map((member) => [member.entryId, member.lifterName])), [initialMembers]);
  const sexById = useMemo(() => new Map(initialMembers.map((member) => [member.entryId, member.sex])), [initialMembers]);

  const [statuses, setStatuses] = useState<{ attempts?: ChannelStatus; entries?: ChannelStatus }>({});
  const trackStatus = (channel: 'attempts' | 'entries', status: ChannelStatus) =>
    setStatuses((current) => (current[channel] === status ? current : { ...current, [channel]: status }));
  const online = useOnline();
  const connection = deriveConnectionState(online, [statuses.attempts, statuses.entries]);

  useAttemptsSubscription(competitionId, (payload) => setAttempts((current) => applyAttemptChange(current, payload)), {
    onStatusChange: (status) => trackStatus('attempts', status),
  });
  useEntriesSubscription(
    competitionId,
    (payload) => setMembers((current) => applyTeamMemberChange(current, payload, nameById, sexById)),
    { onStatusChange: (status) => trackStatus('entries', status) },
  );

  // Re-seed from the server when fresh props arrive (e.g. a manual refresh after a realtime gap), so a
  // reload recovers correct state rather than keeping a stale local copy. Props only change on a server
  // re-render, never on a realtime-driven client re-render.
  useEffect(() => {
    setAttempts(new Map(initialBestAttempts.map((attempt) => [attemptKey(attempt.entryId, attempt.lift, attempt.attemptNumber), attempt])));
  }, [initialBestAttempts]);
  useEffect(() => setMembers(new Map(initialMembers.map((member) => [member.entryId, member]))), [initialMembers]);

  const standings = useMemo(() => {
    // Best successful lift per member, keyed by entry + lift, from the live attempts map. An attempt
    // flipped away from good_lift (or reduced) drops out here on the next reconcile.
    const bestByEntryLift = new Map<string, number>();
    for (const attempt of attempts.values()) {
      if (attempt.result !== 'good_lift' || attempt.weightKg === null) {
        continue;
      }
      const key = `${attempt.entryId}|${attempt.lift}`;
      if (attempt.weightKg > (bestByEntryLift.get(key) ?? 0)) {
        bestByEntryLift.set(key, attempt.weightKg);
      }
    }

    const membersByTeam = new Map<string, StandingMemberInput[]>();
    for (const member of members.values()) {
      if (!member.teamId || !member.lift) {
        continue;
      }
      const list = membersByTeam.get(member.teamId) ?? [];
      list.push({
        lift: member.lift,
        lifterName: member.lifterName,
        sex: member.sex,
        bodyweightKg: member.bodyweightKg,
        bestLiftKg: bestByEntryLift.get(`${member.entryId}|${member.lift}`) ?? 0,
      });
      membersByTeam.set(member.teamId, list);
    }

    const standingTeams: StandingTeamInput[] = teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      members: membersByTeam.get(team.id) ?? [],
    }));
    return computeTeamStandings(standingTeams, kitType);
  }, [attempts, members, teams, kitType]);

  return { standings, connection };
}
