'use client';

import { useMemo } from 'react';
import type { Database } from '@/types/database.types';
import {
  BENCH_SPOTTING_LABELS,
  KG_TO_LBS,
  LIFT_LABELS,
  SQUAT_RACK_SETTING_LABELS,
  type IpfPlateWeight,
} from '@/lib/constants';
import { expandPlatesToBars, formatPlatesPerSide, platesPerSide, type PlateBreakdown } from '@/lib/plates/plate-math';
import { PLATE_STYLE } from '@/components/plates/plate-style';
import {
  compareRunningOrder,
  selectLiveSession,
  selectLoadingPositions,
  type RunningOrderFields,
} from '@/lib/attempts/running-order';
import { useBoardState } from '@/lib/realtime/use-board-state';
import type { BoardAttempt, BoardEntry, BoardFlight, BoardSession } from '@/lib/scorekeeper/board-types';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// Synthetic platform id for sessions with no platform assigned (mirrors the page's grouping).
const UNASSIGNED_PLATFORM_ID = 'none';

type LoadingDisplayProps = {
  competitionId: string;
  compName: string;
  platformId: string;
  platformName: string;
  sessions: BoardSession[];
  flights: BoardFlight[];
  entries: BoardEntry[];
  attempts: BoardAttempt[];
};

// The three rows are sized unevenly: the previous lifter (done) is compact, on deck is normal, and
// the lifter being loaded for is large. Each tier scales its own type and plate sizes so content fits
// its band rather than overflowing.
type SizeTier = 'compact' | 'normal' | 'large';

const TIER: Record<
  SizeTier,
  {
    pad: string;
    cardPad: string;
    name: string;
    meta: string;
    weight: string;
    unit: string;
    lbs: string;
    rackValue: string;
    plateWidth: string;
    plateText: string;
    perSide: string;
  }
> = {
  compact: {
    pad: 'py-2',
    cardPad: 'py-2',
    name: 'text-2xl',
    meta: 'text-sm',
    weight: 'text-3xl',
    unit: 'text-lg',
    lbs: 'text-xs',
    rackValue: 'text-xl',
    plateWidth: 'w-7',
    plateText: 'text-xs',
    perSide: 'text-xs',
  },
  normal: {
    pad: 'py-6',
    cardPad: 'py-5',
    name: 'text-5xl',
    meta: 'text-2xl',
    weight: 'text-7xl',
    unit: 'text-3xl',
    lbs: 'text-2xl',
    rackValue: 'text-4xl',
    plateWidth: 'w-14',
    plateText: 'text-xl',
    perSide: 'text-lg',
  },
  large: {
    pad: 'py-6',
    cardPad: 'py-5',
    name: 'text-6xl',
    meta: 'text-2xl',
    weight: 'text-8xl',
    unit: 'text-3xl',
    lbs: 'text-2xl',
    rackValue: 'text-4xl',
    plateWidth: 'w-14',
    plateText: 'text-xl',
    perSide: 'text-lg',
  },
};

// Per-tier plate heights, keyed by denomination. Same canonical-list typing as PLATE_STYLE: every IPF
// plate must have a height in every tier, enforced at compile time.
const PLATE_HEIGHT: Record<SizeTier, Record<IpfPlateWeight, string>> = {
  compact: { 25: 'h-16', 20: 'h-14', 15: 'h-12', 10: 'h-11', 5: 'h-10', 2.5: 'h-9', 1.25: 'h-8', 0.5: 'h-7', 0.25: 'h-6' },
  normal: { 25: 'h-44', 20: 'h-40', 15: 'h-36', 10: 'h-32', 5: 'h-28', 2.5: 'h-24', 1.25: 'h-20', 0.5: 'h-16', 0.25: 'h-14' },
  large: { 25: 'h-56', 20: 'h-52', 15: 'h-48', 10: 'h-44', 5: 'h-40', 2.5: 'h-36', 1.25: 'h-32', 0.5: 'h-28', 0.25: 'h-24' },
};

const RESULT_CHIP: Record<AttemptResult, { label: string; className: string } | null> = {
  good_lift: { label: 'GOOD LIFT', className: 'bg-green-600 text-white' },
  no_lift: { label: 'NO LIFT', className: 'bg-red-600 text-white' },
  not_taken: { label: 'NOT TAKEN', className: 'bg-neutral-600 text-white' },
  withdrawn: { label: 'WITHDRAWN', className: 'bg-neutral-600 text-white' },
  pending: null,
};

