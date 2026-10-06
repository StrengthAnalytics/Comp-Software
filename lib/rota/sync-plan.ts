import { ROTA_ARRIVE_BEFORE_MINUTES, ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES, type RotaArriveBasis } from '@/lib/constants';
import { arriveBefore, planRotaSectionsFromSessions, type SessionForRota } from '@/lib/rota/generate';
import { toTwelveHourClock } from '@/lib/rota/time';

// The rota follows the session schedule. A column linked to a session (rota_sections.session_id) takes
// its header — day, title, "Weigh-in 7:00am · Lift-off 9:00am" — from that session, and each job with
// an `arrive_basis` has its arrive-by worked out from the session's times. This file plans what has
// to change after the sessions change; lib/rota/sync.ts reads the rows and applies the plan. Pure, so
// the rules are unit-tested without Supabase.

export type SyncSection = {
  id: string;
  session_id: string | null;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
};

export type SyncRole = {
  id: string;
  section_id: string;
  title: string;
  arrive_by: string | null;
  arrive_basis: RotaArriveBasis | null;
  capacity: number;
  sort_order: number;
};

export type PlannedNewColumn = {
  sessionId: string;
  dayLabel: string | null;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  roles: {
    title: string;
    arrive_by: string | null;
    arrive_basis: RotaArriveBasis | null;
    capacity: number;
    sort_order: number;
  }[];
};

export type RotaSyncPlan = {
  sectionUpdates: {
    id: string;
    day_label: string | null;
    title: string;
    subtitle: string | null;
    sort_order: number;
  }[];
  roleUpdates: { id: string; arrive_by: string | null }[];
  newColumns: PlannedNewColumn[];
};

// A job's arrive-by from its basis: 30 minutes before lift-off for the platform crew, 10 minutes
// before weigh-ins open for the weigh-in team, in the rota's "8:30am" style. Null when the session
// time isn't set yet.
export function arriveByForBasis(
  basis: RotaArriveBasis,
  session: { weigh_in_time: string | null; lift_off_time: string | null },
): string | null {
  return toTwelveHourClock(
    basis === 'lift_off'
      ? arriveBefore(session.lift_off_time, ROTA_ARRIVE_BEFORE_MINUTES)
      : arriveBefore(session.weigh_in_time, ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES),
  );
}

function bySortOrder<T extends { sort_order: number; id: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
}

