import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('@/actions/schedule', () => ({ buildScheduleAction: vi.fn() }));

import { buildScheduleAction } from '@/actions/schedule';
import { ScheduleBuilder } from '@/components/flights/schedule-builder';

const build = vi.mocked(buildScheduleAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBuilder(overrides: Partial<Parameters<typeof ScheduleBuilder>[0]> = {}) {
  const onSkip = vi.fn();
  render(
    <ScheduleBuilder
      competitionId="11111111-1111-4111-8111-111111111111"
      startsOn="2026-07-11"
      endsOn="2026-07-12"
      entryCount={0}
      existingPlatformNames={[]}
      onSkip={onSkip}
      {...overrides}
    />,
  );
  return { onSkip };
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

describe('ScheduleBuilder', () => {
  it('asks for the dates first when the comp has none', () => {
    const { onSkip } = renderBuilder({ startsOn: null, endsOn: null });
    expect(screen.getByText(/Set the competition.s dates on Setup first/)).toBeTruthy();
    // …without trapping the operator: sessions can still be added by hand.
    fireEvent.click(screen.getByRole('button', { name: 'Add sessions by hand instead' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('creates every session and flight from the answers', async () => {
    build.mockResolvedValue({ status: 'ok', data: { sessionCount: 4, flightCount: 8 } });
    renderBuilder();

    next(); // platforms: one, the default
    next(); // sessions: two a day, the default
    next(); // times: as suggested
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    const input = build.mock.calls[0][0];
    expect(input.platforms).toEqual(['Platform A']);
    expect(input.sessions).toHaveLength(4);
    expect(input.sessions[0]).toMatchObject({
      date: '2026-07-11',
      name: 'Session 1',
      liftOffTime: '09:30',
      weighInTime: '07:30',
      flightCount: 2,
      platformIndex: 0,
    });
    expect(input.sessions.at(-1)).toMatchObject({ date: '2026-07-12', liftOffTime: '14:30' });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('follows the lift-off time with the weigh-in time', async () => {
    build.mockResolvedValue({ status: 'ok', data: { sessionCount: 1, flightCount: 2 } });
    renderBuilder({ startsOn: '2026-07-11', endsOn: '2026-07-11' });

    next();
    fireEvent.click(screen.getByRole('button', { name: 'One fewer — Sessions on Saturday 11 July' }));
    next();
    fireEvent.change(screen.getByLabelText('Lift-off time — Session 1, Saturday 11 July'), {
      target: { value: '11:00' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Weigh-in time — Session 1, Saturday 11 July').value).toBe('09:00');

    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    await waitFor(() => expect(build).toHaveBeenCalled());
    expect(build.mock.calls[0][0].sessions).toEqual([
      expect.objectContaining({ liftOffTime: '11:00', weighInTime: '09:00' }),
    ]);
  });

  it('splits the sessions between two platforms', async () => {
    build.mockResolvedValue({ status: 'ok', data: { sessionCount: 2, flightCount: 4 } });
    renderBuilder({ startsOn: '2026-07-11', endsOn: '2026-07-11' });

    fireEvent.click(screen.getByRole('button', { name: /2 platforms/ }));
    next();
    fireEvent.click(screen.getByRole('button', { name: 'One fewer — Sessions on Saturday 11 July — Platform A' }));
    fireEvent.click(screen.getByRole('button', { name: 'One fewer — Sessions on Saturday 11 July — Platform B' }));
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(build).toHaveBeenCalled());
    const input = build.mock.calls[0][0];
    expect(input.platforms).toEqual(['Platform A', 'Platform B']);
    expect(input.sessions.map((session) => session.platformIndex)).toEqual([0, 1]);
  });

  it('reuses the platform the comp already has rather than adding another', async () => {
    build.mockResolvedValue({ status: 'ok', data: { sessionCount: 2, flightCount: 4 } });
    renderBuilder({ startsOn: '2026-07-11', endsOn: '2026-07-11', existingPlatformNames: ['Main stage'] });

    fireEvent.click(screen.getByRole('button', { name: /2 platforms/ }));
    next();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(build).toHaveBeenCalled());
    expect(build.mock.calls[0][0].platforms).toEqual(['Main stage', 'Platform A']);
  });

  it('warns when the flights would be over the running size', () => {
    renderBuilder({ entryCount: 200 });
    next();
    next();
    const hint = screen.getByText(/per flight/).closest('p');
    expect(hint?.textContent).toContain('200 lifters registered across 8 flights');
    expect(hint?.textContent).toContain('25 per flight');
    expect(hint?.textContent).toContain("over the 14 a flight runs well with");
  });

  it('will not carry on with no sessions at all', () => {
    renderBuilder({ startsOn: '2026-07-11', endsOn: '2026-07-11' });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'One fewer — Sessions on Saturday 11 July' }));
    fireEvent.click(screen.getByRole('button', { name: 'One fewer — Sessions on Saturday 11 July' }));
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Give at least one day a session to carry on.')).toBeTruthy();
  });

  it('surfaces a failed create instead of pretending it worked', async () => {
    build.mockResolvedValue({ status: 'error', message: 'Could not create the schedule. Please try again.' });
    renderBuilder();
    next();
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Could not create the schedule. Please try again.'),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('lets the operator skip to adding sessions by hand', () => {
    const { onSkip } = renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Add sessions by hand instead' }));
    expect(onSkip).toHaveBeenCalled();
  });
});