// An attempt placed in the running order, carrying its entry and flight so a position can be resolved
// back to the lifter and flight it belongs to.
type LiveRow = RunningOrderFields & { entryId: string; result: AttemptResult; flightId: string };

// Everything the crew needs about one of the three framed lifters.
type LifterCard = {
  entryId: string;
  lifterName: string;
  flightName: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
  entry: BoardEntry;
  breakdown: PlateBreakdown | null;
};

type DerivedView = {
  sessionName: string | null;
  header: { flightName: string; lift: LiftType; round: number; position: number; total: number } | null;
  previous: LifterCard | null;
  current: LifterCard | null;
  onDeck: LifterCard | null;
};

export function LoadingDisplay({
  competitionId,
  compName,
  platformId,
  platformName,
  sessions,
  flights: initialFlights,
  entries: initialEntries,
  attempts: initialAttempts,
}: LoadingDisplayProps) {
  // Read-only live state shared with the run screen; the loading display never mutates it (no
  // optimistic writes), it only reads to render. Weight classes/divisions are omitted — this screen
  // doesn't show those columns.
  const { attempts, entries, flights } = useBoardState({
    competitionId,
    initialAttempts,
    initialEntries,
    initialFlights,
  });

  const view = useMemo<DerivedView>(
    () => buildView({ platformId, sessions, flights, entries, attempts }),
    [platformId, sessions, flights, entries, attempts],
  );

  const headerMain = view.header
    ? `${view.header.flightName} — ${LIFT_LABELS[view.header.lift]}, Round ${view.header.round}`
    : 'No lifter on the platform';
  const headerProgress = view.header ? `${view.header.position} of ${view.header.total} lifters` : '';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      <header className="flex items-center justify-between gap-4 border-b-2 border-neutral-700 px-6 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium uppercase tracking-wide text-white">
            {platformName} · {compName}
          </p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{headerMain}</h1>
        </div>
        <div className="shrink-0 text-right">
          {view.sessionName ? (
            <p className="text-sm font-medium uppercase tracking-wide text-white">{view.sessionName}</p>
          ) : null}
          {headerProgress ? <p className="text-xl font-semibold tabular-nums">{headerProgress}</p> : null}
        </div>
      </header>

      <div
        aria-live="polite"
        aria-label="Platform loading order"
        className="grid min-h-0 flex-1 grid-rows-[0.5fr_1.5fr_1fr] divide-y divide-neutral-800"
      >
        <LifterRow role="Previous" card={view.previous} tint="" size="compact" dim />
        <LifterRow role="Now loading" card={view.current} tint="bg-green-950/75" size="large" highlight />
        <LifterRow role="On deck" card={view.onDeck} tint="" size="normal" />
      </div>
    </div>
  );
}

