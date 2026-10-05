import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/rota', () => ({
  submitRotaSignupAction: vi.fn(),
  submitRotaChangeRequestAction: vi.fn(),
}));

import { submitRotaChangeRequestAction, submitRotaSignupAction } from '@/actions/rota';
import { PublicRotaBoard, type PublicRotaSection } from '@/components/rota/public-rota-board';

const submitAction = vi.mocked(submitRotaSignupAction);
const changeAction = vi.mocked(submitRotaChangeRequestAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';
const STORAGE_KEY = 'rota-volunteer-details';

const sections: PublicRotaSection[] = [
  {
    id: 'sec-1',
    day_label: 'Sat',
    title: 'AM',
    subtitle: 'Weigh-in 07:00 · Lift-off 09:00',
    sort_order: 0,
    roles: [
      { id: 'role-mc', title: 'MC', arrive_by: '08:30', capacity: 1, sort_order: 0, names: ['Farida'] },
      {
        id: 'role-spot',
        title: 'Spotters / Loaders',
        arrive_by: '08:30',
        capacity: 4,
        sort_order: 1,
        names: ['Mike R'],
      },
      { id: 'role-weigh', title: 'Weigh-in', arrive_by: '06:50', capacity: 1, sort_order: 2, names: [] },
    ],
  },
  {
    id: 'sec-2',
    day_label: 'Sun',
    title: 'AM',
    subtitle: null,
    sort_order: 1,
    roles: [{ id: 'role-mc-sun', title: 'MC', arrive_by: '9:30am', capacity: 1, sort_order: 0, names: [] }],
  },
];

function renderBoard(boardSections: PublicRotaSection[], withdrawalContact: string | null = null) {
  return render(
    <PublicRotaBoard competitionId={COMP_ID} sections={boardSections} withdrawalContact={withdrawalContact} />,
  );
}

function fillSignupForm() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } });
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '07700900000' } });
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PublicRotaBoard — grid', () => {
  it('lays sessions out as columns under day banners, with names in filled slots', () => {
    renderBoard(sections);
    expect(screen.getByRole('columnheader', { name: 'Sat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sun' })).toBeInTheDocument();
    // One row per job across both columns.
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'MC',
      'Spotters / Loaders',
      'Weigh-in',
    ]);
    expect(screen.getByText('Farida')).toBeInTheDocument();
    expect(screen.getByText('Mike R')).toBeInTheDocument();
  });

  it('shows one sign-up button per open slot', () => {
    renderBoard(sections);
    // Spotters 3 open + Weigh-in 1 + Sun MC 1.
    expect(screen.getAllByRole('button', { name: /^Sign up for/ })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: 'Sign up for Sat AM · Spotters / Loaders' })).toHaveLength(3);
  });

  it('shows times in the 12-hour style, the crew time once and an odd one in its cell', () => {
    renderBoard(sections);
    expect(screen.getByText('Weigh-in 7:00am')).toBeInTheDocument();
    expect(screen.getByText('Lift-off 9:00am')).toBeInTheDocument();
    expect(screen.getByText('Arrive by 8:30am')).toBeInTheDocument();
    expect(screen.getByText('Arrive by 6:50am')).toBeInTheDocument();
  });

  it('counts filled slots per column', () => {
    renderBoard(sections);
    expect(screen.getByText('2 / 6 filled')).toBeInTheDocument();
    expect(screen.getByText('0 / 1 filled')).toBeInTheDocument();
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
});

