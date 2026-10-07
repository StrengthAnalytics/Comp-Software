import {
  DEFAULT_FLIGHTS_PER_SESSION,
  DEFAULT_LIFT_OFF_TIMES,
  FALLBACK_FIRST_LIFT_OFF,
  FALLBACK_SESSION_GAP_MINUTES,
  MAX_SCHEDULE_DAYS,
  WEIGH_IN_LEAD_MINUTES,
} from '@/lib/constants';
import { daysBetweenIsoDates, isRealIsoDate, shortDayLabel } from '@/lib/dates';

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

// The weigh-in time to keep after a lift-off change from `oldLiftOff` to `newLiftOff`: it follows the
// lift-off while it is empty or still the time worked out from the old lift-off; a time set by hand
// is left alone.
export function followWeighIn(weighIn: string, oldLiftOff: string, newLiftOff: string): string {
  if (weighIn !== '' && weighIn !== weighInForLiftOff(oldLiftOff)) {
    return weighIn;
  }
  return weighInForLiftOff(newLiftOff) ?? weighIn;
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
  const span = Math.max(0, (endsOn ? daysBetweenIsoDates(startsOn, endsOn) : null) ?? 0);
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  return Array.from({ length: Math.min(span + 1, MAX_SCHEDULE_DAYS) }, (_, index) =>
    new Date(start + index * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

// Default names. Flights and platforms are lettered ("Flight A", "Platform B"; numbered past Z,
// never reached in practice); sessions are numbered per day and platform ("Session 1").
const LETTER_COUNT = 26;
const FIRST_LETTER = 'A'.codePointAt(0) ?? 0;

function lettered(prefix: string, index: number): string {
  return index < LETTER_COUNT ? `${prefix} ${String.fromCodePoint(FIRST_LETTER + index)}` : `${prefix} ${index + 1}`;
}

const flightName = (index: number) => lettered('Flight', index);
const platformName = (index: number) => lettered('Platform', index);
const sessionName = (index: number) => `Session ${index + 1}`;

// The first of nameAt(0), nameAt(1), … that `existing` doesn't already use, ignoring case.
function firstUnused(existing: readonly string[], nameAt: (index: number) => string): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  for (let index = 0; ; index++) {
    const candidate = nameAt(index);
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

export function flightNames(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => flightName(index));
}

// The lettered flight rows a new session starts with, ready to insert.
export function flightRowsFor(competitionId: string, sessionId: string, count: number) {
  return flightNames(count).map((name, sortOrder) => ({
    competition_id: competitionId,
    session_id: sessionId,
    name,
    sort_order: sortOrder,
  }));
}

// The first "Flight X" a session doesn't already have, so "+ Add flight" never collides with the
// one-name-per-session rule.
export function nextFlightName(existing: readonly string[]): string {
  return firstUnused(existing, flightName);
}

// The first "Platform X" the comp doesn't already have.
export function nextPlatformName(existing: readonly string[]): string {
  return firstUnused(existing, platformName);
}

// The names the guided builder uses for `count` platforms: the comp's existing platforms first (so
// they are reused rather than duplicated), then fresh "Platform X" names that don't clash with them.
export function builderPlatformNames(existing: readonly string[], count: number): string[] {
  const names = existing.slice(0, count);
  while (names.length < count) {
    names.push(nextPlatformName([...existing, ...names]));
  }
  return names;
}

// The first "Session N" not already used on that day/platform.
export function nextSessionName(existing: readonly string[]): string {
  return firstUnused(existing, sessionName);
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
  flightCount: number;
};

function draftRowKey(date: string, platformIndex: number, position: number): string {
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
          flightCount: DEFAULT_FLIGHTS_PER_SESSION,
        });
      }
    }
  }
  return rows;
}

// A new lift-off time for a draft row; the weigh-in follows it unless the operator set their own.
export function withLiftOff(row: ScheduleDraftRow, liftOffTime: string): ScheduleDraftRow {
  return { ...row, liftOffTime, weighInTime: followWeighIn(row.weighInTime, row.liftOffTime, liftOffTime) };
}

// Roughly how many lifters each flight would hold — the builder's sanity hint. Null with no flights.
export function lifterPerFlightEstimate(entryCount: number, flightCount: number): number | null {
  if (flightCount <= 0) {
    return null;
  }
  return Math.round(entryCount / flightCount);
}

// ----- Order and labels -------------------------------------------------------------------------

type ChronologicalSession = {
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
  const platformOf = (session: T) =>
    session.platform_id ? (platformNamesById.get(session.platform_id) ?? '') : '';
  return sessions.toSorted(
    (a, b) =>
      compareNullable(a.session_date, b.session_date) ||
      compareNullable(timeToMinutes(a.lift_off_time), timeToMinutes(b.lift_off_time)) ||
      platformOf(a).localeCompare(platformOf(b)) ||
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

type LabelledSession = {
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