// Pure-ish derivation of the three framed lifters and the header state for the selected platform.
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
}): DerivedView {
  const flightById = new Map(flights.map((flight) => [flight.id, flight]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  // Sessions that have at least one rostered lifter — the only ones that can be "live". Mirrors the
  // run screen, which filters out empty sessions before selectLiveSession. Without this, an empty
  // earlier session (lower sort order, no attempts) is never "finished" and would be picked as live,
  // leaving the display stuck on "No lifter on the platform".
  const rosteredSessionIds = new Set<string>();
  for (const entry of entries) {
    const flight = entry.flightId ? flightById.get(entry.flightId) : undefined;
    if (flight) {
      rosteredSessionIds.add(flight.sessionId);
    }
  }

  const platformSessions = sessions
    .filter(
      (session) => (session.platformId ?? UNASSIGNED_PLATFORM_ID) === platformId && rosteredSessionIds.has(session.id),
    )
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
  const platformSessionIds = new Set(platformSessions.map((session) => session.id));

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
      result: attempt.result,
    });
    rowsBySession.set(session.id, list);
    attemptCountBySession.set(session.id, (attemptCountBySession.get(session.id) ?? 0) + 1);
    if (attempt.result === 'pending' && attempt.weightKg !== null) {
      pendingCountBySession.set(session.id, (pendingCountBySession.get(session.id) ?? 0) + 1);
    }
  }

  const liveSession = selectLiveSession(platformSessions, attemptCountBySession, pendingCountBySession);
  const liveRows = liveSession ? (rowsBySession.get(liveSession.id) ?? []) : [];
  const positions = selectLoadingPositions(liveRows);

  const toCard = (row: LiveRow | null): LifterCard | null => {
    if (!row) {
      return null;
    }
    const entry = entryById.get(row.entryId);
    if (!entry) {
      return null;
    }
    const flight = flightById.get(row.flightId);
    return {
      entryId: row.entryId,
      lifterName: entry.lifterName,
      flightName: flight?.name ?? '—',
      lift: row.lift,
      attemptNumber: row.attemptNumber,
      weightKg: row.weightKg,
      result: row.result,
      entry,
      breakdown: row.weightKg === null ? null : platesPerSide(row.weightKg),
    };
  };

  // Header from the lifter the bar is being loaded for. `group` is the declared attempts in this
  // flight/lift/round in running order (lightest first); position = the current lifter's rank within
  // it and total = its size, so both numbers describe the same set (declared attempts in the round)
  // and the fraction reads monotonically as the round progresses.
  let header: DerivedView['header'] = null;
  const current = positions.current;
  if (current) {
    const group = liveRows
      .filter(
        (row) =>
          row.flightId === current.flightId &&
          row.lift === current.lift &&
          row.attemptNumber === current.attemptNumber &&
          row.weightKg !== null,
      )
      .toSorted(compareRunningOrder);
    const position = group.findIndex((row) => row.entryId === current.entryId) + 1;
    const total = group.length;
    const flight = flightById.get(current.flightId);
    header = {
      flightName: flight?.name ?? '—',
      lift: current.lift,
      round: current.attemptNumber,
      position,
      total,
    };
  }

  return {
    sessionName: liveSession?.name ?? null,
    header,
    previous: toCard(positions.previous),
    current: toCard(positions.current),
    onDeck: toCard(positions.onDeck),
  };
}

