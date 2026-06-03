'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Database } from '@/types/database.types';
import { ATTEMPTS_PER_LIFT, LIFT_LABELS, type Lifts } from '@/lib/constants';
import type { KitType } from '@/lib/scoring/ipf-gl';
import { compareRunningOrder, selectUpcomingLifters } from '@/lib/attempts/running-order';
import { orderRosterForSession } from '@/lib/scorekeeper/order-roster';
import { buildPlatformLiveView, type PlatformLiveRow } from '@/lib/scorekeeper/platform-live-view';
import { computeLiftsToNextFlight } from '@/lib/scorekeeper/flight-count';
import { bestLiftFor, computeEntryScore, computePredictedScore, type PredictedScore } from '@/lib/scorekeeper/entry-score';
import { computePlacings, type PlaceableEntry } from '@/lib/scorekeeper/placings';
import { computeBoardTeamStandings } from '@/lib/scorekeeper/team-board-standings';
import type { TeamStanding } from '@/lib/scoring/team-standings';
import { attemptKey, useBoardState } from '@/lib/realtime/use-board-state';
import { cellTint, liftHasRack, rackText } from '@/lib/scorekeeper/board-format';
import type { BoardOptionToggle } from '@/components/scorekeeper/board-options';
import { DisplayOptionsDrawer } from '@/components/warm-up/display-options-drawer';
import { UpNextDetail } from '@/components/warm-up/up-next-detail';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { usePersistentString } from '@/lib/use-persistent-string';
import type {
  BoardAttempt,
  BoardEntry,
  BoardFlight,
  BoardSession,
  NamedOption,
} from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];

// Attempt numbers 1..3 (CLAUDE.md: three attempts per lift), derived so the literal lives once.
const ATTEMPT_NUMBERS = Array.from({ length: ATTEMPTS_PER_LIFT }, (_, index) => index + 1);

// Gridlines use a border-separate model — right+bottom on every cell, top on the header row, left on
// the frozen first column — so the lines stay attached to the sticky header and frozen lifter column
// when the table scrolls (matching the run screen's scoresheet ruling). The opaque background plus a
// soft bottom shadow make the pinned header read as a solid static bar that roster rows scroll cleanly
// under, rather than appearing to slide behind it.
const HEAD =
  'border-b-2 border-r border-t border-neutral-300 bg-neutral-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 shadow-[0_3px_4px_rgba(0,0,0,0.1)]';
