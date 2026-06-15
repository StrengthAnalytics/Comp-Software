// Pure helpers for the rota builder's "Generate from sessions" action: turning the comp's sessions
// into rota sections. Kept free of Supabase so the mapping rules are unit-tested in isolation.

export type SessionForRota = {
  id: string;
  name: string;
  session_date: string | null;
  start_time: string | null;
  platform_id: string | null;
  sort_order: number;
};

// The weekday banner for a section, e.g. "Sat". UTC so the day doesn't shift with the viewer's
// timezone — a session date is a calendar date, not an instant. Null for a missing/invalid date.
export function formatRotaDayLabel(sessionDate: string | null): string | null {
  if (!sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return null;
  }
  return new Date(`${sessionDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

// "10:00:00" / "10:00" → "10:00"; anything unrecognised → null.
export function formatRotaStartTime(startTime: string | null): string | null {
  if (!startTime) {
    return null;
  }
  const match = /^(\d{2}:\d{2})/.exec(startTime);
  return match ? match[1] : null;
}

// The free-text subtitle line under a generated section's heading: the start time, and the platform
// name when the comp runs more than one platform (otherwise it's redundant).
export function buildRotaSubtitle(startTime: string | null, platformName: string | null): string | null {
  const parts = [formatRotaStartTime(startTime), platformName].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

export type PlannedRotaSection = {
  sessionId: string;
  dayLabel: string | null;
  title: string;
  subtitle: string | null;
};

// Plans one rota section per session that doesn't already have one (skipping any session id in
// linkedSessionIds), in the sessions' own order. The platform name is folded into the subtitle only
// when the comp runs more than one platform.
export function planRotaSectionsFromSessions(
  sessions: SessionForRota[],
  linkedSessionIds: ReadonlySet<string>,
  platformNamesById: ReadonlyMap<string, string>,
): PlannedRotaSection[] {
  const includePlatform = platformNamesById.size > 1;
  return sessions
    .filter((session) => !linkedSessionIds.has(session.id))
    .toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((session) => {
      const platformName =
        includePlatform && session.platform_id ? (platformNamesById.get(session.platform_id) ?? null) : null;
      return {
        sessionId: session.id,
        dayLabel: formatRotaDayLabel(session.session_date),
        title: session.name,
        subtitle: buildRotaSubtitle(session.start_time, platformName),
      };
    });
}
