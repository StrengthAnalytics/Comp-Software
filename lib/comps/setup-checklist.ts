// The Checklist page's setup checklist: turns a comp's current data counts into an ordered list of
// meet-preparation steps with a done/partial/todo state and a link to the screen that completes
// each one. Pure — the page gathers the counts, this derives the story they tell — so the rules a
// first-time meet director is guided through are unit-tested rather than living in JSX.

export type ChecklistState = 'done' | 'partial' | 'todo';

export type ChecklistItem = {
  key: string;
  label: string;
  state: ChecklistState;
  // One short line of context: a count when the step is done/underway, what unblocks it when not.
  detail: string;
  href: string;
};

export type SetupChecklistInput = {
  compId: string;
  slug: string;
  isTeamCompetition: boolean;
  // IPF-federation comps get the standard category set seeded and locked at creation, so the
  // age-category and weight-class steps are not part of their setup work and are omitted.
  usesIpfCategorySet: boolean;
  hasStartDate: boolean;
  ageCategoryCount: number;
  weightClassCount: number;
  platformCount: number;
  sessionCount: number;
  entryCount: number;
  entriesInFlights: number;
  entriesWeighedIn: number;
  teamCount: number;
};

function lifters(count: number): string {
  return count === 1 ? '1 lifter' : `${count} lifters`;
}

// Done / partial / todo for an "x of all lifters" step, with the no-lifters-yet case gated on the
// registration step rather than reading as an empty success.
function progressItem(
  doneCount: number,
  entryCount: number,
  doneDetail: string,
  partialDetail: string,
  todoDetail: string,
): { state: ChecklistState; detail: string } {
  if (entryCount === 0) {
    return { state: 'todo', detail: 'Register lifters first' };
  }
  if (doneCount >= entryCount) {
    return { state: 'done', detail: doneDetail };
  }
  if (doneCount > 0) {
    return { state: 'partial', detail: partialDetail };
  }
  return { state: 'todo', detail: todoDetail };
}

// "3 sessions on 1 platform" / "10 age categories" — count + correctly pluralised noun.
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildSetupChecklist(input: SetupChecklistInput): ChecklistItem[] {
  const setupHref = `/comps/${input.compId}/edit`;

  let liftersDetail = `${lifters(input.entryCount)} registered`;
  if (input.entryCount === 0) {
    liftersDetail = input.hasStartDate ? 'No lifters yet' : 'Needs a competition date first';
  }

  const teamsItem: ChecklistItem = {
    key: 'teams',
    label: 'Create teams',
    state: input.teamCount > 0 ? 'done' : 'todo',
    detail: input.teamCount > 0 ? counted(input.teamCount, 'team', 'teams') : 'No teams yet',
    href: `/${input.slug}/teams`,
  };

  // An IPF comp's categories are seeded and locked at creation — not setup work for the operator.
  const categorySteps: ChecklistItem[] = input.usesIpfCategorySet
    ? []
    : [
        {
          key: 'age-categories',
          label: 'Add age categories',
          state: input.ageCategoryCount > 0 ? 'done' : 'todo',
          detail:
            input.ageCategoryCount > 0
              ? counted(input.ageCategoryCount, 'age category', 'age categories')
              : 'None yet — add your own on Setup',
          href: setupHref,
        },
        {
          key: 'weight-classes',
          label: 'Add weight classes',
          state: input.weightClassCount > 0 ? 'done' : 'todo',
          detail:
            input.weightClassCount > 0
              ? counted(input.weightClassCount, 'weight class', 'weight classes')
              : 'None yet — add your own on Setup',
          href: setupHref,
        },
      ];

  return [
    {
      key: 'date',
      label: 'Set the competition date',
      state: input.hasStartDate ? 'done' : 'todo',
      detail: input.hasStartDate
        ? 'Date set'
        : 'Lifters cannot be registered until the comp has a date',
      href: setupHref,
    },
    ...categorySteps,
    {
      key: 'lifters',
      label: 'Register lifters',
      state: input.entryCount > 0 ? 'done' : 'todo',
      detail: liftersDetail,
      href: `/${input.slug}/entries`,
    },
    {
      key: 'sessions',
      label: 'Create platforms & sessions',
      state: input.sessionCount > 0 ? 'done' : 'todo',
      detail:
        input.sessionCount > 0
          ? `${counted(input.sessionCount, 'session', 'sessions')} on ${counted(input.platformCount, 'platform', 'platforms')}`
          : 'No sessions yet',
      href: `/${input.slug}/flights`,
    },
    ...(input.isTeamCompetition ? [teamsItem] : []),
    {
      key: 'flights',
      label: input.isTeamCompetition ? 'Assign teams to flights' : 'Assign lifters to flights',
      ...progressItem(
        input.entriesInFlights,
        input.entryCount,
        `All ${lifters(input.entryCount)} in flights`,
        `${input.entriesInFlights} of ${lifters(input.entryCount)} in flights`,
        'No lifters in flights yet',
      ),
      href: `/${input.slug}/flights`,
    },
    {
      key: 'weigh-in',
      label: 'Weigh in lifters',
      ...progressItem(
        input.entriesWeighedIn,
        input.entryCount,
        `All ${lifters(input.entryCount)} weighed in`,
        `${input.entriesWeighedIn} of ${lifters(input.entryCount)} weighed in`,
        'No lifters weighed in yet',
      ),
      href: `/${input.slug}/weigh-in`,
    },
  ];
}

// "N of M steps complete" for the checklist header. A partial step is underway, not complete.
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return {
    done: items.filter((item) => item.state === 'done').length,
    total: items.length,
  };
}
