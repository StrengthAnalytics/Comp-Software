import {
  DEFAULT_FLIGHTS_PER_SESSION,
  DEFAULT_LIFT_OFF_TIMES,
  FALLBACK_FIRST_LIFT_OFF,
  FALLBACK_SESSION_GAP_MINUTES,
  MAX_SCHEDULE_DAYS,
  WEIGH_IN_LEAD_MINUTES,
} from '@/lib/constants';
import { isRealIsoDate } from '@/lib/dates';

// The rules behind the Sessions & flights screen's guided schedule builder and its quick edits:
// the comp's days, suggested lift-off and weigh-in times, default session and flight names, the
// chronological session order and the labels that tell same-named sessions apart. Pure, so the rules
// are unit-tested without Supabase or React.

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 86_400_000;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// "09:30" / "09:30:00" → 570; null for anything that isn't a 24-hour time.
export function timeToMinutes(time: string | null): number | null {
  if (!time) {
    return null;
  }
  const match = HH_MM.exec(time);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

// 570 → "09:30", clamped to the same day (00:00–23:59) so an early lift-off can't produce a weigh-in
// "yesterday".
export function minutesToTime(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - 1);
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Weigh-in opens two hours before lift-off (the IPF rule). Null when the lift-off isn't a time.
export function weighInForLiftOff(liftOff: string | null): string | null {
  const minutes = timeToMinutes(liftOff);
  return minutes === null ? null : minutesToTime(minutes - WEIGH_IN_LEAD_MINUTES);
}

// Suggested lift-off times for a platform running `count` sessions in a day.
export function defaultLiftOffTimes(count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const fromTable = DEFAULT_LIFT_OFF_TIMES[count];
  if (fromTable) {
    return [...fromTable];
  }
  const first = timeToMinutes(FALLBACK_FIRST_LIFT_OFF) ?? 0;
  return Array.from({ length: count }, (_, index) => minutesToTime(first + index * FALLBACK_SESSION_GAP_MINUTES));
}

// Every date from the comp's start to its end (inclusive), capped at MAX_SCHEDULE_DAYS. A missing or
// earlier end date means a one-day comp; no (or an invalid) start date means no days.
export function compDays(startsOn: string | null, endsOn: string | null): string[] {
  if (!startsOn || !isRealIsoDate(startsOn)) {
    return [];
  }
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = endsOn && isRealIsoDate(endsOn) ? Date.parse(`${endsOn}T00:00:00Z`) : start;
  const span = Math.max(0, Math.round((end - start) / MS_PER_DAY));
  const count = Math.min(span + 1, MAX_SCHEDULE_DAYS);
  return Array.from({ length: count }, (_, index) => new Date(start + index * MS_PER_DAY).toISOString().slice(0, 10));
}

// "2026-07-11" → "Sat"; null for anything that isn't a real date.
export function shortDayLabel(date: string | null): string | null {
  if (!date || !isRealIsoDate(date)) {
    return null;
  }
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

// "2026-07-11" → "Saturday 11 July"; null for anything that isn't a real date.
export function longDayLabel(date: string | null): string | null {
  if (!date || !isRealIsoDate(date)) {
    return null;
  }
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

// Flights are lettered: index 0 → "Flight A". Past Z (never reached in practice) they are numbered.
const LETTER_COUNT = 26;
const FIRST_LETTER = 'A'.codePointAt(0) ?? 0;
export function flightName(index: number): string {
  return index < LETTER_COUNT ? `Flight ${String.fromCodePoint(FIRST_LETTER + index)}` : `Flight ${index + 1}`;
}

export function flightNames(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => flightName(index));
}

// The first "Flight X" a session doesn't already have, so "+ Add flight" never collides with the
// one-name-per-session rule.
export function nextFlightName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  for (let index = 0; ; index++) {
    const candidate = flightName(index);
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

// Sessions are numbered per day (and per platform): "Session 1", "Session 2", …
export function sessionName(index: number): string {
  return `Session ${index + 1}`;
}

// The first "Session N" not already used on that day/platform.
export function nextSessionName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  for (let index = 0; ; index++) {
    const candidate = sessionName(index);
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

// ----- Guided builder draft ---------------------------------------------------------------------

// One session row in the builder's times-and-flights step. `key` identifies the slot (day, platform,
// position) so a row's edits survive changing another day's session count.
export type ScheduleDraftRow = {
  key: string;
  date: string;
  platformIndex: number;
  name: string;
  liftOffTime: string;
  weighInTime: string;
  // True once the operator types their own weigh-in time; until then it follows the lift-off time.
  weighInEdited: boolean;
  flightCount: number;
};

export function draftRowKey(date: string, platformIndex: number, position: number): string {
  return `${date}|${platformIndex}|${position}`;
}

// The builder's session rows for the chosen counts (`counts[dayIndex][platformIndex]` sessions on
// each day for each platform), keeping any row the operator already edited and suggesting the rest.
export function buildDraftRows(
  days: readonly string[],
  platformCount: number,
  counts: readonly (readonly number[])[],
  previous: readonly ScheduleDraftRow[] = [],
): ScheduleDraftRow[] {
  const previousByKey = new Map(previous.map((row) => [row.key, row]));
  const rows: ScheduleDraftRow[] = [];
  for (const [dayIndex, date] of days.entries()) {
    for (let platformIndex = 0; platformIndex < platformCount; platformIndex++) {
      const count = counts[dayIndex]?.[platformIndex] ?? 0;
      const times = defaultLiftOffTimes(count);
      for (let position = 0; position < count; position++) {
        const key = draftRowKey(date, platformIndex, position);
        const kept = previousByKey.get(key);
        if (kept) {
          rows.push(kept);
          continue;
        }
        const liftOffTime = times[position] ?? FALLBACK_FIRST_LIFT_OFF;
        rows.push({
          key,
          date,
          platformIndex,
          name: sessionName(position),
          liftOffTime,
          weighInTime: weighInForLiftOff(liftOffTime) ?? '',
          weighInEdited: false,
          flightCount: DEFAULT_FLIGHTS_PER_SESSION,
        });
      }
    }
  }
  return rows;
}

// A new lift-off time for a draft row; the weigh-in follows it unless the operator set their own.
export function withLiftOff(row: ScheduleDraftRow, liftOffTime: string): ScheduleDraftRow {
  return {
    ...row,
    liftOffTime,
    weighInTime: row.weighInEdited ? row.weighInTime : (weighInForLiftOff(liftOffTime) ?? row.weighInTime),
  };
}

// Roughly how many lifters each flight would hold — the builder's sanity hint. Null with no flights.
export function lifterPerFlightEstimate(entryCount: number, flightCount: number): number | null {
  if (flightCount <= 0) {
    return null;
  }
  return Math.round(entryCount / flightCount);
}

// ----- Order and labels -------------------------------------------------------------------------

export type ChronologicalSession = {
  id: string;
  name: string;
  session_date: string | null;
  lift_off_time: string | null;
  platform_id: string | null;
  created_at?: string | null;
};

// Sessions run in time order: by date, then lift-off time, then platform name, then name. A session
// without a date or time sorts after the ones that have them, in the order it was created. The run
// screen treats the first unfinished session (in this order) as the live one, so the order must
// follow the clock rather than a hand-typed number.
// Compares two values where null means "not set yet", which sorts last.
function compareNullable(a: string | number | null, b: string | number | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

export function orderSessionsChronologically<T extends ChronologicalSession>(
  sessions: readonly T[],
  platformNamesById: ReadonlyMap<string, string> = new Map(),
): T[] {
  const platformName = (session: T) =>
    session.platform_id ? (platformNamesById.get(session.platform_id) ?? '') : '';
  return sessions.toSorted(
    (a, b) =>
      compareNullable(a.session_date, b.session_date) ||
      compareNullable(timeToMinutes(a.lift_off_time), timeToMinutes(b.lift_off_time)) ||
      platformName(a).localeCompare(platformName(b)) ||
      a.name.localeCompare(b.name, 'en-GB', { numeric: true }) ||
      compareNullable(a.created_at ?? null, b.created_at ?? null) ||
      a.id.localeCompare(b.id),
  );
}

// The sort_order each session should have (its position in time order), for only the sessions whose
// stored value differs — so a re-sequence writes nothing when the order is already right.
export function sessionSortOrderUpdates<T extends ChronologicalSession & { sort_order: number }>(
  sessions: readonly T[],
  platformNamesById: ReadonlyMap<string, string> = new Map(),
): { id: string; sort_order: number }[] {
  return orderSessionsChronologically(sessions, platformNamesById).flatMap((session, index) =>
    session.sort_order === index ? [] : [{ id: session.id, sort_order: index }],
  );
}

export type LabelledSession = {
  id: string;
  name: string;
  session_date: string | null;
  platform_id: string | null;
};

// What to call each session on screens that list several (weigh-in, rack heights, flight pickers).
// Sessions are numbered per day, so a two-day comp has two "Session 1"s: a name shared with another
// session gets its day in front ("Sat · Session 1"), and if that still clashes (two platforms) the
// platform after ("Sat · Session 1 · Platform B"). Unique names are shown as typed.
export function sessionDisplayLabels(
  sessions: readonly LabelledSession[],
  platformNamesById: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const nameKey = (session: LabelledSession) => session.name.trim().toLowerCase();
  const countBy = (key: (session: LabelledSession) => string) => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      counts.set(key(session), (counts.get(key(session)) ?? 0) + 1);
    }
    return counts;
  };
  const byName = countBy(nameKey);
  const byNameAndDay = countBy((session) => `${nameKey(session)}|${session.session_date ?? ''}`);

  const labels = new Map<string, string>();
  for (const session of sessions) {
    if ((byName.get(nameKey(session)) ?? 0) <= 1) {
      labels.set(session.id, session.name);
      continue;
    }
    const parts = [shortDayLabel(session.session_date), session.name];
    const stillClashes = (byNameAndDay.get(`${nameKey(session)}|${session.session_date ?? ''}`) ?? 0) > 1;
    const platform = session.platform_id ? platformNamesById.get(session.platform_id) : undefined;
    if (stillClashes && platform) {
      parts.push(platform);
    }
    labels.set(session.id, parts.filter(Boolean).join(' · '));
  }
  return labels;
}
