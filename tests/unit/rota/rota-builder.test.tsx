import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Stub the router refresh and every rota action so the test drives the builder deterministically.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/rota', () => ({
  addRotaRoleToAllSectionsAction: vi.fn(),
  addRotaSignupAction: vi.fn(),
  createRotaRoleAction: vi.fn(),
  createRotaSectionAction: vi.fn(),
  deleteRotaRoleAction: vi.fn(),
  deleteRotaSectionAction: vi.fn(),
  duplicateRotaSectionToSessionAction: vi.fn(),
  generateRotaFromSessionsAction: vi.fn(),
  moveRotaRoleAction: vi.fn(),
  moveRotaSectionAction: vi.fn(),
  moveRotaSignupAction: vi.fn(),
  removeRotaSignupAction: vi.fn(),
  resetRotaAction: vi.fn(),
  resolveRotaChangeRequestAction: vi.fn(),
  setRotaOpenAction: vi.fn(),
  setRotaStyleAction: vi.fn(),
  setRotaWithdrawalContactAction: vi.fn(),
  updateRotaRoleAction: vi.fn(),
  updateRotaSectionAction: vi.fn(),
}));
// The admin builder subscribes to live sign-ups and change requests; stub the hooks so the test needs
// no Supabase client.
vi.mock('@/lib/realtime/use-rota-signups-subscription', () => ({
  useRotaSignupsSubscription: vi.fn(),
}));
vi.mock('@/lib/realtime/use-rota-change-requests-subscription', () => ({
  useRotaChangeRequestsSubscription: vi.fn(),
}));

import {
  addRotaRoleToAllSectionsAction,
  addRotaSignupAction,
  createRotaRoleAction,
  createRotaSectionAction,
  deleteRotaRoleAction,
  duplicateRotaSectionToSessionAction,
  generateRotaFromSessionsAction,
  moveRotaSignupAction,
  removeRotaSignupAction,
  resolveRotaChangeRequestAction,
  setRotaOpenAction,
  updateRotaRoleAction,
} from '@/actions/rota';
import { DEFAULT_ROTA_ROLE_TEMPLATE } from '@/lib/constants';
import { RotaBuilder, type RotaBuilderSection } from '@/components/rota/rota-builder';
import type { RotaChangeRequestSummary } from '@/components/rota/rota-change-requests';