const CELL = 'border-b border-r border-neutral-300 px-2 py-1 align-middle';
// Zebra band for alternate roster rows, single-sourced so the row and its opaque sticky first column
// can never drift to different shades.
const ROW_BAND = 'bg-neutral-50';
// Options-dropdown trigger styling for the dark header (the shared BoardOptions defaults to a
// light-toolbar trigger).
const DARK_TRIGGER = 'rounded border border-neutral-600 px-2 py-1 text-xs font-medium text-neutral-100 hover:bg-neutral-800';
// Table-zoom steps in 5% increments from 50% to 250%; each maps to a .warmup-zoom-* class in
// globals.css that scales the scoresheet table. Keep the range in sync with those classes.
const ZOOM_MIN = 50;
const ZOOM_MAX = 250;
const ZOOM_STEP = 5;
const ZOOM_LEVELS: number[] = Array.from(
  { length: (ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP + 1 },
  (_, index) => ZOOM_MIN + index * ZOOM_STEP,
);

// How many upcoming lifters the up-next card strip can show, selectable per browser. The labels name
// the first three (the standard powerlifting calls); positions beyond that are ordinal. The grid class
// per count is a static string so Tailwind generates it (a computed `grid-cols-N` would be purged).
const UP_NEXT_OPTIONS = [1, 3, 5];
const MAX_UP_NEXT = 5;
const UP_NEXT_LABELS = ['On platform', 'On deck', 'In the hole', '4th up', '5th up'];
const UP_NEXT_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  3: 'grid-cols-1 sm:grid-cols-3',
  5: 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-5',
};

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
  teams: NamedOption[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// One of the framed up-next lifters. Carries the entry so the optional plate/rack detail can render the
// lifter's rack settings.
type PositionCardData = {
  lifterName: string;
  flightName: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  entry: BoardEntry;
} | null;

// Projects a live running-order row (or null) into the up-next card shape.
function toCard(row: PlatformLiveRow | null): PositionCardData {
  return row
    ? {
        lifterName: row.entry.lifterName,
        flightName: row.flight.name,
        lift: row.lift,
        attemptNumber: row.attemptNumber,
        weightKg: row.weightKg,
        entry: row.entry,
      }
    : null;
}

type WarmUpView = {
  sessionName: string | null;
  // The round in progress and how far into it we are, from the lifter on the platform.
  header: { flightName: string; lift: LiftType; round: number; position: number; total: number } | null;
  // The attempt currently on the platform, so its cell can be highlighted in the roster table.
  current: { entryId: string; lift: LiftType; attemptNumber: number } | null;
  // The upcoming lifters in running order (up to MAX_UP_NEXT); the board shows the chosen first 1/3/5.
  upNext: PositionCardData[];
  // Lifts remaining in the current flight for the on-platform lift, and the next flight to contest it —
  // for the optional "lifts to next flight" count card. Null when no lifter is on the platform.
  flightCount: { count: number; nextFlightName: string | null; lift: LiftType } | null;
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
  teams,
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
    teams,
  });

  const columnLifts = useMemo(
    () => (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => lifts[lift]),
    [lifts],
  );

  const view = useMemo<WarmUpView>(
    () => buildView({ platformId, sessions, flights, entries, attempts, isTeamCompetition }),
    [platformId, sessions, flights, entries, attempts, isTeamCompetition],
  );

  const headerMain = view.header
    ? `${view.header.flightName} — ${LIFT_LABELS[view.header.lift]}, Round ${view.header.round}`
    : 'No lifter on the platform';
  const headerProgress = view.header ? `${view.header.position} of ${view.header.total} lifters` : '';

  // Per-lift best and the entry's total/GL both go through the shared entry-score helpers, so the
  // warm-up board stays in step with the run screen and overlay on every lifter's numbers.
  const bestForLift = (entryId: string, lift: LiftType): number => bestLiftFor(attempts, entryId, lift);

  // Per-browser column visibility, so each TV can show its own cut of the same comp. Only the lifter
  // name column is always shown; every other column — including each lift's attempt weights, toggled
  // per lift — is optional. Lot/BW/class/div/rack/attempts/best/total default on (the full view); the
  // sub-total and IPF GL columns are extras, so they default off.
  const [teamPref, toggleTeam] = usePersistentToggle('warmup:col:team');
  // Flight has its own column now (no longer appended to the lifter name); on by default so the flight
  // stays visible as before. Platform is uniform on a per-platform board, so it defaults off.
  const [showFlight, toggleFlight] = usePersistentToggle('warmup:col:flight');
  const [showPlatform, togglePlatform] = usePersistentToggle('warmup:col:platform', false);
  const [showLot, toggleLot] = usePersistentToggle('warmup:col:lot');
  const [showBw, toggleBw] = usePersistentToggle('warmup:col:bw');
  const [showClass, toggleClass] = usePersistentToggle('warmup:col:class');
  const [showDiv, toggleDiv] = usePersistentToggle('warmup:col:div');
  const [showRack, toggleRack] = usePersistentToggle('warmup:col:rack');
  // Attempt columns toggle per lift, so a board can show only the lift currently being warmed up.
  const [showSquatAttempts, toggleSquatAttempts] = usePersistentToggle('warmup:col:attempts:squat');
  const [showBenchAttempts, toggleBenchAttempts] = usePersistentToggle('warmup:col:attempts:bench');
  const [showDeadliftAttempts, toggleDeadliftAttempts] = usePersistentToggle('warmup:col:attempts:deadlift');
  const [showBest, toggleBest] = usePersistentToggle('warmup:col:best');
  const [showTotal, toggleTotal] = usePersistentToggle('warmup:col:total');
  const [subTotalPref, toggleSubTotal] = usePersistentToggle('warmup:col:subtotal', false);
  const [showGl, toggleGl] = usePersistentToggle('warmup:col:gl', false);
  // Standings columns — current/predicted place and the predicted total/GL (individual comps), or the
  // team's actual/predicted points (team comps). All extras, so they default off.
  const [curPlacePref, toggleCurPlace] = usePersistentToggle('warmup:col:curplace', false);
  const [predPlacePref, togglePredPlace] = usePersistentToggle('warmup:col:predplace', false);
  const [predTotalPref, togglePredTotal] = usePersistentToggle('warmup:col:predtotal', false);
  const [predGlPref, togglePredGl] = usePersistentToggle('warmup:col:predgl', false);
  const [teamActualPref, toggleTeamActual] = usePersistentToggle('warmup:col:teamactual', false);
  const [teamPredPref, toggleTeamPred] = usePersistentToggle('warmup:col:teampred', false);
  const [striped, toggleStriping] = usePersistentToggle('warmup:striping');

  // Table zoom (percent), persisted per browser. Scales only the scoresheet table (via a .warmup-zoom-*
  // class) so an operator who has hidden columns can enlarge what remains. A stored value not in the
  // step list falls back to 100%.
  const [zoomPref, setZoomPref] = usePersistentString('warmup:zoom', '100');
  const zoomLevel = ZOOM_LEVELS.includes(Number(zoomPref)) ? Number(zoomPref) : 100;
  const zoomIndex = ZOOM_LEVELS.indexOf(zoomLevel);
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;
  const setZoom = (index: number) => setZoomPref(String(ZOOM_LEVELS[index]));
  const zoomClass = `warmup-zoom-${zoomLevel}`;

  // Master toggle for the whole up-next card strip (default on); when off the table gets the space.
  const [showCardsPref, toggleShowCards] = usePersistentToggle('warmup:upnext:show');

  // "Lifts to next flight" mode (default off): the strip becomes a fixed three cards — on platform, on
  // deck, and a count of lifts until the next flight starts this lift — overriding the 1/3/5 choice.
  const [flightCountPref, toggleFlightCount] = usePersistentToggle('warmup:upnext:flightcount', false);
  const countMode = flightCountPref;

  // How many upcoming lifters the up-next strip shows (1, 3 or 5), persisted per browser. A stored
  // value outside the option list falls back to 3. Always render `upNextCount` cards, padding with
  // nulls so the strip keeps its shape before any lifter is up. Ignored while countMode is on.
  const [upNextPref, setUpNextPref] = usePersistentString('warmup:upnext', '3');
  const upNextCount = UP_NEXT_OPTIONS.includes(Number(upNextPref)) ? Number(upNextPref) : 3;
  const upNextCards = Array.from({ length: upNextCount }, (_, index) => view.upNext[index] ?? null);

  // Optional plate-loading + rack-height detail on the up-next cards (a smaller echo of the loading
  // display). Only offered for 1 or 3 lifter cards — not at 5 (cards too narrow) and not in countMode
  // (which has its own third card) — so the board never shows it when it doesn't apply.
  const [detailPref, toggleDetail] = usePersistentToggle('warmup:upnext:detail', false);
  const upNextDetailAvailable = !countMode && upNextCount !== MAX_UP_NEXT;
  const showUpNextDetail = detailPref && upNextDetailAvailable;

  // The strip is three cards in countMode, otherwise the chosen lifter count.
  const stripGridClass = UP_NEXT_GRID[countMode ? 3 : upNextCount];

  // All view controls (up-next count, zoom, columns) live in a right-side slide-out drawer, so the
  // header stays a clean status bar with a single trigger rather than a crowded row of controls.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The sub-total (best squat + best bench) only means anything when both lifts are contested by the
  // same lifter, so the option is offered only then and the column is shown after the bench's Best
  // column. Excluded for team comps, where each member contests a single assigned lift — a squat-only
  // member has no bench to combine, so an "S+B" column would just relabel their one lift.
  const canSubTotal =
    !isTeamCompetition && columnLifts.includes('squat') && columnLifts.includes('bench');
  const showSubTotal = canSubTotal && subTotalPref;

  // The team column only applies to team comps (the lifter's team sits right after their name); the
  // toggle is offered only then and defaults on.
  const showTeam = isTeamCompetition && teamPref;

  // Place columns apply to both comp types — but in a team comp the place is the lifter's team's
  // place, not an individual one. The predicted total/GL columns are individual-only; the team-points
  // columns are team-only. Each is gated on its toggle so the comp-wide work below only runs when
  // something needs it.
  const showCurPlace = curPlacePref;
  const showPredPlace = predPlacePref;
  const showPredTotal = !isTeamCompetition && predTotalPref;
  const showPredGl = !isTeamCompetition && predGlPref;
  const showTeamActual = isTeamCompetition && teamActualPref;
  const showTeamPred = isTeamCompetition && teamPredPref;

  // Each individual lifter's running total and projected score, computed comp-wide (the board only
  // shows one platform, but places rank the whole field). Reused by the predicted columns; empty for a
  // team comp or unless one of those columns is on.
  const individualScores = useMemo(() => {
    const map = new Map<string, { currentTotal: number; predicted: PredictedScore }>();
    if (isTeamCompetition || (!showCurPlace && !showPredPlace && !showPredTotal && !showPredGl)) {
      return map;
    }
    for (const entry of entries) {
      map.set(entry.id, {
        currentTotal: computeEntryScore(attempts, entry, columnLifts, kitType, false).total,
        predicted: computePredictedScore(attempts, entry, columnLifts, kitType, false),
      });
    }
    return map;
  }, [entries, attempts, columnLifts, kitType, isTeamCompetition, showCurPlace, showPredPlace, showPredTotal, showPredGl]);

  // Individual current/predicted place per entry, within (weight class × division × sex). Empty for a
  // team comp (which ranks teams, not lifters) or unless a place column is on.
  const placings = useMemo(() => {
    if (isTeamCompetition || (!showCurPlace && !showPredPlace)) {
      return { currentPlaceById: new Map<string, number>(), predictedPlaceById: new Map<string, number>() };
    }
    const placeable: PlaceableEntry[] = entries.map((entry) => {
      const score = individualScores.get(entry.id);
      return {
        id: entry.id,
        weightClassId: entry.weightClassId,
        divisionId: entry.divisionId,
        sex: entry.sex,
        bodyweightKg: entry.bodyweightKg,
        lotNumber: entry.lotNumber,
        currentTotal: score?.currentTotal ?? 0,
        predictedTotal: score?.predicted.predictedTotal ?? 0,
      };
    });
    return computePlacings(placeable);
  }, [entries, individualScores, isTeamCompetition, showCurPlace, showPredPlace]);

  // Full team standings (actual + predicted points and ranks) keyed by team id, via the shared scorer
  // the public results page uses. Empty for an individual comp or unless a team column is on.
  const teamStandings = useMemo(() => {
    if (!isTeamCompetition || (!showCurPlace && !showPredPlace && !showTeamActual && !showTeamPred)) {
      return new Map<string, TeamStanding>();
    }
    return computeBoardTeamStandings(attempts, entries, kitType);
  }, [attempts, entries, kitType, isTeamCompetition, showCurPlace, showPredPlace, showTeamActual, showTeamPred]);

  // The three per-lift attempt toggles are declared unconditionally above (hooks can't be conditional),
  // but a toggle is offered only for a contested lift (columnLifts), so a bench-only comp shows just
  // "Bench attempts". Keyed by lift so the lift cells/header can look up their own visibility.
  const attemptsByLift: Record<LiftType, boolean> = {
    squat: showSquatAttempts,
    bench: showBenchAttempts,
    deadlift: showDeadliftAttempts,
  };
  const attemptsToggleByLift: Record<LiftType, () => void> = {
    squat: toggleSquatAttempts,
    bench: toggleBenchAttempts,
    deadlift: toggleDeadliftAttempts,
  };
  const liftAttemptToggles: BoardOptionToggle[] = columnLifts.map((lift) => ({
    id: `attempts-${lift}`,
    label: `${LIFT_LABELS[lift]} attempts`,
    checked: attemptsByLift[lift],
    onToggle: attemptsToggleByLift[lift],
  }));

  const columnToggles: BoardOptionToggle[] = [
    ...(isTeamCompetition ? [{ id: 'team', label: 'Team', checked: showTeam, onToggle: toggleTeam }] : []),
    { id: 'flight', label: 'Flight', checked: showFlight, onToggle: toggleFlight },
    { id: 'platform', label: 'Platform', checked: showPlatform, onToggle: togglePlatform },
    { id: 'lot', label: 'Lot', checked: showLot, onToggle: toggleLot },
    { id: 'bw', label: 'Bodyweight', checked: showBw, onToggle: toggleBw },
    { id: 'class', label: 'Weight class', checked: showClass, onToggle: toggleClass },
    { id: 'div', label: 'Division', checked: showDiv, onToggle: toggleDiv },
    { id: 'rack', label: 'Rack settings', checked: showRack, onToggle: toggleRack },
    ...liftAttemptToggles,
    { id: 'best', label: 'Best lift', checked: showBest, onToggle: toggleBest },
    ...(canSubTotal
      ? [{ id: 'subtotal', label: 'Sub-total (S+B)', checked: showSubTotal, onToggle: toggleSubTotal }]
      : []),
    { id: 'total', label: 'Total', checked: showTotal, onToggle: toggleTotal },
    { id: 'gl', label: 'IPF GL points', checked: showGl, onToggle: toggleGl },
    // Place columns show in both comp types (team place in a team comp); the points/total columns are
    // comp-specific.
    { id: 'curplace', label: 'Current place', checked: showCurPlace, onToggle: toggleCurPlace },
    { id: 'predplace', label: 'Predicted place', checked: showPredPlace, onToggle: togglePredPlace },
    ...(isTeamCompetition
      ? [
          { id: 'teamactual', label: 'Team points', checked: showTeamActual, onToggle: toggleTeamActual },
          { id: 'teampred', label: 'Predicted team points', checked: showTeamPred, onToggle: toggleTeamPred },
        ]
      : [
          { id: 'predtotal', label: 'Predicted total', checked: showPredTotal, onToggle: togglePredTotal },
          { id: 'predgl', label: 'Predicted GL points', checked: showPredGl, onToggle: togglePredGl },
        ]),
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
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={DARK_TRIGGER}
          >
            Display options
          </button>
        </div>
      </header>

      {showCardsPref ? (
        <div
          aria-live="polite"
          aria-label="Platform running order"
          className={`grid shrink-0 gap-3 border-b border-neutral-200 p-4 ${stripGridClass}`}
        >
          {countMode ? (
            <>
              <PositionCard label={UP_NEXT_LABELS[0]} card={view.upNext[0] ?? null} highlight />
              <PositionCard label={UP_NEXT_LABELS[1]} card={view.upNext[1] ?? null} />
              <FlightCountCard data={view.flightCount} />
            </>
          ) : (
            upNextCards.map((card, index) => (
              <PositionCard
                key={UP_NEXT_LABELS[index]}
                label={UP_NEXT_LABELS[index]}
                card={card}
                highlight={index === 0}
                showDetail={showUpNextDetail}
              />
            ))
          )}
        </div>
      ) : null}

      {/* No top padding on the scroll area: the sticky column header pins flush to the top of the
          scroll region so rows disappear straight under it (top padding would leave a strip where
          scrolled rows stay visible above the header). The not-scrolled breathing room is a table
          margin instead, which scrolls away cleanly under the pinned header. */}
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {view.roster.length > 0 ? (
          <table className={`mt-4 w-full min-w-max border-separate border-spacing-0 text-base ${zoomClass}`}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th scope="col" className={`sticky left-0 z-30 min-w-[12rem] border-l text-left ${HEAD}`}>
                  Lifter
                </th>
                {showTeam ? (
                  <th scope="col" className={`w-32 text-left ${HEAD}`}>
                    Team
                  </th>
                ) : null}
                {showFlight ? (
                  <th scope="col" className={`w-24 text-left ${HEAD}`}>
                    Flight
                  </th>
                ) : null}
                {showPlatform ? (
                  <th scope="col" className={`w-28 text-left ${HEAD}`}>
                    Platform
                  </th>
                ) : null}
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
                    <LiftHeader lift={lift} showRack={showRack} showAttempts={attemptsByLift[lift]} showBest={showBest} />
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
                {showCurPlace ? (
                  <th scope="col" className={`w-16 text-center ${HEAD}`}>
                    Place
                  </th>
                ) : null}
                {showPredPlace ? (
                  <th scope="col" className={`w-16 text-center ${HEAD}`}>
                    Pred place
                  </th>
                ) : null}
                {showPredTotal ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Pred total
                  </th>
                ) : null}
                {showPredGl ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Pred GL
                  </th>
                ) : null}
                {showTeamActual ? (
                  <th scope="col" className={`w-20 text-center ${HEAD}`}>
                    Team pts
                  </th>
                ) : null}
                {showTeamPred ? (
                  <th scope="col" className={`w-24 text-center ${HEAD}`}>
                    Pred team pts
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {view.roster.map(({ entry, flightName }, index) => {
                // Total (best S+B+D) and IPF GL come together from the shared entry-score helper; they
                // feed the Total and IPF GL columns (computed only when one of them is shown).
                const { total, glPoints: gl } =
                  showTotal || showGl
                    ? computeEntryScore(attempts, entry, columnLifts, kitType, isTeamCompetition)
                    : { total: 0, glPoints: 0 };
                const subTotal = showSubTotal ? bestForLift(entry.id, 'squat') + bestForLift(entry.id, 'bench') : 0;
                // Standings lookups; the maps are empty (so these are undefined → a dash) unless the
                // matching column is on. In a team comp the place is the lifter's team's place (ranked
                // against the other teams), not an individual one.
                const predicted = individualScores.get(entry.id)?.predicted;
                const teamStanding = entry.teamId ? teamStandings.get(entry.teamId) : undefined;
                const currentPlace = isTeamCompetition
                  ? (teamStanding && teamStanding.total > 0 ? teamStanding.rank : undefined)
                  : placings.currentPlaceById.get(entry.id);
                const predictedPlace = isTeamCompetition
                  ? (teamStanding && teamStanding.predictedTotal > 0 ? teamStanding.predictedRank : undefined)
                  : placings.predictedPlaceById.get(entry.id);
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
                    </td>
                    {showTeam ? (
                      <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{entry.teamName ?? '—'}</td>
                    ) : null}
                    {showFlight ? (
                      <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{flightName}</td>
                    ) : null}
                    {showPlatform ? (
                      <td className={`whitespace-nowrap text-neutral-600 ${CELL}`}>{platformName}</td>
                    ) : null}
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
                            showAttempts={attemptsByLift[lift]}
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
                    {showCurPlace ? (
                      <td className={`text-center font-bold tabular-nums text-neutral-900 ${CELL}`}>
                        {currentPlace ?? '—'}
                      </td>
                    ) : null}
                    {showPredPlace ? (
                      <td className={`text-center tabular-nums text-neutral-600 ${CELL}`}>
                        {predictedPlace ?? '—'}
                      </td>
                    ) : null}
                    {showPredTotal ? (
                      <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                        {predicted && predicted.predictedTotal > 0 ? predicted.predictedTotal : '—'}
                      </td>
                    ) : null}
                    {showPredGl ? (
                      <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                        {predicted && predicted.predictedGlPoints > 0 ? predicted.predictedGlPoints.toFixed(2) : '—'}
                      </td>
                    ) : null}
                    {showTeamActual ? (
                      <td className={`text-center font-bold tabular-nums text-neutral-900 ${CELL}`}>
                        {teamStanding && teamStanding.total > 0 ? teamStanding.total.toFixed(2) : '—'}
                      </td>
                    ) : null}
                    {showTeamPred ? (
                      <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>
                        {teamStanding && teamStanding.predictedTotal > 0 ? teamStanding.predictedTotal.toFixed(2) : '—'}
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

      <DisplayOptionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        showCards={{ checked: showCardsPref, onToggle: toggleShowCards }}
        flightCount={{ checked: flightCountPref, onToggle: toggleFlightCount }}
        upNextOptions={UP_NEXT_OPTIONS}
        upNextCount={upNextCount}
        onUpNextChange={(count) => setUpNextPref(String(count))}
        upNextDetail={upNextDetailAvailable ? { checked: detailPref, onToggle: toggleDetail } : null}
        zoom={{
          level: zoomLevel,
          canZoomIn,
          canZoomOut,
          onZoomIn: () => setZoom(zoomIndex + 1),
          onZoomOut: () => setZoom(zoomIndex - 1),
        }}
        columnToggles={columnToggles}
      />
    </div>
  );
}

// Pure derivation of the live session's roster, the three framed lifters and the round header for the
// selected platform. The live-session/positions core is shared with the lifter overlay via
// buildPlatformLiveView (so the two never disagree on who is on the platform); this adds the warm-up
// board's roster ordering, up-next cards and round header on top.
function buildView({
  platformId,
  sessions,
  flights,
  entries,
  attempts,
  isTeamCompetition,
}: {
  platformId: string;
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: Map<string, BoardAttempt>;
  isTeamCompetition: boolean;
}): WarmUpView {
  const empty: WarmUpView = {
    sessionName: null,
    header: null,
    current: null,
    upNext: [],
    flightCount: null,
    roster: [],
  };

  const { liveSession, rosterItems, liveRows } = buildPlatformLiveView({
    platformId,
    sessions,
    flights,
    entries,
    attempts: attempts.values(),
  });
  if (!liveSession) {
    return empty;
  }

  // A team comp groups by lift across the whole session (each member contests one assigned lift)
  // instead of by the flight's single current lift; otherwise order by the round in progress.
  const roster = orderRosterForSession(rosterItems, liveRows, isTeamCompetition);

  // The upcoming lifters in running order (up to the max the strip can show); the first is on the
  // platform. Sliced to the chosen count in the component.
  const upcomingRows = selectUpcomingLifters(liveRows, MAX_UP_NEXT);

  // Header from the lifter on the platform: `group` is the declared attempts in this flight/lift/round
  // in running order (lightest first); position = the on-platform lifter's rank within it, total = its
  // size, so the fraction reads monotonically as the round progresses.
  let header: WarmUpView['header'] = null;
  let current: WarmUpView['current'] = null;
  const onPlatform = upcomingRows[0] ?? null;
  if (onPlatform) {
    const group = liveRows
      .filter(
        (row) =>
          row.flight.id === onPlatform.flight.id &&
          row.lift === onPlatform.lift &&
          row.attemptNumber === onPlatform.attemptNumber &&
          row.weightKg !== null,
      )
      .toSorted(compareRunningOrder);
    const position = group.findIndex((row) => row.entryId === onPlatform.entryId) + 1;
    header = {
      flightName: onPlatform.flight.name,
      lift: onPlatform.lift,
      round: onPlatform.attemptNumber,
      position,
      total: group.length,
    };
    current = { entryId: onPlatform.entryId, lift: onPlatform.lift, attemptNumber: onPlatform.attemptNumber };
  }

  // Lifts-to-next-flight count for the on-platform lift. Counts every to-come attempt of that lift in
  // the current flight (a team member only contests their assigned lift, so a team comp filters to it),
  // and names the next flight that contests it. Per-round result is read from the attempts map (a
  // missing round is a future attempt, still to come).
  let flightCount: WarmUpView['flightCount'] = null;
  if (onPlatform) {
    const lift = onPlatform.lift;
    const contesting = rosterItems.filter(({ entry }) => !isTeamCompetition || entry.teamLift === lift);
    const lifters = contesting.map(({ entry, flight }) => ({
      flightId: flight.id,
      results: ATTEMPT_NUMBERS.map((attemptNumber) => attempts.get(attemptKey(entry.id, lift, attemptNumber))?.result ?? null),
    }));
    const flightById = new Map(contesting.map(({ flight }) => [flight.id, flight]));
    const flightList = [...flightById.values()].map((flight) => ({
      id: flight.id,
      name: flight.name,
      sortOrder: flight.sortOrder,
    }));
    const { count, nextFlightName } = computeLiftsToNextFlight({
      currentFlightId: onPlatform.flight.id,
      flights: flightList,
      lifters,
    });
    flightCount = { count, nextFlightName, lift };
  }

  return {
    sessionName: liveSession.name,
    header,
    current,
    upNext: upcomingRows.map((row) => toCard(row)),
    flightCount,
    roster,
  };
}

// The optional third card in "lifts to next flight" mode: a big count of lifts remaining in the current
// flight for the on-platform lift, with the next flight it leads into (or "end of flight" for the last
// one). The count includes the lift on the platform now, so it ticks down as each is judged.
function FlightCountCard({
  data,
}: {
  data: { count: number; nextFlightName: string | null; lift: LiftType } | null;
}) {
  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {/* Flight names already include the word "Flight" (e.g. "Flight B"), as the header shows, so
            the name is used as-is rather than prefixed — no "Until Flight Flight B". */}
        {data?.nextFlightName ? `Until ${data.nextFlightName}` : 'Until end of flight'}
      </p>
      {data ? (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums text-neutral-900">{data.count}</span>
          <span className="text-base text-neutral-600">
            {data.count === 1 ? 'lift' : 'lifts'} of {LIFT_LABELS[data.lift]} left
          </span>
        </div>
      ) : (
        <p className="mt-1 text-base text-neutral-400">—</p>
      )}
    </div>
  );
}

function PositionCard({
  label,
  card,
  highlight,
  showDetail,
}: {
  label: string;
  card: PositionCardData;
  highlight?: boolean;
  showDetail?: boolean;
}) {
  return (
    <div
      className={`@container ${
        highlight
          ? 'rounded-lg border-2 border-neutral-900 bg-amber-50 p-4'
          : 'rounded-lg border border-neutral-300 p-4'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {card ? (
        // Identity on the left, the optional plate/rack detail on the right; they stack vertically on a
        // narrow card and sit side by side once the card is wide enough. A container query (not a screen
        // breakpoint) drives this, so it responds to the card's own width — full width at 1-up, a third
        // at 3-up — rather than the viewport.
        <div className="mt-1 flex flex-col gap-2 @sm:flex-row @sm:items-start @sm:gap-4">
          <div className="min-w-0 @sm:flex-1">
            <p className="truncate text-2xl font-bold text-neutral-900">{card.lifterName}</p>
            <p className="text-base text-neutral-600">
              {card.weightKg === null ? '' : `${card.weightKg} kg · `}
              {LIFT_LABELS[card.lift]} {card.attemptNumber} · {card.flightName}
            </p>
          </div>
          {showDetail ? <UpNextDetail entry={card.entry} lift={card.lift} weightKg={card.weightKg} /> : null}
        </div>
      ) : (
        <p className="mt-1 text-base text-neutral-400">—</p>
      )}
    </div>
  );
}

function LiftHeader({
  lift,
  showRack,
  showAttempts,
  showBest,
}: {
  lift: LiftType;
  showRack: boolean;
  showAttempts: boolean;
  showBest: boolean;
}) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
        <th scope="col" className={`w-24 text-center ${HEAD}`}>
          {LIFT_LABELS[lift]} rack
        </th>
      ) : null}
      {showAttempts
        ? ATTEMPT_NUMBERS.map((attemptNumber) => (
            <th key={`${lift}-${attemptNumber}`} scope="col" className={`w-16 text-center ${HEAD}`}>
              {attemptNumber === 1 ? `${LIFT_LABELS[lift]} ${attemptNumber}` : String(attemptNumber)}
            </th>
          ))
        : null}
      {showBest ? (
        <th scope="col" className={`w-16 text-center ${HEAD}`}>
          {/* Without the attempt columns the plain "Best" header can't be told apart from the other
              lifts' Best columns, so name the lift when attempts are hidden. */}
          {showAttempts ? 'Best' : `${LIFT_LABELS[lift]} best`}
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
  showAttempts,
  showBest,
}: {
  lift: LiftType;
  entry: BoardEntry;
  active: boolean;
  best: number;
  attempts: Map<string, BoardAttempt>;
  current: WarmUpView['current'];
  showRack: boolean;
  showAttempts: boolean;
  showBest: boolean;
}) {
  return (
    <>
      {showRack && liftHasRack(lift) ? (
        <td className={`whitespace-nowrap text-center text-xs text-neutral-500 ${CELL}`}>
          {active ? rackText(entry, lift) : <span className="text-neutral-300">—</span>}
        </td>
      ) : null}
      {showAttempts
        ? ATTEMPT_NUMBERS.map((attemptNumber) => {
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
          })
        : null}
      {showBest ? (
        <td className={`text-center tabular-nums text-neutral-700 ${CELL}`}>{active && best > 0 ? best : '—'}</td>
      ) : null}
    </>
  );
}
