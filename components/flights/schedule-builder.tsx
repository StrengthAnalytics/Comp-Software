'use client';

import { useMemo, useState } from 'react';
import { buildScheduleAction } from '@/actions/schedule';
import {
  DEFAULT_SESSIONS_PER_DAY,
  MAX_FLIGHT_SIZE,
  MAX_FLIGHTS_PER_SESSION,
  MAX_SCHEDULE_PLATFORMS,
  MAX_SESSIONS_PER_DAY,
} from '@/lib/constants';
import {
  buildDraftRows,
  builderPlatformNames,
  compDays,
  flightNames,
  lifterPerFlightEstimate,
  withLiftOff,
  type ScheduleDraftRow,
} from '@/lib/sessions/schedule';
import { longDayLabel } from '@/lib/dates';
import { useAction } from '@/components/flights/use-action';
import { GHOST_BUTTON, INPUT_CLASS, PRIMARY_BUTTON } from '@/components/station/styles';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// The guided schedule builder: four questions that turn the comp's own dates into every platform,
// session and flight in one go, so a meet's structure isn't typed in one box at a time. Shown on the
// Sessions & flights screen while a comp has no sessions; everything it creates stays editable
// afterwards on that same screen.

const STEPS = ['Platforms', 'Sessions', 'Times', 'Check'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          className={`rounded-full border px-3 py-1 ${
            index === step
              ? 'border-brand-600 bg-brand-600 font-medium text-white'
              : (index < step
                ? 'border-brand-200 bg-brand-50 text-brand-800'
                : 'border-neutral-200 bg-neutral-50 text-neutral-500')
          }`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-neutral-300">
      <button
        type="button"
        aria-label={`One fewer — ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="h-9 w-9 bg-neutral-50 text-lg text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      >
        −
      </button>
      <output aria-label={label} className="w-10 text-center text-sm tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`One more — ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="h-9 w-9 bg-neutral-50 text-lg text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      >
        +
      </button>
    </span>
  );
}

export function ScheduleBuilder({
  competitionId,
  startsOn,
  endsOn,
  entryCount,
  existingPlatformNames,
  onSkip,
}: {
  competitionId: string;
  startsOn: string | null;
  endsOn: string | null;
  entryCount: number;
  // Platforms the comp already has (e.g. added before any session): the builder reuses them by name
  // rather than creating duplicates.
  existingPlatformNames: string[];
  onSkip: () => void;
}) {
  const days = useMemo(() => compDays(startsOn, endsOn), [startsOn, endsOn]);

  const [step, setStep] = useState(0);
  const [platformCount, setPlatformCount] = useState(1);
  // counts[dayIndex][platformIndex] — how many sessions that platform runs that day.
  const [counts, setCounts] = useState<number[][]>(() => days.map(() => [DEFAULT_SESSIONS_PER_DAY]));
  const [rows, setRows] = useState<ScheduleDraftRow[]>([]);
  const { run, error, pending } = useAction();

  const platformNames = builderPlatformNames(existingPlatformNames, platformCount);
  const platformName = (index: number) => platformNames[index] ?? '';

  const sessionTotal = counts.reduce((total, perDay) => total + perDay.reduce((a, b) => a + b, 0), 0);
  const flightTotal = rows.reduce((total, row) => total + row.flightCount, 0);
  const perFlight = lifterPerFlightEstimate(entryCount, flightTotal);

  function setDayCount(dayIndex: number, platformIndex: number, value: number) {
    setCounts((current) =>
      current.map((perDay, index) => {
        if (index !== dayIndex) {
          return perDay;
        }
        const next = [...perDay];
        next[platformIndex] = value;
        return next;
      }),
    );
  }

  function goToTimes() {
    setRows((current) => buildDraftRows(days, platformCount, counts, current));
    setStep(2);
  }

  function updateRow(key: string, change: (row: ScheduleDraftRow) => ScheduleDraftRow) {
    setRows((current) => current.map((row) => (row.key === key ? change(row) : row)));
  }

  function create() {
    run(() =>
      buildScheduleAction({
        competitionId,
        platforms: platformNames,
        sessions: rows.map((row) => ({
          platformIndex: row.platformIndex,
          date: row.date,
          name: row.name,
          liftOffTime: row.liftOffTime === '' ? null : row.liftOffTime,
          weighInTime: row.weighInTime === '' ? null : row.weighInTime,
          flightCount: row.flightCount,
        })),
      }),
    );
  }

  if (days.length === 0) {
    return (
      <Card title="Build your schedule">
        <p className="text-sm text-neutral-600">
          Set the competition&rsquo;s dates on Setup first — the builder uses them to lay out the days.
        </p>
        <button type="button" onClick={onSkip} className={`${buttonClasses('ghost')} mt-3`}>
          Add sessions by hand instead
        </button>
      </Card>
    );
  }

  return (
    <Card title="Build your schedule">
      <div className="space-y-5">
        <Stepper step={step} />

        {step === 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-tight">
              How many platforms will you lift on at the same time?
            </h3>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: MAX_SCHEDULE_PLATFORMS }, (_, index) => index + 1).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={platformCount === count}
                  onClick={() => {
                    setPlatformCount(count);
                    setCounts((current) =>
                      current.map((perDay) =>
                        Array.from({ length: count }, (_, index) => perDay[index] ?? perDay[0] ?? 1),
                      ),
                    );
                  }}
                  className={`min-w-[9rem] rounded-lg border-2 px-4 py-3 text-left ${
                    platformCount === count
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50'
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {count} platform{count === 1 ? '' : 's'}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {count === 1 ? 'Most meets' : 'Running side by side'}
                  </span>
                </button>
              ))}
            </div>
            {platformCount > 1 ? (
              <p className="text-sm text-neutral-600">
                They&rsquo;ll be called {platformNames.join(', ')}.
                Each platform runs its own sessions and times, and you can rename them afterwards.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-tight">How many sessions on each day?</h3>
            <p className="text-sm text-neutral-600">
              The days come from the competition dates. Set a day to 0 if there&rsquo;s no lifting on it.
            </p>
            <div className="divide-y divide-neutral-100">
              {days.map((date, dayIndex) => (
                <div key={date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm font-medium">{longDayLabel(date)}</span>
                  <div className="flex flex-wrap items-center gap-4">
                    {Array.from({ length: platformCount }, (_, platformIndex) => (
                      <span key={platformIndex} className="flex items-center gap-2">
                        {platformCount > 1 ? (
                          <span className="text-xs text-neutral-500">{platformName(platformIndex)}</span>
                        ) : null}
                        <Counter
                          label={`Sessions on ${longDayLabel(date)}${platformCount > 1 ? ` — ${platformName(platformIndex)}` : ''}`}
                          value={counts[dayIndex]?.[platformIndex] ?? 0}
                          min={0}
                          max={MAX_SESSIONS_PER_DAY}
                          onChange={(value) => setDayCount(dayIndex, platformIndex, value)}
                        />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-neutral-600">
              Sessions are numbered per day (Session 1, Session 2) — rename any of them afterwards.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-tight">When does each session lift, and how many flights?</h3>
            <p className="text-sm text-neutral-600">
              Weigh-in fills in two hours before lift-off; change it on any session that differs.
            </p>
            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Day</th>
                    {platformCount > 1 ? (
                      <th scope="col" className="px-3 py-2 text-left font-medium">Platform</th>
                    ) : null}
                    <th scope="col" className="px-3 py-2 text-left font-medium">Session</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Weigh-in</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Lift-off</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Flights</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-neutral-100">
                      <td className="whitespace-nowrap px-3 py-2">{longDayLabel(row.date)}</td>
                      {platformCount > 1 ? (
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-600">{platformName(row.platformIndex)}</td>
                      ) : null}
                      <td className="px-3 py-2">
                        <input
                          aria-label={`Session name — ${longDayLabel(row.date)}`}
                          value={row.name}
                          onChange={(event) => updateRow(row.key, (current) => ({ ...current, name: event.target.value }))}
                          className={`${INPUT_CLASS} w-36`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          aria-label={`Weigh-in time — ${row.name}, ${longDayLabel(row.date)}`}
                          value={row.weighInTime}
                          onChange={(event) =>
                            updateRow(row.key, (current) => ({ ...current, weighInTime: event.target.value }))
                          }
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          aria-label={`Lift-off time — ${row.name}, ${longDayLabel(row.date)}`}
                          value={row.liftOffTime}
                          onChange={(event) => updateRow(row.key, (current) => withLiftOff(current, event.target.value))}
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Counter
                          label={`Flights — ${row.name}, ${longDayLabel(row.date)}`}
                          value={row.flightCount}
                          min={1}
                          max={MAX_FLIGHTS_PER_SESSION}
                          onChange={(value) => updateRow(row.key, (current) => ({ ...current, flightCount: value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entryCount > 0 && perFlight !== null ? (
              <p className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
                {entryCount} lifter{entryCount === 1 ? '' : 's'} registered across {flightTotal} flight
                {flightTotal === 1 ? '' : 's'} — about <strong>{perFlight} per flight</strong>
                {perFlight > MAX_FLIGHT_SIZE
                  ? `. That's over the ${MAX_FLIGHT_SIZE} a flight runs well with, so add a flight or a session.`
                  : '.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-tight">Here&rsquo;s your schedule</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {days.map((date) => {
                const dayRows = rows.filter((row) => row.date === date);
                if (dayRows.length === 0) {
                  return null;
                }
                return (
                  <div key={date} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <h4 className="text-sm font-semibold">{longDayLabel(date)}</h4>
                    <ul className="mt-2 space-y-2">
                      {dayRows.map((row) => (
                        <li key={row.key} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                          <p className="text-sm font-medium">
                            {row.name}
                            {platformCount > 1 ? ` · ${platformName(row.platformIndex)}` : ''}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Weigh-in {row.weighInTime || '—'} · Lift-off {row.liftOffTime || '—'}
                          </p>
                          <p className="mt-1 text-xs text-neutral-600">{flightNames(row.flightCount).join(', ')}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-neutral-600">
              Creating this makes {rows.length} session{rows.length === 1 ? '' : 's'} and {flightTotal} flight
              {flightTotal === 1 ? '' : 's'}. Everything stays editable, and the staff rota can build its columns from these
              sessions with Generate from sessions on the Rota page.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || pending}
              className={GHOST_BUTTON}
            >
              Back
            </button>
            <button type="button" onClick={onSkip} className={buttonClasses('ghost')}>
              Add sessions by hand instead
            </button>
          </div>
          {step === STEPS.length - 1 ? (
            <button type="button" onClick={create} disabled={pending} className={PRIMARY_BUTTON}>
              {pending ? 'Creating…' : 'Create schedule'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (step === 1 ? goToTimes() : setStep((current) => current + 1))}
              disabled={step === 1 && sessionTotal === 0}
              className={PRIMARY_BUTTON}
            >
              Next
            </button>
          )}
        </div>
        {step === 1 && sessionTotal === 0 ? (
          <p className="text-sm text-neutral-500">Give at least one day a session to carry on.</p>
        ) : null}
      </div>
    </Card>
  );
}
