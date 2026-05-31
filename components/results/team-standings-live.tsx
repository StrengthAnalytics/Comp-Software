'use client';

import { Fragment } from 'react';
import { LIFT_LABELS } from '@/lib/constants';
import { computeConnectionIndicator } from '@/lib/realtime/connection-status';
import { useTeamStandings, type StandingMemberSeed, type TeamSeed } from '@/lib/realtime/use-team-standings';
import type { BoardAttempt } from '@/lib/scorekeeper/board-types';
import type { KitType } from '@/lib/scoring/ipf-gl';

// Live team standings, recomputed in the browser as attempts and weigh-ins land. The server page seeds
// the teams, their members (names/sex from the PII-free public_lifters view) and the current best good
// lifts; this subscribes (scoped to the competition) and re-ranks on every change.
export function TeamStandingsLive({
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
}) {
  const { standings, connection } = useTeamStandings({ competitionId, kitType, teams, initialMembers, initialBestAttempts });
  const indicator = computeConnectionIndicator(connection);
  const noResultsYet = standings.length > 0 && standings.every((team) => team.total === 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${indicator.box}`}
          role="status"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${indicator.dot} ${indicator.pulse ? 'animate-pulse' : ''}`} />
          {indicator.text}
        </span>
      </div>

      {standings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-base text-neutral-600">
          No teams yet.
        </p>
      ) : (
        <>
          {noResultsYet ? <p className="text-base text-neutral-500">No successful lifts recorded yet.</p> : null}
          {/* Each team is one tight grid with a FIXED first column (rank / lift label) and a 1fr name
              column, so the slack lands in the numbers column instead of being split into the rank
              column — that keeps every card's name column starting at the same x (names line up down
              the page) and the totals right-aligned. Larger type + a narrow page (see results/page)
              makes it read as a compact OBS-overlay scoreboard; ~8 teams fit a 1080-tall source. */}
          <ol className="space-y-1.5">
            {standings.map((team) => (
              <li
                key={team.teamId}
                className="grid grid-cols-[6rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-neutral-200 bg-white px-5 py-2 leading-tight"
              >
                <span className="text-3xl font-bold tabular-nums text-neutral-400">{team.rank}</span>
                <span className="min-w-0 truncate text-3xl font-semibold text-neutral-900">{team.name}</span>
                <span className="text-right text-3xl font-bold tabular-nums text-neutral-900">{team.total.toFixed(2)}</span>
                {team.members.map((member) => (
                  <Fragment key={member.lift}>
                    <span className="text-xl font-medium text-neutral-500">{LIFT_LABELS[member.lift]}</span>
                    <span className="min-w-0 truncate text-xl text-neutral-800">{member.lifterName}</span>
                    <span className="text-right text-xl tabular-nums text-neutral-600">
                      {member.bestLiftKg > 0 ? `${member.bestLiftKg} kg` : '—'} · {member.points.toFixed(2)}
                    </span>
                  </Fragment>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
