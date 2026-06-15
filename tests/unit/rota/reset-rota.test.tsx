import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock('@/actions/rota', () => ({
  resetRotaAction: vi.fn(),
}));

import { resetRotaAction } from '@/actions/rota';
import { ResetRota } from '@/components/rota/reset-rota';

const resetAction = vi.mocked(resetRotaAction);

const COMP_ID = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

function renderReset(overrides?: { sectionCount?: number; roleCount?: number; signupCount?: number }) {
  const onExport = vi.fn();
  render(
    <ResetRota
      competitionId={COMP_ID}
      competitionName="Summer Open"
      sectionCount={overrides?.sectionCount ?? 2}
      roleCount={overrides?.roleCount ?? 6}
      signupCount={overrides?.signupCount ?? 0}
      onExport={onExport}
    />,
  );
  return { onExport };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ResetRota', () => {
  it('renders nothing for an empty rota', () => {
    renderReset({ sectionCount: 0 });
    expect(screen.queryByRole('button', { name: 'Reset rota' })).toBeNull();
  });

  it('warns about losing volunteer data and offers an export when sign-ups exist', () => {
    const { onExport } = renderReset({ signupCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset rota' }));

    expect(screen.getByText(/names, emails and mobiles/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export contacts (CSV)' }));
    expect(onExport).toHaveBeenCalled();
    // Exporting does not reset anything.
    expect(resetAction).not.toHaveBeenCalled();
  });

  it('only resets once the competition name is typed exactly', async () => {
    resetAction.mockResolvedValue({ status: 'ok', data: undefined });
    renderReset({ sectionCount: 2, roleCount: 6, signupCount: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset rota' }));

    const confirm = screen.getByRole('button', { name: 'Reset the rota' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'wrong' } });
    expect(confirm).toBeDisabled();
    expect(resetAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'Summer Open' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(resetAction).toHaveBeenCalledWith({ competitionId: COMP_ID }));
  });
});
