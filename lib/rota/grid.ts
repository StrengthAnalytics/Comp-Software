import { displayRotaTime } from '@/lib/rota/time';

// Lays the rota out the way the organisers' Google Sheet does: one column per section (session),
// grouped under day banners, with the jobs as rows down the side. Pure, so the public board and the
// admin grid share one tested layout. The data model stays section → roles; this only decides where
// each role sits in the grid.

export type RotaGridRoleBase = {
  id: string;
  title: string;
  arrive_by: string | null;
  sort_order: number;
};

export type RotaGridSectionBase<R extends RotaGridRoleBase> = {
  id: string;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
  roles: R[];
};

export type RotaGridColumn<S> = {
  section: S;
  // The arrive-by most of this column's roles share (e.g. "8:30am"), shown once in the column header
  // as the crew's call time. Roles with a different time (weigh-in) show their own in the cell.
  crewArriveBy: string | null;
};

export type RotaGridDayGroup = {
  // The banner over a run of consecutive columns sharing a day label; null for unlabelled columns.
  label: string | null;
  span: number;
};

export type RotaGridRow<R> = {
  // Stable row identity: the role title, case-insensitively, plus an occurrence number when one
  // column has two roles with the same title ("Weigh-in", "Weigh-in").
  key: string;
  title: string;
  // One entry per column, aligned with `columns`: the role in that column, or null when that column
  // doesn't have this job.
  cells: (R | null)[];
};

export type RotaGrid<R, S> = {
  columns: RotaGridColumn<S>[];
  dayGroups: RotaGridDayGroup[];
  rows: RotaGridRow<R>[];
};

function bySortOrder<T extends { sort_order: number; id: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
}

// The most common arrive-by among a column's roles, ties going to the one listed first. Null when
// no role has a time.
export function mostCommonArriveBy(roles: RotaGridRoleBase[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const role of roles) {
    const time = displayRotaTime(role.arrive_by);
    if (time === null) {
      continue;
    }
    const count = (counts.get(time) ?? 0) + 1;
    counts.set(time, count);
    if (count > bestCount) {
      best = time;
      bestCount = count;
    }
  }
  return best;
}

// A role's own arrive-by when it differs from its column's crew time (so the cell should show it),
// otherwise null.
export function cellArriveBy(role: RotaGridRoleBase, crewArriveBy: string | null): string | null {
  const time = displayRotaTime(role.arrive_by);
  return time !== null && time !== crewArriveBy ? time : null;
}

export function buildRotaGrid<R extends RotaGridRoleBase, S extends RotaGridSectionBase<R>>(
  sections: S[],
): RotaGrid<R, S> {
  const ordered = sections.toSorted(bySortOrder);

  // Row order: merge each column's role order into one list, keeping every column's relative order.
  // A job new to a later column slots in just after the job it follows there; if it leads its column,
  // just before the first job after it that's already placed; and if none of its column's jobs are
  // placed yet (a Set-up column), at the end.
  const rowKeys: string[] = [];
  const rowTitles = new Map<string, string>();
  const cellsByKey = new Map<string, Map<string, R>>();

  for (const section of ordered) {
    const seenInSection = new Map<string, number>();
    const keyed = section.roles.toSorted(bySortOrder).map((role) => {
      const base = role.title.trim().toLowerCase();
      const occurrence = (seenInSection.get(base) ?? 0) + 1;
      seenInSection.set(base, occurrence);
      return { role, key: occurrence === 1 ? base : `${base}#${occurrence}` };
    });

    let insertAfter = -1;
    for (const [position, { role, key }] of keyed.entries()) {
      let index = rowKeys.indexOf(key);
      if (index === -1) {
        if (insertAfter >= 0) {
          index = insertAfter + 1;
        } else {
          const nextPlaced = keyed
            .slice(position + 1)
            .map((later) => rowKeys.indexOf(later.key))
            .find((laterIndex) => laterIndex !== -1);
          index = nextPlaced ?? rowKeys.length;
        }
        rowKeys.splice(index, 0, key);
        rowTitles.set(key, role.title.trim());
      } else if (index < insertAfter) {
        // This column lists the job in a different order from an earlier one; keep the earlier
        // column's placement rather than shuffling rows already laid out.
        index = insertAfter;
      }
      insertAfter = index;

      const cells = cellsByKey.get(key) ?? new Map<string, R>();
      cells.set(section.id, role);
      cellsByKey.set(key, cells);
    }
  }

  const columns = ordered.map((section) => ({ section, crewArriveBy: mostCommonArriveBy(section.roles) }));

  const dayGroups: RotaGridDayGroup[] = [];
  for (const section of ordered) {
    const label = section.day_label?.trim() || null;
    const last = dayGroups.at(-1);
    if (last && last.label === label) {
      last.span += 1;
    } else {
      dayGroups.push({ label, span: 1 });
    }
  }

  const rows = rowKeys.map((key) => {
    const cells = cellsByKey.get(key);
    return {
      key,
      title: rowTitles.get(key) ?? key,
      cells: ordered.map((section) => cells?.get(section.id) ?? null),
    };
  });

  return { columns, dayGroups, rows };
}
