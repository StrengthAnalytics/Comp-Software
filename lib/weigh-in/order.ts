// Weigh-in running order. Lifters are called to the scale grouped the way they will lift, so the
// screen lays them out in that order. Non-team comps group by sex (female first, then male) and then
// run by flight and lot within each sex. Team comps group by lift role first (squat, then bench, then
// deadlift) — each member contests only their assigned lift — then by sex and flight/lot within a
// role. Female precedes male per the operator's chosen weigh-in order. Within a group lifters follow
// the flight running order (flight sort order, then lot), with missing values sorted last so nobody
// without a flight or lot leads the order.

import { GENDER_LABELS, LIFT_LABELS, type Gender, type Lifts } from '@/lib/constants';
import { compareValues, nullsLast } from '@/lib/ordering';
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

// Human label for a weigh-in group, e.g. "Squat · Female", "No team role · Male", or just "Female"
// for a non-team comp. Shared by the weigh-in and rack-heights screens (and their print sheets).
export function weighInGroupLabel<T>(group: WeighInGroup<T>, isTeamComp: boolean): string {
  const sex = GENDER_LABELS[group.sex];
  if (group.lift) {
    return `${LIFT_LABELS[group.lift]} · ${sex}`;
  }
  return isTeamComp ? `No team role · ${sex}` : sex;
}

// Which lifts every member of a group contests: the whole comp's lifts for an individual comp (or a
// team entry without a role yet), or just the group's role for a team comp. Drives which opener / rack
// columns a row shows.
export function liftsForWeighInGroup<T>(group: WeighInGroup<T>, lifts: Lifts, isTeamComp: boolean): Lifts {
  if (isTeamComp && group.lift) {
    return {
      squat: group.lift === 'squat',
      bench: group.lift === 'bench',
      deadlift: group.lift === 'deadlift',
    };
  }
  return lifts;
}
