'use client';

import { memo, useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPlatformAction, deletePlatformAction, updatePlatformAction } from '@/actions/platforms';
import { createSessionAction, deleteSessionAction, updateSessionAction } from '@/actions/sessions';
import { createFlightAction, deleteFlightAction, moveFlightAction, updateFlightAction } from '@/actions/flights';
import { DEFAULT_FLIGHTS_PER_SESSION, FALLBACK_SESSION_GAP_MINUTES } from '@/lib/constants';
import {
  compDays,
  defaultLiftOffTimes,
  longDayLabel,
  minutesToTime,
  nextFlightName,
  nextPlatformName,
  nextSessionName,
  timeToMinutes,
  weighInForLiftOff,
} from '@/lib/sessions/schedule';
import {
  computeSaveIndicator,
  readError,
  SaveContext,
  SaveStatus,
  useOnline,
  type ReportedSaveState,
  type SaveContextValue,
} from '@/components/station/save-state';
import { useStationSave } from '@/components/station/use-station-save';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { FlightRow, PlatformOption, SessionRow } from '@/components/flights/flights-types';
import type { ActionResult } from '@/types/action-result';

// The schedule half of the Sessions & flights screen: the comp's platforms, its sessions grouped by
// day, and each session's flights. Every field here saves itself as it is typed (the station
// autosave engine the weigh-in and rack-heights screens use), sessions are ordered by the clock
// server-side, and flights are added with one click rather than typed in.

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
const GHOST_BUTTON = buttonClasses('secondary', 'sm');

const NO_DATE = 'no-date';

function timeForInput(value: string | null): string {
  return (value ?? '').slice(0, 5);
}

// A deletion or an add is an explicit action rather than an autosaved field, so it keeps its own
// pending state and error line.
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (action: () => Promise<ActionResult<unknown>>) => {
      setError(null);
      startTransition(async () => {
        try {
          const result = await action();
          if (result.status === 'error') {
            setError(readError(result));
            return;
          }
          router.refresh();
        } catch {
          setError('Couldn’t reach the server. Check your connection and try again.');
        }
      });
    },
    [router],
  );

  return { run, error, pending };
}

// ----- Platforms ---------------------------------------------------------------------------------

function PlatformRow({ platform }: { platform: PlatformOption }) {
  const [name, setName] = useState(platform.name);
  const { run, error: actionError, pending } = useAction();

  const save = useStationSave<null, { id: string; name: string }>({
    entryId: `platform-${platform.id}`,
    initialFlag: null,
    serialized: name.trim(),
    buildPayload: () => ({ id: platform.id, name: name.trim() }),
    save: updatePlatformAction,
  });

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        aria-label="Platform name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={save.flushSave}
        className={`${INPUT_CLASS} flex-1`}
      />
      <SaveStatus state={save.saveState} savedTick={save.savedTick} />
      <button
        type="button"
        onClick={() => run(() => deletePlatformAction({ id: platform.id }))}
        disabled={pending}
        className={GHOST_BUTTON}
      >
        Delete
      </button>
      {save.error || actionError ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {save.error ?? actionError}
        </p>
      ) : null}
    </div>
  );
}

