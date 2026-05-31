'use client';

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
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          No teams yet.
        </p>
      ) : (
        <>
          {noResultsYet ? <p className="text-sm text-neutral-500">No successful lifts recorded yet.</p> : null}
          <ol className="space-y-3">
            {standings.map((team) => (
              <li key={team.teamId} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="w-8 text-lg font-semibold tabular-nums text-neutral-500">{team.rank}</span>
                    <span className="text-base font-medium text-neutral-900">{team.name}</span>
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-neutral-900">{team.total.toFixed(2)}</span>
                </div>
                <ul className="mt-2 space-y-0.5 pl-11 text-sm text-neutral-600">
                  {team.members.map((member) => (
                    <li key={member.lift} className="flex justify-between gap-4">
                      <span>
                        {LIFT_LABELS[member.lift]}: {member.lifterName}
                      </span>
                      <span className="tabular-nums">
                        {member.bestLiftKg > 0 ? `${member.bestLiftKg} kg` : '—'} · {member.points.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
