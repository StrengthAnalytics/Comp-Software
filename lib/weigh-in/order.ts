// Weigh-in running order. Lifters are called to the scale grouped the way they will lift, so the
// screen lays them out in that order. Non-team comps group by sex (female first, then male) and then
// run by flight and lot within each sex. Team comps group by lift role first (squat, then bench, then
// deadlift) — each member contests only their assigned lift — then by sex and flight/lot within a
// role. Female precedes male per the operator's chosen weigh-in order. Within a group lifters follow
// the flight running order (flight sort order, then lot), with missing values sorted last so nobody
// without a flight or lot leads the order.

import type { Gender } from '@/lib/constants';
import { TEAM_LIFTS, type TeamLift } from '@/types/team';

export type WeighInEntryFields = {
  sex: Gender;
  teamLift: TeamLift | null;
  flightSortOrder: number | null;
  lotNumber: number | null;
};

// A labelled block of lifters that weigh in together. `lift` is null for non-team comps (every
// lifter contests all three lifts) and for the trailing block of team entries with no role yet.
export type WeighInGroup<T> = {
  sex: Gender;
  lift: TeamLift | null;
  entries: T[];
};

const SEX_ORDER: readonly Gender[] = ['female', 'male'];

function nullsLast(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

// Ordered comparison rather than subtraction: two missing values both map to Infinity, and
// Infinity - Infinity is NaN, which would corrupt the sort.
function compareValues(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareWithinGroup(a: WeighInEntryFields, b: WeighInEntryFields): number {
  const byFlight = compareValues(nullsLast(a.flightSortOrder), nullsLast(b.flightSortOrder));
  if (byFlight !== 0) {
    return byFlight;
  }
  return compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber));
}

export function buildWeighInGroups<T extends WeighInEntryFields>(
  entries: readonly T[],
  isTeamComp: boolean,
): WeighInGroup<T>[] {
  const groups: WeighInGroup<T>[] = [];

  const pushGroup = (lift: TeamLift | null, sex: Gender, members: T[]) => {
    if (members.length > 0) {
      groups.push({ sex, lift, entries: members.toSorted(compareWithinGroup) });
    }
  };

  if (isTeamComp) {
    for (const lift of TEAM_LIFTS) {
      for (const sex of SEX_ORDER) {
        pushGroup(
          lift,
          sex,
          entries.filter((entry) => entry.teamLift === lift && entry.sex === sex),
        );
      }
    }
    // Entries not yet assigned a team role still have to weigh in — surface them last so they are
    // never silently dropped from the order.
    for (const sex of SEX_ORDER) {
      pushGroup(
        null,
        sex,
        entries.filter((entry) => entry.teamLift === null && entry.sex === sex),
      );
    }
  } else {
    for (const sex of SEX_ORDER) {
      pushGroup(
        null,
        sex,
        entries.filter((entry) => entry.sex === sex),
      );
    }
  }

  return groups;
}
