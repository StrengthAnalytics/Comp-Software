import { describe, expect, it } from 'vitest';
import {
  buildSetupChecklist,
  checklistProgress,
  type SetupChecklistInput,
} from '@/lib/comps/setup-checklist';

const base: SetupChecklistInput = {
  compId: 'comp-1',
  slug: 'summer-open',
  isTeamCompetition: false,
  usesIpfCategorySet: false,
  hasStartDate: true,
  ageCategoryCount: 10,
  weightClassCount: 18,
  platformCount: 1,
  sessionCount: 2,
  entryCount: 24,
  entriesInFlights: 24,
  entriesWeighedIn: 24,
  teamCount: 0,
};

function item(input: SetupChecklistInput, key: string) {
  const found = buildSetupChecklist(input).find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`No checklist item ${key}`);
  }
  return found;
}

describe('buildSetupChecklist', () => {
  it('marks every step done for a fully prepared comp', () => {
    const items = buildSetupChecklist(base);
    expect(items.map((entry) => entry.state)).toEqual(Array.from({ length: 7 }, () => 'done'));
  });

  it('marks every step todo for a brand-new comp with no date', () => {
    const items = buildSetupChecklist({
      ...base,
      hasStartDate: false,
      ageCategoryCount: 0,
      weightClassCount: 0,
      platformCount: 0,
      sessionCount: 0,
      entryCount: 0,
      entriesInFlights: 0,
      entriesWeighedIn: 0,
    });
    expect(items.map((entry) => entry.state)).toEqual(Array.from({ length: 7 }, () => 'todo'));
  });

  it('orders the steps with register lifters before platforms & sessions', () => {
    expect(buildSetupChecklist(base).map((entry) => entry.key)).toEqual([
      'date',
      'age-categories',
      'weight-classes',
      'lifters',
      'sessions',
      'flights',
      'weigh-in',
    ]);
  });

  it('explains that registration is blocked until the comp has a date', () => {
    const lifterStep = item({ ...base, hasStartDate: false, entryCount: 0 }, 'lifters');
    expect(lifterStep.state).toBe('todo');
    expect(lifterStep.detail).toBe('Needs a competition date first');
  });

  it('reports flight assignment as partial with an x-of-y detail', () => {
    const flights = item({ ...base, entriesInFlights: 10 }, 'flights');
    expect(flights.state).toBe('partial');
    expect(flights.detail).toBe('10 of 24 lifters in flights');
  });

  it('gates the flight and weigh-in steps on having lifters at all', () => {
    const input = { ...base, entryCount: 0, entriesInFlights: 0, entriesWeighedIn: 0 };
    expect(item(input, 'flights')).toMatchObject({ state: 'todo', detail: 'Register lifters first' });
    expect(item(input, 'weigh-in')).toMatchObject({ state: 'todo', detail: 'Register lifters first' });
  });

  it('counts weigh-in done only when every lifter is weighed', () => {
    expect(item({ ...base, entriesWeighedIn: 23 }, 'weigh-in').state).toBe('partial');
    expect(item({ ...base, entriesWeighedIn: 24 }, 'weigh-in').state).toBe('done');
  });

  it('omits the category steps for an IPF-federation comp', () => {
    const items = buildSetupChecklist({ ...base, usesIpfCategorySet: true });
    expect(items.some((entry) => entry.key === 'age-categories')).toBe(false);
    expect(items.some((entry) => entry.key === 'weight-classes')).toBe(false);
    expect(items).toHaveLength(5);
    // The categories aren't counted as outstanding (or complete) work — they're simply not steps.
    expect(checklistProgress(items)).toEqual({ done: 5, total: 5 });
  });

  it('keeps the category steps for a custom-federation comp with none yet', () => {
    const items = buildSetupChecklist({
      ...base,
      usesIpfCategorySet: false,
      ageCategoryCount: 0,
      weightClassCount: 0,
    });
    expect(items.find((entry) => entry.key === 'age-categories')?.state).toBe('todo');
    expect(items.find((entry) => entry.key === 'weight-classes')?.state).toBe('todo');
  });

  it('omits the teams step for an individual comp and includes it for a team comp', () => {
    expect(buildSetupChecklist(base).some((entry) => entry.key === 'teams')).toBe(false);
    const teamItems = buildSetupChecklist({ ...base, isTeamCompetition: true, teamCount: 4 });
    const teams = teamItems.find((entry) => entry.key === 'teams');
    expect(teams).toMatchObject({ state: 'done', detail: '4 teams' });
    expect(teamItems.find((entry) => entry.key === 'flights')?.label).toBe('Assign teams to flights');
  });

  it('links each step at the screen that completes it', () => {
    const items = buildSetupChecklist(base);
    expect(items.find((entry) => entry.key === 'date')?.href).toBe('/comps/comp-1/edit');
    expect(items.find((entry) => entry.key === 'sessions')?.href).toBe('/summer-open/flights');
    expect(items.find((entry) => entry.key === 'weigh-in')?.href).toBe('/summer-open/weigh-in');
  });

  it('uses singular wording for a single lifter, session and platform', () => {
    const input = {
      ...base,
      sessionCount: 1,
      platformCount: 1,
      entryCount: 1,
      entriesInFlights: 1,
      entriesWeighedIn: 1,
    };
    expect(item(input, 'sessions').detail).toBe('1 session on 1 platform');
    expect(item(input, 'lifters').detail).toBe('1 lifter registered');
    expect(item(input, 'weigh-in').detail).toBe('All 1 lifter weighed in');
  });
});

describe('checklistProgress', () => {
  it('counts only fully done steps', () => {
    const items = buildSetupChecklist({ ...base, entriesWeighedIn: 3, entriesInFlights: 0 });
    expect(checklistProgress(items)).toEqual({ done: 5, total: 7 });
  });
});
