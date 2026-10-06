import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setOrganiserEmailSchema } from '@/types/competition';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/competitions', () => ({
  setOrganiserEmailAction: vi.fn(),
}));

import { setOrganiserEmailAction } from '@/actions/competitions';
import { OrganiserEmailCard } from '@/components/comps/organiser-email-card';

const saveAction = vi.mocked(setOrganiserEmailAction);
const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrganiserEmailCard', () => {
  it('fills in the signed-in admin with one tap and saves it', async () => {
    saveAction.mockResolvedValue({ status: 'ok', data: undefined });
    render(<OrganiserEmailCard competitionId={COMP_ID} initialEmail={null} myEmail="henry@example.com" />);

    expect(screen.getByText(/Not set/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Use my email (henry@example.com)' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('henry@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveAction).toHaveBeenCalledWith({ competitionId: COMP_ID, email: 'henry@example.com' }),
    );
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows the field error from the server', async () => {
    saveAction.mockResolvedValue({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { email: ['Enter a valid email address.'] },
    });
    render(<OrganiserEmailCard competitionId={COMP_ID} initialEmail="henry@example.com" myEmail="henry@example.com" />);

    expect(screen.queryByRole('button', { name: /Use my email/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
  });
});

describe('setOrganiserEmailSchema', () => {
  it('trims, accepts an email, turns blank into "clear", and rejects junk', () => {
    expect(setOrganiserEmailSchema.parse({ competitionId: COMP_ID, email: ' a@b.co ' }).email).toBe('a@b.co');
    expect(setOrganiserEmailSchema.parse({ competitionId: COMP_ID, email: '  ' }).email).toBeNull();
    expect(setOrganiserEmailSchema.safeParse({ competitionId: COMP_ID, email: 'nope' }).success).toBe(false);
  });
});