// What to change so the rota matches the sessions:
// - every linked column's header is rebuilt from its session (as Generate builds it);
// - every job with an arrive basis gets its arrive-by recalculated (hand-set times are left alone);
// - a session named in `addColumnFor` that has no column yet gets one, copying the jobs of the column
//   for the session before it (or after it, if it's first) — but only once the rota already has
//   session columns, so a comp that never generated its rota isn't given one unasked;
// - the session columns are kept in session order. Hand-made columns (Set-up, Take Down) keep their
//   place; only the positions session columns occupy are reshuffled among themselves.
export function planRotaSync(
  sessions: SessionForRota[],
  sections: SyncSection[],
  roles: SyncRole[],
  platformNamesById: ReadonlyMap<string, string>,
  addColumnFor: readonly string[] = [],
): RotaSyncPlan {
  const orderedSessions = sessions.toSorted(bySortOrder);
  const sessionRank = new Map(orderedSessions.map((session, index) => [session.id, index]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const headerBySession = new Map(
    planRotaSectionsFromSessions(sessions, new Set(), platformNamesById).map((header) => [header.sessionId, header]),
  );

  const rolesBySection = new Map<string, SyncRole[]>();
  for (const role of roles) {
    const list = rolesBySection.get(role.section_id) ?? [];
    list.push(role);
    rolesBySection.set(role.section_id, list);
  }

  const linkedSectionBySession = new Map<string, SyncSection>();
  for (const section of sections) {
    if (section.session_id !== null && sessionById.has(section.session_id)) {
      linkedSectionBySession.set(section.session_id, section);
    }
  }

  // The column order, as section ids — new columns are spliced in next to their neighbours below.
  const order = sections.toSorted(bySortOrder).map((section) => section.id);

  const newColumns: PlannedNewColumn[] = [];
  const newColumnKeyBySession = new Map<string, string>();
  if (linkedSectionBySession.size > 0) {
    const wanted = new Set(addColumnFor);
    for (const session of orderedSessions) {
      if (!wanted.has(session.id) || linkedSectionBySession.has(session.id)) {
        continue;
      }
      const header = headerBySession.get(session.id);
      if (!header) {
        continue;
      }
      const rank = sessionRank.get(session.id) ?? 0;
      const before = orderedSessions.slice(0, rank).findLast((other) => linkedSectionBySession.has(other.id));
      const after = orderedSessions.slice(rank + 1).find((other) => linkedSectionBySession.has(other.id));
      const template = linkedSectionBySession.get((before ?? after)?.id ?? '');
      if (!template) {
        continue;
      }

      const key = `new:${session.id}`;
      const anchorIndex = order.indexOf(template.id);
      order.splice(before ? anchorIndex + 1 : anchorIndex, 0, key);
      newColumnKeyBySession.set(session.id, key);

      newColumns.push({
        sessionId: session.id,
        dayLabel: header.dayLabel,
        title: header.title,
        subtitle: header.subtitle,
        sortOrder: 0, // set once the order is final, below
        roles: (rolesBySection.get(template.id) ?? []).toSorted(bySortOrder).map((role, index) => ({
          title: role.title,
          arrive_by: role.arrive_basis === null ? role.arrive_by : arriveByForBasis(role.arrive_basis, session),
          arrive_basis: role.arrive_basis,
          capacity: role.capacity,
          sort_order: index,
        })),
      });
    }
  }

  // Session columns follow session order: collect the positions they hold, then hand those positions
  // out again in session order.
  const sessionIdByKey = new Map<string, string>();
  for (const [sessionId, section] of linkedSectionBySession) {
    sessionIdByKey.set(section.id, sessionId);
  }
  for (const [sessionId, key] of newColumnKeyBySession) {
    sessionIdByKey.set(key, sessionId);
  }
  const linkedPositions = order.flatMap((key, index) => (sessionIdByKey.has(key) ? [index] : []));
  const linkedInSessionOrder = order
    .filter((key) => sessionIdByKey.has(key))
    .toSorted(
      (a, b) =>
        (sessionRank.get(sessionIdByKey.get(a) ?? '') ?? 0) - (sessionRank.get(sessionIdByKey.get(b) ?? '') ?? 0),
    );
  for (const [slot, position] of linkedPositions.entries()) {
    order[position] = linkedInSessionOrder[slot];
  }
  const finalSortOrder = new Map(order.map((key, index) => [key, index]));

  for (const column of newColumns) {
    column.sortOrder = finalSortOrder.get(`new:${column.sessionId}`) ?? order.length;
  }

  const sectionUpdates: RotaSyncPlan['sectionUpdates'] = [];
  for (const section of sections) {
    const sortOrder = finalSortOrder.get(section.id) ?? section.sort_order;
    const header =
      section.session_id !== null && linkedSectionBySession.get(section.session_id)?.id === section.id
        ? headerBySession.get(section.session_id)
        : undefined;
    const next = header
      ? {
          day_label: header.dayLabel,
          title: header.title,
          subtitle: header.subtitle,
        }
      : {
          day_label: section.day_label,
          title: section.title,
          subtitle: section.subtitle,
        };
    if (
      next.day_label !== section.day_label ||
      next.title !== section.title ||
      next.subtitle !== section.subtitle ||
      sortOrder !== section.sort_order
    ) {
      sectionUpdates.push({ id: section.id, ...next, sort_order: sortOrder });
    }
  }

  const roleUpdates: RotaSyncPlan['roleUpdates'] = [];
  for (const [sessionId, section] of linkedSectionBySession) {
    const session = sessionById.get(sessionId);
    if (!session) {
      continue;
    }
    for (const role of rolesBySection.get(section.id) ?? []) {
      if (role.arrive_basis === null) {
        continue;
      }
      const arriveBy = arriveByForBasis(role.arrive_basis, session);
      if (arriveBy !== role.arrive_by) {
        roleUpdates.push({ id: role.id, arrive_by: arriveBy });
      }
    }
  }

  return { sectionUpdates, roleUpdates, newColumns };
}
