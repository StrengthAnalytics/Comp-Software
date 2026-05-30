'use client';

import { Fragment, useMemo } from 'react';
import type { Database } from '@/types/database.types';
import { ATTEMPTS_PER_LIFT, LIFT_LABELS, type Lifts } from '@/lib/constants';
import { bestGoodLift } from '@/lib/attempts/best-lift';
import { ipfGlPoints, type KitType } from '@/lib/scoring/ipf-gl';
import {
  compareRunningOrder,
  orderSessionRoster,
  selectLiveSession,
  selectPlatformPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { attemptKey, useBoardState } from '@/lib/realtime/use-board-state';
import { cellTint, liftHasRack, rackText } from '@/lib/scorekeeper/board-format';
import { BoardOptions, type BoardOptionToggle } from '@/components/scorekeeper/board-options';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import type {
  BoardAttempt,
  BoardEntry,
  BoardFlight,
  BoardSession,
  NamedOption,
} from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// Synthetic platform id for sessions with no platform assigned (mirrors the page's grouping).
const UNASSIGNED_PLATFORM_ID = 'none';

// Attempt numbers 1..3 (CLAUDE.md: three attempts per lift), derived so the literal lives once.
const ATTEMPT_NUMBERS = Array.from({ length: ATTEMPTS_PER_LIFT }, (_, index) => index + 1);

// Gridlines use a border-separate model — right+bottom on every cell, top on the header row, left on
// the frozen first column — so the lines stay attached to the sticky header and frozen lifter column
// when the table scrolls (matching the run screen's scoresheet ruling).
const HEAD =
  'border-b-2 border-r border-t border-neutral-300 bg-neutral-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600';
const CELL = 'border-b border-r border-neutral-300 px-2 py-1 align-middle';
// Zebra band for alternate roster rows, single-sourced so the row and its opaque sticky first column
// can never drift to different shades.
const ROW_BAND = 'bg-neutral-50';
// Options-dropdown trigger styling for the dark header (the shared BoardOptions defaults to a
// light-toolbar trigger).
const DARK_TRIGGER = 'rounded border border-neutral-600 px-2 py-1 text-xs font-medium text-neutral-100 hover:bg-neutral-800';

type WarmUpDisplayProps = {
  competitionId: string;
  compName: string;
  isTeamCompetition: boolean;
  kitType: KitType;
  lifts: Lifts;
  platformId: string;
  platformName: string;
  sessions: BoardSession[];
  flights: BoardFlight[];
  weightClasses: NamedOption[];
  divisions: NamedOption[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// An attempt placed in a session's running order, carrying the lifter/flight it belongs to.
type LiveRow = RunningOrderFields & {
  entryId: string;
  result: AttemptResult;
  flightId: string;
  flightName: string;
  lifterName: string;
};

// One of the three framed lifters (on platform / on deck / in the hole).
type PositionCardData = {
  lifterName: string;
  flightName: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
} | null;

type WarmUpView = {
  sessionName: string | null;
  // The round in progress and how far into it we are, from the lifter on the platform.
  header: { flightName: string; lift: LiftType; round: number; position: number; total: number } | null;
  // The attempt currently on the platform, so its cell can be highlighted in the roster table.
  current: { entryId: string; lift: LiftType; attemptNumber: number } | null;
  positions: { onPlatform: PositionCardData; onDeck: PositionCardData; inTheHole: PositionCardData };
  roster: { entry: BoardEntry; flightName: string }[];
};

// Warm-up room display for one platform: a read-only mirror of the run-screen scoresheet (no result
// buttons, so rows compress) topped by a loading-crew-style header naming the round in progress and
// how many lifters into it we are, plus the on-platform / on-deck / in-the-hole cards so warming-up
// lifters can see who is up next. Read-only live state shared with the run screen via useBoardState —
// it never mutates, only reads to render — so it stays in lock-step with the head table.
export function WarmUpDisplay({
  competitionId,
  compName,
  isTeamCompetition,
  kitType,
  lifts,
  platformId,
  platformName,
  sessions,
  flights: initialFlights,
  weightClasses,
  divisions,
  entries: initialEntries,
  attempts: initialAttempts,
}: WarmUpDisplayProps) {
  const { attempts, entries, flights } = useBoardState({
    competitionId,
    initialAttempts,
    initialEntries,
    initialFlights,
    weightClasses,
    divisions,
  });

  const columnLifts = useMemo(
    () => (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => lifts[lift]),
    [lifts],
  );

  const view = useMemo<WarmUpView>(
    () => buildView({ platformId, sessions, flights, entries, attempts }),
    [platformId, sessions, flights, entries, attempts],
  );

  const headerMain = view.header
    ? `${view.header.flightName} — ${LIFT_LABELS[view.header.lift]}, Round ${view.header.round}`
    : 'No lifter on the platform';
  const headerProgress = view.header ? `${view.header.position} of ${view.header.total} lifters` : '';

  const bestForLift = (entryId: string, lift: LiftType): number =>
    bestGoodLift(
      ATTEMPT_NUMBERS.map((attemptNumber) => attempts.get(attemptKey(entryId, lift, attemptNumber)))
        .filter((attempt): attempt is BoardAttempt => attempt !== undefined)
        .map((attempt) => ({ result: attempt.result, weightKg: attempt.weightKg })),
    );

  const entryTotal = (entry: BoardEntry): number => {
    const contributing = isTeamCompetition && entry.teamLift ? [entry.teamLift] : columnLifts;
    let total = 0;
    for (const lift of contributing) {
      total += bestForLift(entry.id, lift);
    }
    return total;
  };

  // Per-browser column visibility, so each TV can show its own cut of the same comp. The lifter and
  // attempt columns are the point of the screen, so they are always shown; everything else is optional.
  // Lot/BW/class/div/rack/best/total default on (the full view); the sub-total and IPF GL columns are
  // extras, so they default off.
  const [showLot, toggleLot] = usePersistentToggle('warmup:col:lot');
  const [showBw, toggleBw] = usePersistentToggle('warmup:col:bw');
  const [showClass, toggleClass] = usePersistentToggle('warmup:col:class');
  const [showDiv, toggleDiv] = usePersistentToggle('warmup:col:div');
  const [showRack, toggleRack] = usePersistentToggle('warmup:col:rack');
  const [showBest, toggleBest] = usePersistentToggle('warmup:col:best');
  const [showTotal, toggleTotal] = usePersistentToggle('warmup:col:total');
  const [subTotalPref, toggleSubTotal] = usePersistentToggle('warmup:col:subtotal', false);
  const [showGl, toggleGl] = usePersistentToggle('warmup:col:gl', false);
  const [striped, toggleStriping] = usePersistentToggle('warmup:striping');

  // The sub-total (best squat + best bench) only means anything when both lifts are contested, so the
  // option is offered only then and the column is shown after the bench's Best column.
  const canSubTotal = columnLifts.includes('squat') && columnLifts.includes('bench');
  const showSubTotal = canSubTotal && subTotalPref;

  const columnToggles: BoardOptionToggle[] = [
    { id: 'lot', label: 'Lot', checked: showLot, onToggle: toggleLot },
    { id: 'bw', label: 'Bodyweight', checked: showBw, onToggle: toggleBw },
    { id: 'class', label: 'Weight class', checked: showClass, onToggle: toggleClass },
    { id: 'div', label: 'Division', checked: showDiv, onToggle: toggleDiv },
    { id: 'rack', label: 'Rack settings', checked: showRack, onToggle: toggleRack },
    { id: 'best', label: 'Best lift', checked: showBest, onToggle: toggleBest },
    ...(canSubTotal
      ? [{ id: 'subtotal', label: 'Sub-total (S+B)', checked: showSubTotal, onToggle: toggleSubTotal }]
      : []),
    { id: 'total', label: 'Total', checked: showTotal, onToggle: toggleTotal },
    { id: 'gl', label: 'IPF GL points', checked: showGl, onToggle: toggleGl },
    { id: 'striping', label: 'Row striping', checked: striped, onToggle: toggleStriping },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white text-neutral-900">
      <header className="flex shrink-0 items-center justify-between gap-4 bg-neutral-900 px-6 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium uppercase tracking-wide text-neutral-300">
            {platformName} · {compName}
          </p>
          <h1 className="truncate text-3xl font-bold tracking-tight">{headerMain}</h1>
        </div>
        <div className="flex shrink-0 items-start gap-4">
          <div className="text-right">
            {view.sessionName ? (
              <p className="text-sm font-medium uppercase tracking-wide text-neutral-300">{view.sessionName}</p>
            ) : null}
            {headerProgress ? <p className="text-2xl font-semibold tabular-nums">{headerProgress}</p> : null}
          </div>
          <BoardOptions toggles={columnToggles} triggerClassName={DARK_TRIGGER} />
        </div>
      </header>

      <div
        aria-live="polite"
        aria-label="Platform running order"
        className="grid shrink-0 grid-cols-1 gap-3 border-b border-neutral-200 p-4 sm:grid-cols-3"
      >
        <PositionCard label="On platform" card={view.positions.onPlatform} highlight />
        <PositionCard label="On deck" card={view.positions.onDeck} />
        <PositionCard label="In the hole" card={view.positions.inTheHole} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {view.roster.length > 0 ? (
          <table className="w-full min-w-max border-separate border-spacing-0 text-base">
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={`sticky left-0 z-30 min-w-[12rem] border-l text-left ${HEAD}`}>
                  Lifter
                </th>
                {showLot ? (
                  <th scope="col" className={`w-12 text-center ${HEAD}`}>
                    Lot
                  </th>
                ) : null}
                {showBw ? (
                  <th scope="col" className={`w-16 text-center ${HEAD}`}>
                    BW
                  </th>
                ) : null}
                {showClass ? (
                  <th scope="col" className={`w-28 text-left ${HEAD}`}>
                    Class
                  </th>
                ) : null}
                {showDiv ? (
                  <th scope="col" className={`w-24 text-left ${HEAD}`}>
                    Div
                  </th>
                ) : null}
                {columnLifts.map((lift) => (
                  <Fragment key={lift}>
                    <LiftHeader lift={lift} showRack={showRack} showBest={showBest} />
                    {showSubTotal && lift === 'bench' ? (
                      <th scope="col" className={`w-20 text-center ${HEAD}`}>
                        S+B
                      </th>
                    ) : null}
                  </Fragment>
                ))}
                {showTotal ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Total
                  </th>
                ) : null}
                {showGl ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    IPF GL
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {view.roster.map(({ entry, flightName }, index) => {
                // The total (best S+B+D) feeds both the Total column and the IPF GL points.
                const total = showTotal || showGl ? entryTotal(entry) : 0;
                const subTotal = showSubTotal ? bestForLift(entry.id, 'squat') + bestForLift(entry.id, 'bench') : 0;
                // IPF GL from the lifter's current total and weigh-in bodyweight; 0 (a dash) with no good
                // lifts or before weigh-in.
                const gl = showGl
                  ? ipfGlPoints({ sex: entry.sex, kitType, bodyweightKg: entry.bodyweightKg ?? 0, liftedKg: total })
                  : 0;
                // Band alternate rows when striping is on. The transparent cells show the row tint; the
                // sticky first column needs its own opaque background, so it carries the same band
                // (white otherwise, to mask content scrolling beneath it).
                const banded = striped && index % 2 === 1;
                return (
                  <tr key={entry.id} className={banded ? ROW_BAND : ''}>
                    <td
                      className={`sticky left-0 z-10 whitespace-nowrap border-l ${banded ? ROW_BAND : 'bg-white'} ${CELL}`}
                    >
                      <span className="font-semibold text-neutral-900">{entry.lifterName}</span>
                      <span className="ml-2 text-xs text-neutral-400">{flightName}</span>
                    </td>
                    {showLot ? (
                      <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.lotNumber ?? '—'}</td>
                    ) : null}
                    {showBw ? (
                      <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>{entry.bodyweightKg ?? '—'}</td>
                    ) : null}
                    {showClass ? (
                      <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.weightClassName ?? '—'}</td>
                    ) : null}
                    {showDiv ? (
                      <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.divisionName ?? '—'}</td>
                    ) : null}
                    {columnLifts.map((lift) => {
                      const active = isTeamCompetition ? entry.teamLift === lift : true;
                      const best = active ? bestForLift(entry.id, lift) : 0;
                      return (
                        <Fragment key={lift}>
                          <LiftCells
                            lift={lift}
                            entry={entry}
                            active={active}
                            best={best}
                            attempts={attempts}
                            current={view.current}
                            showRack={showRack}
                            showBest={showBest}
                          />
                          {showSubTotal && lift === 'bench' ? (
                            <td className={`text-center font-semibold tabular-nums text-neutral-800 ${CELL}`}>
                              {subTotal > 0 ? subTotal : '—'}
                            </td>
                          ) : null}
                        </Fragment>
                      );
                    })}
                    {showTotal ? (
                      <td className={`text-center font-bold tabular-nums text-neutral-900 ${CELL}`}>
                        {total > 0 ? total : '—'}
                      </td>
                    ) : null}
                    {showGl ? (
                      <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                        {gl > 0 ? gl.toFixed(2) : '—'}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-lg text-neutral-500">No lifters in this session yet.</p>
        )}
      </div>
    </div>
  );
}

// Pure derivation of the live session's roster, the three framed lifters and the round header for the
// selected platform. Mirrors the run screen's per-platform build and the loading display's header, both
// composed from the shared running-order helpers so the three screens never disagree.
function buildView({
  platformId,
  sessions,
  flights,
  entries,
  attempts,
}: {
  platformId: string;
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: Map<string, BoardAttempt>;
}): WarmUpView {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const empty: WarmUpView = {
    sessionName: null,
    header: null,
    current: null,
    positions: { onPlatform: null, onDeck: null, inTheHole: null },
    roster: [],
  };

  // Roster comes from session/flight structure, not attempts, so a flight of weighed-in lifters shows
  // before any attempt is declared.
  const rosterBySession = new Map<string, { entry: BoardEntry; flight: BoardFlight }[]>();
  for (const entry of entries) {
    const flight = entry.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!flight || !session || (session.platformId ?? UNASSIGNED_PLATFORM_ID) !== platformId) {
      continue;
    }
    const list = rosterBySession.get(session.id) ?? [];
    list.push({ entry, flight });
    rosterBySession.set(session.id, list);
  }

  // Only sessions with rostered lifters can be live (mirrors the run screen): an empty earlier session
  // is never "finished" and would otherwise be picked as live, freezing the board on it.
  const platformSessions = sessions
    .filter(
      (session) =>
        (session.platformId ?? UNASSIGNED_PLATFORM_ID) === platformId && (rosterBySession.get(session.id)?.length ?? 0) > 0,
    )
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
  if (platformSessions.length === 0) {
    return empty;
  }
  const platformSessionIds = new Set(platformSessions.map((session) => session.id));

  // Attempt rows joined to their session, for running-order positions and per-session counts.
  const rowsBySession = new Map<string, LiveRow[]>();
  const attemptCountBySession = new Map<string, number>();
  const pendingCountBySession = new Map<string, number>();
  for (const attempt of attempts.values()) {
    const entry = entryById.get(attempt.entryId);
    const flight = entry?.flightId ? flightById.get(entry.flightId) : undefined;
    const session = flight ? sessionById.get(flight.sessionId) : undefined;
    if (!entry || !flight || !session || !platformSessionIds.has(session.id)) {
      continue;
    }
    const list = rowsBySession.get(session.id) ?? [];
    list.push({
      entryId: attempt.entryId,
      lift: attempt.lift,
      attemptNumber: attempt.attemptNumber,
      weightKg: attempt.weightKg,
      lotNumber: entry.lotNumber,
      flightSortOrder: flight.sortOrder,
      flightId: flight.id,
      flightName: flight.name,
      lifterName: entry.lifterName,
      result: attempt.result,
    });
    rowsBySession.set(session.id, list);
    attemptCountBySession.set(session.id, (attemptCountBySession.get(session.id) ?? 0) + 1);
    if (attempt.result === 'pending' && attempt.weightKg !== null) {
      pendingCountBySession.set(session.id, (pendingCountBySession.get(session.id) ?? 0) + 1);
    }
  }

  const liveSession = selectLiveSession(platformSessions, attemptCountBySession, pendingCountBySession);
  if (!liveSession) {
    return empty;
  }
  const liveRows = rowsBySession.get(liveSession.id) ?? [];
  const positions = selectPlatformPositions(liveRows);

  const roster = orderSessionRoster(
    (rosterBySession.get(liveSession.id) ?? []).map((item) => ({
      entryId: item.entry.id,
      flightId: item.flight.id,
      flightSortOrder: item.flight.sortOrder,
      lotNumber: item.entry.lotNumber,
      entry: item.entry,
      flightName: item.flight.name,
    })),
    liveRows,
  ).map(({ entry, flightName }) => ({ entry, flightName }));

  const toCard = (row: LiveRow | null): PositionCardData =>
    row
      ? {
          lifterName: row.lifterName,
          flightName: row.flightName,
          lift: row.lift,
          attemptNumber: row.attemptNumber,
          weightKg: row.weightKg,
        }
      : null;

  // Header from the lifter on the platform: `group` is the declared attempts in this flight/lift/round
  // in running order (lightest first); position = the on-platform lifter's rank within it, total = its
  // size, so the fraction reads monotonically as the round progresses.
  let header: WarmUpView['header'] = null;
  let current: WarmUpView['current'] = null;
  const onPlatform = positions.onPlatform;
  if (onPlatform) {
    const group = liveRows
      .filter(
        (row) =>
          row.flightId === onPlatform.flightId &&
          row.lift === onPlatform.lift &&
          row.attemptNumber === onPlatform.attemptNumber &&
          row.weightKg !== null,
      )
      .toSorted(compareRunningOrder);
    const position = group.findIndex((row) => row.entryId === onPlatform.entryId) + 1;
    header = {
      flightName: onPlatform.flightName,
      lift: onPlatform.lift,
      round: onPlatform.attemptNumber,
      position,
      total: group.length,
    };
    current = { entryId: onPlatform.entryId, lift: onPlatform.lift, attemptNumber: onPlatform.attemptNumber };
  }

  return {
    sessionName: liveSession.name,
    header,
    current,
    positions: {
      onPlatform: toCard(positions.onPlatform),
      onDeck: toCard(positions.onDeck),
      inTheHole: toCard(positions.inTheHole),
    },
    roster,
  };
}

function PositionCard({ label, card, highlight }: { label: string; card: PositionCardData; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? 'rounded-lg border-2 border-neutral-900 bg-amber-50 p-4'
          : 'rounded-lg border border-neutral-300 p-4'
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {card ? (
        <>
          <p className="mt-1 truncate text-2xl font-bold text-neutral-900">{card.lifterName}</p>
          <p className="text-base text-neutral-600">
            {card.weightKg === null ? '' : `${card.weightKg} kg · `}
            {LIFT_LABELS[card.lift]} {card.attemptNumber} · {card.flightName}
          </p>
        </>
      ) : (
        <p className="mt-1 text-base text-neutral-400">—</p>
      )}
    </div>
  );
}

function LiftHeader({ lift, showRack, showBest }: { lift: LiftType; showRack: boolean; showBest: boolean }) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
        <th scope="col" className={`w-24 text-center ${HEAD}`}>
          {LIFT_LABELS[lift]} rack
        </th>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => (
        <th key={`${lift}-${attemptNumber}`} scope="col" className={`w-16 text-center ${HEAD}`}>
          {attemptNumber === 1 ? `${LIFT_LABELS[lift]} ${attemptNumber}` : String(attemptNumber)}
        </th>
      ))}
      {showBest ? (
        <th scope="col" className={`w-16 text-center ${HEAD}`}>
          Best
        </th>
      ) : null}
    </>
  );
}

// One lift's read-only cells for a lifter: the rack column (squat/bench), each attempt's declared
// weight tinted by result, and the best successful lift. Inactive (a team member's non-assigned lift)
// dashes out.
function LiftCells({
  lift,
  entry,
  active,
  best,
  attempts,
  current,
  showRack,
  showBest,
}: {
  lift: LiftType;
  entry: BoardEntry;
  active: boolean;
  best: number;
  attempts: Map<string, BoardAttempt>;
  current: WarmUpView['current'];
  showRack: boolean;
  showBest: boolean;
}) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
        <td className={`whitespace-nowrap text-center text-xs text-neutral-500 ${CELL}`}>
          {active ? rackText(entry, lift) : <span className="text-neutral-300">—</span>}
        </td>
      ) : null}
      {ATTEMPT_NUMBERS.map((attemptNumber) => {
        const attempt = attempts.get(attemptKey(entry.id, lift, attemptNumber));
        const isCurrent =
          current?.entryId === entry.id && current.lift === lift && current.attemptNumber === attemptNumber;
        // Null unless this is an active lift with a declared weight; rendered as an em dash otherwise.
        const declaredWeight = active && attempt ? attempt.weightKg : null;
        return (
          <td
            key={`${entry.id}-${lift}-${attemptNumber}`}
            className={`text-center tabular-nums ${CELL} ${active ? cellTint(attempt, isCurrent) : ''}`}
          >
            {declaredWeight === null ? <span className="text-neutral-300">—</span> : declaredWeight}
          </td>
        );
      })}
      {showBest ? (
        <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>{active && best > 0 ? best : '—'}</td>
      ) : null}
    </>
  );
}
