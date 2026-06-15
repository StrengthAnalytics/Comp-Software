import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Stub the router refresh and every rota action so the test drives the builder deterministically.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/rota', () => ({
  createRotaRoleAction: vi.fn(),
  createRotaSectionAction: vi.fn(),
  deleteRotaRoleAction: vi.fn(),
  deleteRotaSectionAction: vi.fn(),
  generateRotaFromSessionsAction: vi.fn(),
  moveRotaRoleAction: vi.fn(),
  moveRotaSectionAction: vi.fn(),
  setRotaOpenAction: vi.fn(),
  setRotaWithdrawalContactAction: vi.fn(),
  updateRotaRoleAction: vi.fn(),
  updateRotaSectionAction: vi.fn(),
}));

import {
  createRotaRoleAction,
  createRotaSectionAction,
  deleteRotaRoleAction,
  generateRotaFromSessionsAction,
  setRotaOpenAction,
  updateRotaRoleAction,
} from '@/actions/rota';
import { DEFAULT_ROTA_ROLE_TEMPLATE } from '@/lib/constants';
import { RotaBuilder, type RotaBuilderSection } from '@/components/rota/rota-builder';

const createRole = vi.mocked(createRotaRoleAction);
const createSection = vi.mocked(createRotaSectionAction);
const deleteRole = vi.mocked(deleteRotaRoleAction);
const generateAction = vi.mocked(generateRotaFromSessionsAction);
const setOpen = vi.mocked(setRotaOpenAction);
const updateRole = vi.mocked(updateRotaRoleAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

const sectionWithRole: RotaBuilderSection = {
  id: 'sec-1',
  day_label: 'Sat',
  title: 'AM',
  subtitle: null,
  sort_order: 0,
  roles: [{ id: 'role-1', title: 'MC', arrive_by: '9:30am', capacity: 1, sort_order: 0, signupCount: 1 }],
};

const emptySection: RotaBuilderSection = {
  id: 'sec-1',
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
) {
  return render(
    <RotaBuilder
      competitionId={COMP_ID}
      slug="summer-open"
      competitionStatus="draft"
      initialOpen={initialOpen}
      initialWithdrawalContact={null}
      sessionCount={sessionCount}
      pendingSessionCount={pendingSessionCount}
      sections={sections}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RotaBuilder', () => {
  it('renders the sign-up link and each role with its fill count', () => {
    renderBuilder([sectionWithRole]);
    expect(screen.getByText('/summer-open/volunteer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('MC')).toBeInTheDocument();
    expect(screen.getByText('1 / 1 filled')).toBeInTheDocument();
  });

  it('shows a teaching empty state when there are no columns', () => {
    renderBuilder([]);
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

  it('adds a role with a slot count to a column', async () => {
    createRole.mockResolvedValue({ status: 'ok', data: { id: 'role-new' } });
    renderBuilder([emptySection]);

    fireEvent.change(screen.getByLabelText('New role title'), { target: { value: 'Refs' } });
    fireEvent.change(screen.getByLabelText('New role slots'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        sectionId: 'sec-1',
        title: 'Refs',
        arriveBy: '',
        capacity: 4,
      }),
    );
  });

  it('saves an edited role capacity', async () => {
    updateRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole]);

    const row = screen.getByLabelText('Role title').closest('div') as HTMLElement;
    fireEvent.change(within(row).getByLabelText('Slots'), { target: { value: '3' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith({ id: 'role-1', title: 'MC', arriveBy: '9:30am', capacity: 3 }),
    );
  });

  it('requires a second click to delete a role that has sign-ups', async () => {
    deleteRole.mockResolvedValue({ status: 'ok', data: undefined });
    renderBuilder([sectionWithRole]);

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
    expect(titles).not.toContain('Refs');
    expect(arg.roles).toHaveLength(DEFAULT_ROTA_ROLE_TEMPLATE.length - 1);
  });

  it('points to Sessions & flights when the comp has no sessions', () => {
    renderBuilder([], false, 0, 0);
    expect(screen.getByRole('link', { name: 'Sessions & flights' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull();
  });
});
