import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/rota', () => ({
  submitRotaSignupAction: vi.fn(),
}));

import { submitRotaSignupAction } from '@/actions/rota';
import { PublicRotaBoard, type PublicRotaSection } from '@/components/rota/public-rota-board';

const submitAction = vi.mocked(submitRotaSignupAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

const sections: PublicRotaSection[] = [
  {
    id: 'sec-1',
    day_label: 'Sat',
    title: 'AM',
    subtitle: 'Weigh-in 8–9:30',
    sort_order: 0,
    roles: [
      { id: 'role-mc', title: 'MC', arrive_by: '9:30am', capacity: 1, sort_order: 0, names: ['Farida'] },
      {
        id: 'role-spot',
        title: 'Spotters / Loaders',
        arrive_by: '9:30am',
        capacity: 4,
        sort_order: 1,
        names: ['Mike R'],
      },
    ],
  },
];

function renderBoard(boardSections: PublicRotaSection[], withdrawalContact: string | null = null) {
  return render(
    <PublicRotaBoard competitionId={COMP_ID} sections={boardSections} withdrawalContact={withdrawalContact} />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PublicRotaBoard', () => {
  it('renders roles with their signed-up names, open slots and a full marker', () => {
    renderBoard(sections);
    expect(screen.getByText('MC')).toBeInTheDocument();
    expect(screen.getByText('Farida')).toBeInTheDocument();
    expect(screen.getByText('Spotters / Loaders')).toBeInTheDocument();
    expect(screen.getByText('Mike R')).toBeInTheDocument();
    // MC is at capacity (1/1) → Full, no sign-up; Spotters has 3 open slots.
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getAllByText('Open')).toHaveLength(3);
  });

  it('shows an empty state when the rota has no columns', () => {
    renderBoard([]);
    expect(screen.getByText(/ready yet/)).toBeInTheDocument();
  });

  it('shows the withdrawal-contact line when set', () => {
    renderBoard(sections, 'email rota@club.org to change a slot');
    expect(screen.getByText(/withdraw or change a slot/)).toBeInTheDocument();
    expect(screen.getByText(/rota@club.org/)).toBeInTheDocument();
  });

  it('reveals the sign-up form only for the chosen open role', () => {
    renderBoard(sections);
    expect(screen.queryByLabelText('Your name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });

  it('submits a sign-up and shows the confirmation', async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '07700900000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Spotters / Loaders' }));

    await waitFor(() =>
      expect(submitAction).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        roleId: 'role-spot',
        name: 'Dana',
        email: 'dana@example.com',
        phone: '07700900000',
        website: '',
      }),
    );
    expect(await screen.findByText(/signed up for/)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('keeps the form and shows the message when the slot was just filled', async () => {
    submitAction.mockResolvedValue({
      status: 'error',
      message: 'Sorry — that slot was just filled. Please pick another.',
    });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '07700900000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Spotters / Loaders' }));

    await waitFor(() => expect(screen.getByText(/just filled/)).toBeInTheDocument());
    // The form stays so the volunteer can read the message and pick another slot.
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('recovers from a thrown action instead of getting stuck on "Signing up…"', async () => {
    submitAction.mockRejectedValue(new Error('network down'));
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '07700900000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Spotters / Loaders' }));

    await waitFor(() => expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument());
    // The button is re-enabled, not stuck disabled.
    expect(screen.getByRole('button', { name: 'Sign up for Spotters / Loaders' })).not.toBeDisabled();
  });
});
