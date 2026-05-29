import { describe, expect, it } from 'vitest';
import {
  buildWeighInGroups,
  liftsForWeighInGroup,
  weighInGroupLabel,
  type WeighInEntryFields,
  type WeighInGroup,
} from '@/lib/weigh-in/order';
import type { Lifts } from '@/lib/constants';

type TestEntry = WeighInEntryFields & { id: string };

function entry(id: string, fields: Partial<WeighInEntryFields> = {}): TestEntry {
  return {
    id,
    sex: 'male',
    teamLift: null,
    flightSortOrder: null,
    lotNumber: null,
    ...fields,
  };
}

describe('buildWeighInGroups (non-team comp)', () => {
  it('groups by sex with female first, then male', () => {
    const groups = buildWeighInGroups(
      [entry('m', { sex: 'male' }), entry('f', { sex: 'female' })],
      false,
    );
    expect(groups.map((group) => ({ sex: group.sex, lift: group.lift }))).toEqual([
      { sex: 'female', lift: null },
      { sex: 'male', lift: null },
    ]);
  });

  it('orders within a sex by flight, then lot', () => {
    const groups = buildWeighInGroups(
      [
        entry('a', { sex: 'female', flightSortOrder: 1, lotNumber: 5 }),
        entry('b', { sex: 'female', flightSortOrder: 0, lotNumber: 9 }),
        entry('c', { sex: 'female', flightSortOrder: 1, lotNumber: 2 }),
      ],
      false,
    );
    expect(groups[0].entries.map((row) => row.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts missing flight and lot values last', () => {
    const groups = buildWeighInGroups(
      [
        entry('none', { sex: 'female', flightSortOrder: null, lotNumber: null }),
        entry('flighted', { sex: 'female', flightSortOrder: 0, lotNumber: 1 }),
      ],
      false,
    );
    expect(groups[0].entries.map((row) => row.id)).toEqual(['flighted', 'none']);
  });

  it('ignores team lift entirely when not a team comp', () => {
    const groups = buildWeighInGroups(
      [
        entry('a', { sex: 'male', teamLift: 'deadlift', lotNumber: 2 }),
        entry('b', { sex: 'male', teamLift: 'squat', lotNumber: 1 }),
      ],
      false,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('omits sexes with no entries', () => {
    const groups = buildWeighInGroups([entry('f', { sex: 'female' })], false);
    expect(groups).toHaveLength(1);
    expect(groups[0].sex).toBe('female');
  });
});

describe('buildWeighInGroups (team comp)', () => {
  it('orders groups by lift (squat, bench, deadlift) then sex (female, male)', () => {
    const groups = buildWeighInGroups(
      [
        entry('dl-m', { sex: 'male', teamLift: 'deadlift' }),
        entry('sq-f', { sex: 'female', teamLift: 'squat' }),
        entry('bn-m', { sex: 'male', teamLift: 'bench' }),
        entry('sq-m', { sex: 'male', teamLift: 'squat' }),
        entry('bn-f', { sex: 'female', teamLift: 'bench' }),
        entry('dl-f', { sex: 'female', teamLift: 'deadlift' }),
      ],
      true,
    );
    expect(groups.map((group) => ({ lift: group.lift, sex: group.sex }))).toEqual([
      { lift: 'squat', sex: 'female' },
      { lift: 'squat', sex: 'male' },
      { lift: 'bench', sex: 'female' },
      { lift: 'bench', sex: 'male' },
      { lift: 'deadlift', sex: 'female' },
      { lift: 'deadlift', sex: 'male' },
    ]);
  });

  it('orders within a lift/sex group by flight, then lot', () => {
    const groups = buildWeighInGroups(
      [
        entry('a', { sex: 'female', teamLift: 'squat', flightSortOrder: 1, lotNumber: 1 }),
        entry('b', { sex: 'female', teamLift: 'squat', flightSortOrder: 0, lotNumber: 4 }),
        entry('c', { sex: 'female', teamLift: 'squat', flightSortOrder: 0, lotNumber: 2 }),
      ],
      true,
    );
    expect(groups[0].entries.map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });

  it('places entries with no team role in a trailing group, after every role', () => {
    const groups = buildWeighInGroups(
      [
        entry('unassigned-f', { sex: 'female', teamLift: null }),
        entry('squat-f', { sex: 'female', teamLift: 'squat' }),
        entry('unassigned-m', { sex: 'male', teamLift: null }),
      ],
      true,
    );
    expect(groups.map((group) => ({ lift: group.lift, sex: group.sex }))).toEqual([
      { lift: 'squat', sex: 'female' },
      { lift: null, sex: 'female' },
      { lift: null, sex: 'male' },
    ]);
  });
});

describe('buildWeighInGroups (edge cases)', () => {
  it('returns no groups for an empty roster', () => {
    expect(buildWeighInGroups([], false)).toEqual([]);
    expect(buildWeighInGroups([], true)).toEqual([]);
  });
});

function group<T>(sex: WeighInGroup<T>['sex'], lift: WeighInGroup<T>['lift']): WeighInGroup<T> {
  return { sex, lift, entries: [] };
}

const FULL_POWER: Lifts = { squat: true, bench: true, deadlift: true };

describe('weighInGroupLabel', () => {
  it('labels a non-team group by sex only', () => {
    expect(weighInGroupLabel(group('female', null), false)).toBe('Female');
    expect(weighInGroupLabel(group('male', null), false)).toBe('Male');
  });

  it('labels a team role group by lift and sex', () => {
    expect(weighInGroupLabel(group('female', 'squat'), true)).toBe('Squat · Female');
    expect(weighInGroupLabel(group('male', 'deadlift'), true)).toBe('Deadlift · Male');
  });

  it('labels a role-less team group distinctly', () => {
    expect(weighInGroupLabel(group('female', null), true)).toBe('No team role · Female');
  });
});

describe('liftsForWeighInGroup', () => {
  it('returns the comp lifts for a non-team group', () => {
    expect(liftsForWeighInGroup(group('male', null), FULL_POWER, false)).toEqual(FULL_POWER);
  });

  it('narrows a team role group to just its lift', () => {
    expect(liftsForWeighInGroup(group('male', 'squat'), FULL_POWER, true)).toEqual({
      squat: true,
      bench: false,
      deadlift: false,
    });
    expect(liftsForWeighInGroup(group('female', 'bench'), FULL_POWER, true)).toEqual({
      squat: false,
      bench: true,
      deadlift: false,
    });
  });

  it('returns the full comp lifts for a role-less team group (so it is never dropped)', () => {
    expect(liftsForWeighInGroup(group('male', null), FULL_POWER, true)).toEqual(FULL_POWER);
  });
});