function PlatformsCard({ competitionId, platforms }: { competitionId: string; platforms: PlatformOption[] }) {
  const { run, error, pending } = useAction();
  const [open, setOpen] = useState(platforms.length > 0);

  if (!open) {
    return (
      <p className="text-sm text-neutral-600">
        Running on one platform.{' '}
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-brand-700 hover:underline">
          Add another platform
        </button>
      </p>
    );
  }

  return (
    <Card title="Platforms">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Most meets run on a single platform. Add a second only if you are running more than one at once.
      </p>

      <div className="divide-y divide-neutral-100">
        {platforms.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">
            No platforms added — sessions will use the single default platform.
          </p>
        ) : (
          platforms.map((platform) => <PlatformRow key={platform.id} platform={platform} />)
        )}
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={() =>
            run(() =>
              createPlatformAction({
                competitionId,
                name: nextPlatformName(platforms.map((platform) => platform.name)),
              }),
            )
          }
          disabled={pending}
          className={GHOST_BUTTON}
        >
          + Add platform
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

// ----- Flights -----------------------------------------------------------------------------------

function FlightChip({
  flight,
  lifterCount,
  isFirst,
  isLast,
}: {
  flight: FlightRow;
  lifterCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(flight.name);
  const { run, error: actionError, pending } = useAction();

  const save = useStationSave<null, { id: string; name: string }>({
    entryId: `flight-${flight.id}`,
    initialFlag: null,
    serialized: name.trim(),
    buildPayload: () => ({ id: flight.id, name: name.trim() }),
    save: updateFlightAction,
  });

  return (
    <div className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
      <div className="flex items-center gap-1">
        <input
          aria-label={`Flight name — ${flight.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={save.flushSave}
          className="w-28 rounded border border-transparent px-1 py-0.5 text-sm font-medium hover:border-neutral-200 focus:border-neutral-400 focus:outline-none"
        />
        <span className="text-xs tabular-nums text-neutral-500">{lifterCount}</span>
        <button
          type="button"
          aria-label={`Move ${flight.name} earlier`}
          disabled={isFirst || pending}
          onClick={() => run(() => moveFlightAction({ id: flight.id, direction: 'up' }))}
          className="px-1 text-neutral-500 hover:text-neutral-900 disabled:text-neutral-300"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${flight.name} later`}
          disabled={isLast || pending}
          onClick={() => run(() => moveFlightAction({ id: flight.id, direction: 'down' }))}
          className="px-1 text-neutral-500 hover:text-neutral-900 disabled:text-neutral-300"
        >
          ↓
        </button>
        <button
          type="button"
          aria-label={`Delete ${flight.name}`}
          disabled={pending}
          onClick={() => run(() => deleteFlightAction({ id: flight.id }))}
          className="px-1 text-neutral-500 hover:text-red-700 disabled:text-neutral-300"
        >
          ×
        </button>
      </div>
      <SaveStatus state={save.saveState} savedTick={save.savedTick} />
      {save.error || actionError ? (
        <p role="alert" className="text-xs text-red-600">
          {save.error ?? actionError}
        </p>
      ) : null}
    </div>
  );
}

function FlightsStrip({
  competitionId,
  sessionId,
  flights,
  lifterCountByFlight,
}: {
  competitionId: string;
  sessionId: string;
  flights: FlightRow[];
  lifterCountByFlight: Map<string, number>;
}) {
  const { run, error, pending } = useAction();

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Flights</h4>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {flights.map((flight, index) => (
          <FlightChip
            key={flight.id}
            flight={flight}
            lifterCount={lifterCountByFlight.get(flight.id) ?? 0}
            isFirst={index === 0}
            isLast={index === flights.length - 1}
          />
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              createFlightAction({
                competitionId,
                sessionId,
                name: nextFlightName(flights.map((flight) => flight.name)),
                sortOrder: flights.length,
              }),
            )
          }
          className={GHOST_BUTTON}
        >
          + Add flight
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

// ----- Sessions ----------------------------------------------------------------------------------

const SessionCard = memo(function SessionCard({
  competitionId,
  session,
  flights,
  platforms,
  lifterCountByFlight,
}: {
  competitionId: string;
  session: SessionRow;
  flights: FlightRow[];
  platforms: PlatformOption[];
  lifterCountByFlight: Map<string, number>;
}) {
  const [name, setName] = useState(session.name);
  const [sessionDate, setSessionDate] = useState(session.session_date ?? '');
  const [weighInTime, setWeighInTime] = useState(timeForInput(session.weigh_in_time));
  const [liftOffTime, setLiftOffTime] = useState(timeForInput(session.lift_off_time));
  const [platformId, setPlatformId] = useState(session.platform_id ?? '');
  const { run, error: actionError, pending } = useAction();

  const showPlatform = platforms.length > 1;
  const payload = {
    id: session.id,
    competitionId,
    name: name.trim(),
    sessionDate: sessionDate.trim() || null,
    weighInTime: weighInTime.trim() || null,
    liftOffTime: liftOffTime.trim() || null,
    platformId: platformId === '' ? null : platformId,
  };

  const save = useStationSave<null, typeof payload>({
    entryId: `session-${session.id}`,
    initialFlag: null,
    serialized: JSON.stringify(payload),
    buildPayload: () => payload,
    save: updateSessionAction,
    // A session's day or time re-orders (and can regroup) the schedule server-side, so every save
    // re-pulls the page.
    refreshOnAutosave: true,
  });

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Session name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={save.flushSave}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Date</span>
          <input
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            onBlur={save.flushSave}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Weigh-ins open at</span>
          <input
            type="time"
            value={weighInTime}
            onChange={(event) => setWeighInTime(event.target.value)}
            onBlur={save.flushSave}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Lifting starts at</span>
          <input
            type="time"
            value={liftOffTime}
            onChange={(event) => {
              const next = event.target.value;
              // Weigh-in follows lift-off (two hours before) while it is empty or still the time worked
              // out from the old lift-off; a weigh-in time set by hand is left alone.
              if (weighInTime === '' || weighInTime === weighInForLiftOff(liftOffTime)) {
                setWeighInTime(weighInForLiftOff(next) ?? weighInTime);
              }
              setLiftOffTime(next);
            }}
            onBlur={save.flushSave}
            className={INPUT_CLASS}
          />
        </label>
        {showPlatform ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Platform</span>
            <select
              value={platformId}
              onChange={(event) => setPlatformId(event.target.value)}
              onBlur={save.flushSave}
              className={INPUT_CLASS}
            >
              <option value="">—</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SaveStatus state={save.saveState} savedTick={save.savedTick} />
        <button
          type="button"
          onClick={() => run(() => deleteSessionAction({ id: session.id }))}
          disabled={pending}
          className={GHOST_BUTTON}
        >
          Delete session
        </button>
        {save.error || actionError ? (
          <p role="alert" className="text-sm text-red-600">
            {save.error ?? actionError}
          </p>
        ) : null}
      </div>

      <FlightsStrip
        competitionId={competitionId}
        sessionId={session.id}
        flights={flights}
        lifterCountByFlight={lifterCountByFlight}
      />
    </section>
  );
});

// The lift-off a new session on this day should suggest: a gap after the day's last session, or the
// usual first lift-off when the day is empty.
function suggestedLiftOff(daySessions: readonly SessionRow[]): string {
  const latest = daySessions
    .map((session) => timeToMinutes(session.lift_off_time))
    .filter((minutes): minutes is number => minutes !== null)
    .toSorted((a, b) => a - b)
    .at(-1);
  if (latest === undefined) {
    return defaultLiftOffTimes(1)[0];
  }
  return minutesToTime(latest + FALLBACK_SESSION_GAP_MINUTES);
}

function AddSessionButton({
  competitionId,
  date,
  daySessions,
  platforms,
}: {
  competitionId: string;
  date: string | null;
  daySessions: SessionRow[];
  platforms: PlatformOption[];
}) {
  const { run, error, pending } = useAction();
  const liftOff = suggestedLiftOff(daySessions);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() =>
            createSessionAction({
              competitionId,
              name: nextSessionName(daySessions.map((session) => session.name)),
              sessionDate: date,
              liftOffTime: liftOff,
              weighInTime: weighInForLiftOff(liftOff),
              platformId: platforms.length === 1 ? platforms[0].id : null,
              flightCount: DEFAULT_FLIGHTS_PER_SESSION,
            }),
          )
        }
        className={GHOST_BUTTON}
      >
        + Add a session{date ? ` on ${longDayLabel(date)}` : ''}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ScheduleEditor({
  competitionId,
  startsOn,
  endsOn,
  platforms,
  sessions,
  flights,
  lifterCountByFlight,
}: {
  competitionId: string;
  startsOn: string | null;
  endsOn: string | null;
  platforms: PlatformOption[];
  sessions: SessionRow[];
  flights: FlightRow[];
  lifterCountByFlight: Map<string, number>;
}) {
  const online = useOnline();
  // Each row reports its non-clean save state here; the header indicator rolls them up, exactly as
  // the weigh-in and rack-heights screens do.
  const [rowStates, setRowStates] = useState<Map<string, ReportedSaveState>>(() => new Map());
  const report = useCallback((id: string, state: ReportedSaveState | null) => {
    setRowStates((current) => {
      if ((current.get(id) ?? null) === state) {
        return current;
      }
      const next = new Map(current);
      if (state === null) {
        next.delete(id);
      } else {
        next.set(id, state);
      }
      return next;
    });
  }, []);
  const saveContext = useMemo<SaveContextValue>(() => ({ online, report }), [online, report]);
  const indicator = computeSaveIndicator(online, new Set(rowStates.values()));

  const flightsBySession = useMemo(() => {
    const map = new Map<string, FlightRow[]>();
    for (const flight of flights.toSorted((a, b) => a.sort_order - b.sort_order)) {
      map.set(flight.session_id, [...(map.get(flight.session_id) ?? []), flight]);
    }
    return map;
  }, [flights]);

  // One group per comp day (in date order), plus any session whose date is unset or outside the comp.
  const groups = useMemo(() => {
    const byDate = new Map<string, SessionRow[]>();
    for (const session of sessions) {
      const key = session.session_date ?? NO_DATE;
      byDate.set(key, [...(byDate.get(key) ?? []), session]);
    }
    const days = compDays(startsOn, endsOn);
    const extras = [...byDate.keys()].filter((key) => key !== NO_DATE && !days.includes(key)).toSorted();
    return [...days, ...extras, ...(byDate.has(NO_DATE) ? [NO_DATE] : [])].map((key) => ({
      key,
      date: key === NO_DATE ? null : key,
      sessions: byDate.get(key) ?? [],
    }));
  }, [sessions, startsOn, endsOn]);

  return (
    <SaveContext.Provider value={saveContext}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Schedule</h2>
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${indicator.box}`}
          >
            <span className={`h-2 w-2 rounded-full ${indicator.dot} ${indicator.pulse ? 'animate-pulse' : ''}`} />
            {indicator.text}
          </div>
        </div>

        <PlatformsCard competitionId={competitionId} platforms={platforms} />

        {groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-700">
              {group.date ? longDayLabel(group.date) : 'No date set'}
            </h3>
            {group.sessions.map((session) => (
              <SessionCard
                key={session.id}
                competitionId={competitionId}
                session={session}
                flights={flightsBySession.get(session.id) ?? []}
                platforms={platforms}
                lifterCountByFlight={lifterCountByFlight}
              />
            ))}
            {group.date ? (
              <AddSessionButton
                competitionId={competitionId}
                date={group.date}
                daySessions={group.sessions}
                platforms={platforms}
              />
            ) : null}
          </section>
        ))}

        {groups.length === 0 ? (
          <AddSessionButton competitionId={competitionId} date={null} daySessions={sessions} platforms={platforms} />
        ) : null}
      </div>
    </SaveContext.Provider>
  );
}