function LifterRow({
  role,
  card,
  tint,
  size,
  highlight,
  dim,
}: {
  role: string;
  card: LifterCard | null;
  // Background wash for the row — only the now-loading row is tinted (green); the others are clear.
  tint: string;
  // Sizing tier: compact (previous), normal (on deck), large (now loading).
  size: SizeTier;
  highlight?: boolean;
  // Fades the whole row, marking the previous lifter as done.
  dim?: boolean;
}) {
  return (
    <section
      className={`relative grid min-h-0 grid-cols-1 items-center gap-8 overflow-hidden px-10 ${TIER[size].pad} lg:grid-cols-2 lg:gap-16 lg:px-20 ${tint} ${
        highlight ? 'z-10 rounded-xl ring-4 ring-inset ring-white' : ''
      } ${dim ? 'opacity-70' : ''}`}
    >
      <LifterIdentity role={role} card={card} size={size} />
      {card ? (
        // The "how to load it" half: rack settings and the plate diagram grouped in one card, so the
        // space between them reads as inside a panel rather than as dead screen.
        <div
          className={`flex h-full items-center justify-between gap-10 rounded-2xl border border-neutral-800 bg-white/[0.02] px-8 ${TIER[size].cardPad}`}
        >
          <RackSettings card={card} size={size} />
          <div className="flex shrink-0 items-center justify-end">
            {card.breakdown ? (
              <PlateStack breakdown={card.breakdown} size={size} />
            ) : (
              <p className="text-2xl font-semibold text-white">No weight declared</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LifterIdentity({ role, card, size }: { role: string; card: LifterCard | null; size: SizeTier }) {
  const chip = card ? RESULT_CHIP[card.result] : null;
  const tier = TIER[size];
  return (
    <div className="flex min-w-0 flex-col justify-center">
      <p className="text-base font-semibold uppercase tracking-widest text-white">{role}</p>
      {card ? (
        <>
          <p className={`truncate font-bold leading-none ${tier.name}`}>{card.lifterName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-white">
            <span className={`font-medium ${tier.meta}`}>
              {card.flightName} · {LIFT_LABELS[card.lift]} {card.attemptNumber}
            </span>
            {chip ? (
              <span className={`rounded px-2.5 py-0.5 text-base font-bold ${chip.className}`}>{chip.label}</span>
            ) : null}
          </div>
          <Weight weightKg={card.weightKg} size={size} />
        </>
      ) : (
        <p className="mt-2 text-3xl font-semibold text-white">—</p>
      )}
    </div>
  );
}

function Weight({ weightKg, size }: { weightKg: number | null; size: SizeTier }) {
  const tier = TIER[size];
  if (weightKg === null) {
    return <p className={`mt-2 font-semibold text-white ${tier.meta}`}>No weight declared</p>;
  }
  const lbs = (weightKg * KG_TO_LBS).toFixed(1);
  return (
    <p className="mt-2 tabular-nums text-white">
      <span className={`font-extrabold leading-none ${tier.weight}`}>{weightKg}</span>
      <span className={`ml-3 font-semibold ${tier.unit}`}>kg</span>
      <span className={`ml-4 ${tier.lbs}`}>({lbs} lb)</span>
    </p>
  );
}

const RACK_LABEL = 'text-sm font-semibold uppercase tracking-wide text-white';

// One labelled rack figure (e.g. Height / 14, Setting / IN), sized to the row's tier.
function RackField({ label, value, size }: { label: string; value: string | number; size: SizeTier }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={RACK_LABEL}>{label}</span>
      <span className={`font-extrabold tabular-nums leading-none ${TIER[size].rackValue}`}>{value}</span>
    </div>
  );
}

function RackSettings({ card, size }: { card: LifterCard; size: SizeTier }) {
  const { entry, lift } = card;
  return (
    <div className="flex flex-col justify-center gap-4">
      <p className={RACK_LABEL}>Rack settings</p>
      <RackFields entry={entry} lift={lift} size={size} />
    </div>
  );
}

function RackFields({ entry, lift, size }: { entry: BoardEntry; lift: LiftType; size: SizeTier }) {
  if (lift === 'deadlift') {
    return <p className="text-2xl font-semibold text-white">No racks — deadlift</p>;
  }
  if (lift === 'squat') {
    return (
      <div className="flex gap-12">
        <RackField label="Height" value={entry.rackHeightSquat ?? '—'} size={size} />
        <RackField
          label="Setting"
          value={entry.squatRackSetting ? SQUAT_RACK_SETTING_LABELS[entry.squatRackSetting] : '—'}
          size={size}
        />
      </div>
    );
  }
  return (
    <div className="flex gap-10">
      <RackField label="Rack" value={entry.rackHeightBench ?? '—'} size={size} />
      <RackField label="Safety" value={entry.benchSafetyHeight ?? '—'} size={size} />
      <RackField
        label="Spotting"
        value={entry.benchSpotting ? BENCH_SPOTTING_LABELS[entry.benchSpotting] : '—'}
        size={size}
      />
    </div>
  );
}

function PlateStack({ breakdown, size }: { breakdown: PlateBreakdown; size: SizeTier }) {
  // A weight at or below the bar+collars carries no plates — show "Bar only" rather than the
  // unloadable-remainder error (which is for weights ABOVE the bar that the plate set can't make).
  if (breakdown.perSideKg === 0) {
    return <p className="text-2xl font-semibold text-white">Bar only</p>;
  }
  if (!breakdown.loadable) {
    return <p className="text-xl font-semibold text-red-400">Cannot load {breakdown.totalKg} kg with available plates</p>;
  }
  const tier = TIER[size];
  const heights = PLATE_HEIGHT[size];
  const bars = expandPlatesToBars(breakdown.plates);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-end gap-2">
        {bars.map((bar) => {
          // platesPerSide only ever emits denominations from IPF_PLATE_WEIGHTS_KG, so the weight is
          // always a key of the (compile-time-complete) height/colour maps — the cast is safe.
          const weight = bar.weightKg as IpfPlateWeight;
          return (
            <div
              key={`${bar.weightKg}-${bar.index}`}
              className={`flex items-end justify-center rounded-md pb-2 font-bold ${tier.plateWidth} ${tier.plateText} ${heights[weight]} ${PLATE_STYLE[weight]}`}
            >
              {bar.weightKg}
            </div>
          );
        })}
      </div>
      <p className={`text-white ${tier.perSide}`}>
        <span className="font-semibold">{formatPlatesPerSide(breakdown.plates)}</span> per side
      </p>
    </div>
  );
}