const addRoleToAll = vi.mocked(addRotaRoleToAllSectionsAction);
const addSignup = vi.mocked(addRotaSignupAction);
const createRole = vi.mocked(createRotaRoleAction);
const createSection = vi.mocked(createRotaSectionAction);
const deleteRole = vi.mocked(deleteRotaRoleAction);
const duplicateAction = vi.mocked(duplicateRotaSectionToSessionAction);
const generateAction = vi.mocked(generateRotaFromSessionsAction);
const moveSignup = vi.mocked(moveRotaSignupAction);
const removeSignup = vi.mocked(removeRotaSignupAction);
const resolveRequest = vi.mocked(resolveRotaChangeRequestAction);
const setOpen = vi.mocked(setRotaOpenAction);
const updateRole = vi.mocked(updateRotaRoleAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

const sectionWithRole: RotaBuilderSection = {
  id: 'sec-1',
  session_id: null,
  day_label: 'Sat',
  title: 'AM',
  subtitle: null,
  sort_order: 0,
  roles: [
    {
      id: 'role-1',
      title: 'MC',
      arrive_by: '9:30am',
      arrive_basis: null,
      capacity: 1,
      sort_order: 0,
      signups: [
        { id: 'su-1', name: 'Mike R', email: 'mike@example.com', phone: '07700900000', created_at: '2026-06-15T10:00:00Z' },
      ],
    },
  ],
};

const sectionOpenRole: RotaBuilderSection = {
  id: 'sec-1',
  session_id: null,
  day_label: 'Sat',
  title: 'AM',
  subtitle: null,
  sort_order: 0,
  roles: [{ id: 'role-1', title: 'Refs', arrive_by: null, arrive_basis: null, capacity: 4, sort_order: 0, signups: [] }],
};

const emptySection: RotaBuilderSection = {
  id: 'sec-1',
  session_id: null,
  day_label: 'Sat',
  title: 'AM',
  subtitle: null,
  sort_order: 0,
  roles: [],
};

function renderBuilder(
  sections: RotaBuilderSection[],
  initialOpen = false,
  sessionCount = 0,
  pendingSessionCount = 0,
  availableSessions: { id: string; name: string }[] = [],
  changeRequests: RotaChangeRequestSummary[] = [],
) {
  return render(
    <RotaBuilder
      competitionId={COMP_ID}
      competitionName="Summer Open"
      slug="summer-open"
      competitionStatus="draft"
      initialOpen={initialOpen}
      initialWithdrawalContact={null}
      sessionCount={sessionCount}
      pendingSessionCount={pendingSessionCount}
      availableSessions={availableSessions}
      sections={sections}
      changeRequests={changeRequests}
    />,
  );
}

// The structure editors live on the Edit layout tab (the Rota tab opens first once there are columns).
function openLayoutTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Edit layout' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


// Two columns: Sat AM's MC is taken (Mike R), Sat PM's MC is open — a move target.
const twoSections: RotaBuilderSection[] = [
  sectionWithRole,
  {
    id: 'sec-2',
    session_id: null,
    day_label: 'Sat',
    title: 'PM',
    subtitle: null,
    sort_order: 1,
    roles: [{ id: 'role-2', title: 'MC', arrive_by: '12:30pm', arrive_basis: null, capacity: 1, sort_order: 0, signups: [] }],
  },
];

// A column built from a session follows it: the heading is read-only and jobs can follow its clock.
const sessionSection: RotaBuilderSection = {
  ...sectionWithRole,
  session_id: 'session-1',
  subtitle: 'Weigh-in 7:00am · Lift-off 9:00am',
  roles: [
    { ...sectionWithRole.roles[0], arrive_by: '8:30am', arrive_basis: 'lift_off' },
    { id: 'role-w', title: 'Weigh-in', arrive_by: '6:50am', arrive_basis: 'weigh_in', capacity: 1, sort_order: 1, signups: [] },
  ],
};

describe('RotaBuilder — layout', () => {
  it('renders the sign-up link and, under Edit layout, each role with its fill count', () => {
    renderBuilder([sectionWithRole]);
    expect(screen.getByText('/summer-open/volunteer')).toBeInTheDocument();
    openLayoutTab();
    const layout = screen.getByRole('tabpanel');
    expect(within(layout).getByDisplayValue('MC')).toBeInTheDocument();
    expect(within(layout).getByText('1 / 1 filled')).toBeInTheDocument();
  });

  it('opens on Edit layout with a teaching empty state when there are no columns', () => {
    renderBuilder([]);
    expect(screen.getByRole('tab', { name: 'Edit layout' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No rota columns yet')).toBeInTheDocument();
  });

  it('toggles sign-ups open through the switch', async () => {
    setOpen.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole], false);

    fireEvent.click(screen.getByRole('switch', { name: 'Accepting sign-ups' }));

    await waitFor(() => expect(setOpen).toHaveBeenCalledWith({ competitionId: COMP_ID, open: true }));
  });

  it('adds a column', async () => {
    createSection.mockResolvedValue({ status: 'ok', data: { id: 'sec-new' } });
    renderBuilder([]);

    fireEvent.change(screen.getByLabelText('New column day label'), { target: { value: 'Sun' } });
    fireEvent.change(screen.getByLabelText('New column heading'), { target: { value: 'PM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));

    await waitFor(() =>
      expect(createSection).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        dayLabel: 'Sun',
        title: 'PM',
        subtitle: '',
      }),
    );
  });

  it('adds a role with a number of spaces to a column', async () => {
    createRole.mockResolvedValue({ status: 'ok', data: { id: 'role-new' } });
    renderBuilder([emptySection]);
    openLayoutTab();

    fireEvent.change(screen.getByLabelText('New role title'), { target: { value: 'Refs' } });
    fireEvent.change(screen.getByLabelText('New role spaces'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        sectionId: 'sec-1',
        title: 'Refs',
        arriveBy: '',
        arriveBasis: null,
        capacity: 4,
      }),
    );
  });

  it("shows a session column's heading read-only, pointing to Sessions & flights", () => {
    renderBuilder([sessionSection]);
    openLayoutTab();

    expect(screen.queryByLabelText('Column heading')).not.toBeInTheDocument();
    const header = screen.getByText('Weigh-in 7:00am · Lift-off 9:00am').parentElement as HTMLElement;
    expect(within(header).getByText(/Follows the session/)).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Sessions & flights' })).toHaveAttribute(
      'href',
      '/summer-open/flights',
    );
  });

  it('lets a job in a session column follow weigh-in instead of lift-off', async () => {
    updateRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sessionSection]);
    openLayoutTab();

    const [mcRow] = screen.getAllByLabelText('Role title').map((input) => input.closest('div') as HTMLElement);
    const select = within(mcRow).getByLabelText('Arrive-by time');
    expect(select).toHaveValue('lift_off');
    expect(within(mcRow).getByText('8:30am')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'weigh_in' } });
    expect(within(mcRow).getByText('Set on save')).toBeInTheDocument();
    fireEvent.click(within(mcRow).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith(expect.objectContaining({ id: 'role-1', arriveBasis: 'weigh_in' })),
    );
  });

  it('lets a job in a session column switch to a typed time', async () => {
    updateRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sessionSection]);
    openLayoutTab();

    const [mcRow] = screen.getAllByLabelText('Role title').map((input) => input.closest('div') as HTMLElement);
    fireEvent.change(within(mcRow).getByLabelText('Arrive-by time'), { target: { value: 'manual' } });
    fireEvent.change(within(mcRow).getByLabelText('Arrive by'), { target: { value: '8:00am' } });
    fireEvent.click(within(mcRow).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'role-1', arriveBy: '8:00am', arriveBasis: null }),
      ),
    );
  });

  it('adds a job to a session column following lift-off by default', async () => {
    createRole.mockResolvedValue({ status: 'ok', data: { id: 'role-new' } });
    renderBuilder([sessionSection]);
    openLayoutTab();

    expect(screen.getByLabelText('New role arrive-by time')).toHaveValue('lift_off');
    fireEvent.change(screen.getByLabelText('New role title'), { target: { value: 'Commentary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ title: 'Commentary', arriveBasis: 'lift_off' })),
    );
  });

  it('adds a role to every column at once', async () => {
    addRoleToAll.mockResolvedValue({ status: 'ok', data: { added: 2 } });
    renderBuilder(twoSections);
    openLayoutTab();

    fireEvent.change(screen.getByLabelText('Role for every column'), { target: { value: 'Commentary' } });
    fireEvent.change(screen.getByLabelText('Spaces for every column'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to every column' }));

    await waitFor(() =>
      expect(addRoleToAll).toHaveBeenCalledWith({ competitionId: COMP_ID, title: 'Commentary', capacity: 2 }),
    );
    expect(await screen.findByText('Added to 2 columns.')).toBeInTheDocument();
  });

  it('saves an edited number of spaces', async () => {
    updateRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole]);
    openLayoutTab();

    const row = screen.getByLabelText('Role title').closest('div') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('Spaces'), { target: { value: '3' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith({
        id: 'role-1',
        title: 'MC',
        arriveBy: '9:30am',
        arriveBasis: null,
        capacity: 3,
      }),
    );
  });

  it("shows the server's message when the spaces would drop below the people signed up", async () => {
    updateRole.mockResolvedValue({
      status: 'error',
      message: '2 people are signed up for this role. Remove or move someone before lowering the spaces to 1.',
    });
    renderBuilder([sectionWithRole]);
    openLayoutTab();

    const row = screen.getByLabelText('Role title').closest('div') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('Role title'), { target: { value: 'MC (main)' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/before lowering the spaces/)).toBeInTheDocument();
  });

  it('disables Save when the number of spaces is cleared to an invalid value', () => {
    renderBuilder([sectionWithRole]);
    openLayoutTab();
    const row = screen.getByLabelText('Role title').closest('div') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('Spaces'), { target: { value: '' } });
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('requires a second click to delete a role that has sign-ups', async () => {
    deleteRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole]);
    openLayoutTab();

    const row = screen.getByLabelText('Role title').closest('div') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    // First click only arms the confirm — nothing is deleted yet.
    expect(deleteRole).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith({ id: 'role-1' }));
  });

  it('generates columns from sessions with only the ticked roles', async () => {
    generateAction.mockResolvedValue({ status: 'ok', data: { created: 3 } });
    renderBuilder([], false, 3, 3);

    // Untick one default role, then generate.
    fireEvent.click(screen.getByLabelText('Refs'));
    fireEvent.click(screen.getByRole('button', { name: /Generate 3 columns/ }));

    await waitFor(() => expect(generateAction).toHaveBeenCalled());
    const arg = generateAction.mock.calls[0][0];
    expect(arg.competitionId).toBe(COMP_ID);
    const titles = arg.roles.map((role) => role.title);
    expect(titles).toContain('MC');
    expect(titles).toContain('Livestream');
    expect(titles).not.toContain('Refs');
    expect(arg.roles).toHaveLength(DEFAULT_ROTA_ROLE_TEMPLATE.length - 1);
    // Each role carries the arrive-by basis the action computes the time from.
    expect(arg.roles.find((role) => role.title === 'MC')?.arriveBasis).toBe('lift_off');
    expect(arg.roles.find((role) => role.title === 'Weigh-in')?.arriveBasis).toBe('weigh_in');
  });

  it('points to Sessions & flights when the comp has no sessions', () => {
    renderBuilder([], false, 0, 0);
    expect(screen.getByRole('link', { name: 'Sessions & flights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull();
  });

  it('offers a contacts CSV export once anyone has signed up', () => {
    renderBuilder([sectionWithRole]);
    expect(screen.getByRole('button', { name: 'Export contacts (CSV)' })).toBeInTheDocument();
    expect(screen.getByText('1 volunteer signed up.')).toBeInTheDocument();
  });

  it("duplicates a column's roles onto a chosen column-less session", async () => {
    duplicateAction.mockResolvedValue({ status: 'ok', data: { id: 'sec-new' } });
    renderBuilder([sectionWithRole], false, 2, 1, [{ id: 'sess-new', name: 'Sunday PM' }]);
    openLayoutTab();

    fireEvent.change(screen.getByLabelText('Duplicate to session'), { target: { value: 'sess-new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() =>
      expect(duplicateAction).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        sourceSectionId: 'sec-1',
        targetSessionId: 'sess-new',
      }),
    );
  });

  it('hides the duplicate control when every session already has a column', () => {
    renderBuilder([sectionWithRole]);
    expect(screen.queryByLabelText('Duplicate to session')).toBeNull();
  });
});

describe('RotaBuilder — rota grid', () => {
  it('opens on the Rota tab with volunteers as green names in the grid', () => {
    renderBuilder(twoSections);
    expect(screen.getByRole('tab', { name: 'Rota' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /Mike R, Sat AM · MC/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a helper to Sat PM · MC' })).toBeInTheDocument();
  });

  it("shows a volunteer's contact details and removes them after a confirm", async () => {
    removeSignup.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole]);

    fireEvent.click(screen.getByRole('button', { name: /Mike R, Sat AM · MC/ }));
    const dialog = screen.getByRole('dialog', { name: 'Mike R' });
    expect(within(dialog).getByRole('link', { name: 'mike@example.com' })).toHaveAttribute(
      'href',
      'mailto:mike@example.com',
    );
    expect(within(dialog).getByRole('link', { name: '07700900000' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from this slot' }));
    expect(removeSignup).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove Mike R' }));
    await waitFor(() => expect(removeSignup).toHaveBeenCalledWith({ id: 'su-1' }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('moves a volunteer to another slot with space', async () => {
    moveSignup.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder(twoSections);

    fireEvent.click(screen.getByRole('button', { name: /Mike R, Sat AM · MC/ }));
    const dialog = screen.getByRole('dialog', { name: 'Mike R' });
    fireEvent.change(within(dialog).getByLabelText('Move to another slot'), { target: { value: 'role-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(moveSignup).toHaveBeenCalledWith({ id: 'su-1', roleId: 'role-2' }));
  });

  it('lets the admin add a helper by name only', async () => {
    addSignup.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionOpenRole]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add a helper to Sat AM · Refs' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Add a helper' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Dana' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(addSignup).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        roleId: 'role-1',
        name: 'Dana',
        email: '',
        phone: '',
      }),
    );
  });

  it('shows "Not given" for a helper added without contact details', () => {
    const nameOnly: RotaBuilderSection = {
      ...sectionWithRole,
      roles: [
        {
          ...sectionWithRole.roles[0],
          signups: [{ id: 'su-2', name: 'Beth', email: null, phone: null, created_at: '2026-06-15T10:00:00Z' }],
        },
      ],
    };
    renderBuilder([nameOnly]);
    fireEvent.click(screen.getByRole('button', { name: /Beth, Sat AM · MC/ }));
    expect(screen.getAllByText('Not given')).toHaveLength(2);
  });
});

describe('RotaBuilder — change requests', () => {
  const dropOut: RotaChangeRequestSummary = {
    id: 'req-1',
    role_id: 'role-1',
    name: 'mike r',
    contact: 'mike@example.com',
    kind: 'drop_out',
    message: null,
    created_at: '2026-10-05T14:30:00Z',
  };

  it('lists open requests with a count on the Rota tab', () => {
    renderBuilder([sectionWithRole], false, 0, 0, [], [dropOut]);
    expect(screen.getByText('Change requests (1)')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /Rota/ })).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Sat AM · MC')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mike@example.com' })).toBeInTheDocument();
  });

  it('removes the matching volunteer and marks a drop-out done in one click', async () => {
    removeSignup.mockResolvedValue({ status: 'ok', data: undefined });
    resolveRequest.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole], false, 0, 0, [], [dropOut]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mike R and mark done' }));

    await waitFor(() => expect(resolveRequest).toHaveBeenCalledWith({ id: 'req-1' }));
    expect(removeSignup).toHaveBeenCalledWith({ id: 'su-1' });
  });

  it('marks a request done without changing the rota', async () => {
    resolveRequest.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole], false, 0, 0, [], [{ ...dropOut, kind: 'swap', message: 'PM instead' }]);

    expect(screen.queryByRole('button', { name: /Remove Mike R/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    await waitFor(() => expect(resolveRequest).toHaveBeenCalledWith({ id: 'req-1' }));
    expect(removeSignup).not.toHaveBeenCalled();
  });
});