describe('PublicRotaBoard — signing up', () => {
  it('opens a sign-up pop-up for the tapped slot', () => {
    renderBoard(sections);
    expect(screen.queryByLabelText('Your name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign up: Sat AM · Weigh-in' });
    expect(within(dialog).getByText('Please arrive by 6:50am.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Your name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Mobile number')).toBeInTheDocument();
  });

  it('closes the pop-up on Escape', () => {
    renderBoard(sections);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    fireEvent.keyDown(globalThis.window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('submits a sign-up, shows the confirmation and remembers the details', async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() =>
      expect(submitAction).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        roleId: 'role-weigh',
        name: 'Dana',
        email: 'dana@example.com',
        phone: '07700900000',
        website: '',
      }),
    );
    expect(await screen.findByText(/signed up for Sat AM · Weigh-in/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refreshMock).toHaveBeenCalled();
    expect(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      name: 'Dana',
      email: 'dana@example.com',
      phone: '07700900000',
    });
  });

  it("doesn't remember the details when the volunteer unticks it", async () => {
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    fillSignupForm();
    fireEvent.click(screen.getByLabelText('Remember my details on this device'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(submitAction).toHaveBeenCalled());
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('signs up with remembered details in one tap', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Sam', email: 'sam@example.com', phone: '07700900002' }),
    );
    submitAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderBoard(sections);

    expect(await screen.findByText('Sam')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sun AM · MC' }));
    expect(screen.getByText('Sign up as Sam?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, sign me up' }));

    await waitFor(() =>
      expect(submitAction).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        roleId: 'role-mc-sun',
        name: 'Sam',
        email: 'sam@example.com',
        phone: '07700900002',
        website: '',
      }),
    );
  });

  it('lets a different person use their own details instead of the remembered ones', () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Sam', email: 'sam@example.com', phone: '07700900002' }),
    );
    renderBoard(sections);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sun AM · MC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not you? Use different details' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Sam');
  });

  it('forgets remembered details on request', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Sam', email: 'sam@example.com', phone: '07700900002' }),
    );
    renderBoard(sections);
    fireEvent.click(await screen.findByRole('button', { name: 'Forget my details' }));
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forget my details' })).toBeNull();
  });

  it('keeps the pop-up open and shows the message when the slot was just filled', async () => {
    submitAction.mockResolvedValue({
      status: 'error',
      message: 'Sorry — that slot was just filled. Please pick another.',
    });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(screen.getByText(/just filled/)).toBeInTheDocument());
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('recovers from a thrown action instead of getting stuck on "Signing up…"', async () => {
    submitAction.mockRejectedValue(new Error('network down'));
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up for Sat AM · Weigh-in' }));
    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Sign up' })).not.toBeDisabled();
  });
});

describe('PublicRotaBoard — request a change', () => {
  it('sends a drop-out request for a chosen slot', async () => {
    changeAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Request a change' }));
    const dialog = screen.getByRole('dialog', { name: 'Request a change' });
    fireEvent.change(within(dialog).getByLabelText('Your name'), { target: { value: 'Mike R' } });
    fireEvent.change(within(dialog).getByLabelText('Your email or mobile'), {
      target: { value: 'mike@example.com' },
    });
    fireEvent.change(within(dialog).getByLabelText('Which slot?'), { target: { value: 'role-spot' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(changeAction).toHaveBeenCalledWith({
        competitionId: COMP_ID,
        roleId: 'role-spot',
        name: 'Mike R',
        contact: 'mike@example.com',
        kind: 'drop_out',
        message: '',
        website: '',
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeInTheDocument();
  });

  it('asks which slot they want instead for a swap, and shows the server message', async () => {
    changeAction.mockResolvedValue({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { message: ['Tell us which slot you would like instead.'] },
    });
    renderBoard(sections);

    fireEvent.click(screen.getByRole('button', { name: 'Request a change' }));
    fireEvent.click(screen.getByLabelText('Swap to a different slot'));
    expect(screen.getByLabelText('Which slot would you like instead?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mike R' } });
    fireEvent.change(screen.getByLabelText('Your email or mobile'), { target: { value: '07700900000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('Tell us which slot you would like instead.')).toBeInTheDocument();
    expect(changeAction.mock.calls[0][0]).toMatchObject({ kind: 'swap', roleId: null });
  });

  it('prefills the name and email from remembered details', async () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Sam', email: 'sam@example.com', phone: '07700900002' }),
    );
    renderBoard(sections);
    await screen.findByRole('button', { name: 'Forget my details' });
    fireEvent.click(screen.getByRole('button', { name: 'Request a change' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Sam');
    expect(screen.getByLabelText('Your email or mobile')).toHaveValue('sam@example.com');
  });
});
