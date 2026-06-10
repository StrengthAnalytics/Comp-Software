import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// The review actions, the router refresh and the realtime channel are the only things that touch
// the outside world; stub them all so the test drives the review flow deterministically.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/entry-form', () => ({
  approveSubmissionAction: vi.fn(),
  rejectSubmissionAction: vi.fn(),
}));
vi.mock('@/lib/realtime/use-postgres-changes', () => ({
  usePostgresChanges: () => {},
}));

import { approveSubmissionAction, rejectSubmissionAction } from '@/actions/entry-form';
import { SubmissionsInbox, type PendingSubmission } from '@/components/entries/submissions-inbox';

const approveAction = vi.mocked(approveSubmissionAction);
const rejectAction = vi.mocked(rejectSubmissionAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

function submission(overrides?: Partial<PendingSubmission>): PendingSubmission {
  return {
    id: 'sub-1',
    firstName: 'Jane',
    surname: 'Smith',
    gender: 'female',
    dateOfBirth: '1995-06-15',
    club: 'Iron Works',
    ipfMemberId: null,
    division: null,
    weightClass: '-63 kg',
    predictedTotalKg: 410,
    kitChoice: 'classic',
    eventChoice: null,
    instagram: null,
    email: 'jane@example.com',
    phone: null,
    disclaimerAcceptedAt: '2026-06-10T10:00:00Z',
    createdAt: '2026-06-10T10:00:00Z',
    possibleDuplicate: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SubmissionsInbox', () => {
  it('renders nothing when there are no pending submissions', () => {
    const { container } = render(<SubmissionsInbox competitionId={COMP_ID} submissions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a red card with only the answers the lifter gave, plus the count', () => {
    render(<SubmissionsInbox competitionId={COMP_ID} submissions={[submission()]} />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Iron Works')).toBeInTheDocument();
    expect(screen.getByText('410 kg')).toBeInTheDocument();
    // The classic code shows as the lifter-facing "Raw".
    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    // Fields the form didn't collect leave no empty rows behind.
    expect(screen.queryByText('Membership no.')).toBeNull();
    expect(screen.queryByText('Phone')).toBeNull();
  });

  it('flags a likely duplicate', () => {
    render(
      <SubmissionsInbox competitionId={COMP_ID} submissions={[submission({ possibleDuplicate: true })]} />,
    );
    expect(screen.getByText(/already registered in this competition/)).toBeInTheDocument();
  });

  it('approves through the action', async () => {
    approveAction.mockResolvedValue({ status: 'ok', data: undefined });
    render(<SubmissionsInbox competitionId={COMP_ID} submissions={[submission()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve entry' }));
    await waitFor(() =>
      expect(approveAction).toHaveBeenCalledWith({ competitionId: COMP_ID, submissionId: 'sub-1' }),
    );
  });

  it('surfaces a failed approval on the card', async () => {
    approveAction.mockResolvedValue({
      status: 'error',
      message: 'A lifter with this name is already registered in this competition.',
    });
    render(<SubmissionsInbox competitionId={COMP_ID} submissions={[submission()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve entry' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('already registered'));
  });

  it('rejects only after an inline confirm', async () => {
    rejectAction.mockResolvedValue({ status: 'ok', data: undefined });
    render(<SubmissionsInbox competitionId={COMP_ID} submissions={[submission()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(rejectAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() =>
      expect(rejectAction).toHaveBeenCalledWith({ competitionId: COMP_ID, submissionId: 'sub-1' }),
    );
  });

  it('backs out of a reject with Cancel', () => {
    render(<SubmissionsInbox competitionId={COMP_ID} submissions={[submission()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Approve entry' })).toBeInTheDocument();
    expect(rejectAction).not.toHaveBeenCalled();
  });
});
