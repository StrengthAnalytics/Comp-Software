import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock('@/actions/sessions', () => ({
  createSessionAction: vi.fn(),
  deleteSessionAction: vi.fn(),
  updateSessionAction: vi.fn(),
}));
vi.mock('@/actions/flights', () => ({
  createFlightAction: vi.fn(),
  deleteFlightAction: vi.fn(),
  moveFlightAction: vi.fn(),
  updateFlightAction: vi.fn(),
}));
vi.mock('@/actions/platforms', () => ({
  createPlatformAction: vi.fn(),
  deletePlatformAction: vi.fn(),
  updatePlatformAction: vi.fn(),
}));

import { createSessionAction, updateSessionAction } from '@/actions/sessions';
import { createFlightAction, moveFlightAction, updateFlightAction } from '@/actions/flights';
import { ScheduleEditor } from '@/components/flights/schedule-editor';
import type { FlightRow, SessionRow } from '@/components/flights/flights-types';

const createSession = vi.mocked(createSessionAction);
const updateSession = vi.mocked(updateSessionAction);
const createFlight = vi.mocked(createFlightAction);
const moveFlight = vi.mocked(moveFlightAction);
const updateFlight = vi.mocked(updateFlightAction);

const COMP_ID = '11111111-1111-4111-8111-111111111111';

const session: SessionRow = {
  id: 'session-1',
  name: 'Session 1',
  session_date: '2026-07-11',
  weigh_in_time: '07:30:00',
  lift_off_time: '09:30:00',
  platform_id: null,
  sort_order: 0,
};

const flights: FlightRow[] = [
  { id: 'flight-a', session_id: 'session-1', name: 'Flight A', sort_order: 0 },
  { id: 'flight-b', session_id: 'session-1', name: 'Flight B', sort_order: 1 },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  for (const action of [createSession, updateSession, createFlight, moveFlight, updateFlight]) {
    action.mockResolvedValue({ status: 'ok', data: undefined });
  }
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

function renderEditor(overrides: Partial<Parameters<typeof ScheduleEditor>[0]> = {}) {
  render(
    <ScheduleEditor
      competitionId={COMP_ID}
      startsOn="2026-07-11"
      endsOn="2026-07-11"
      platforms={[]}
      sessions={[session]}
      flights={flights}
      lifterCountByFlight={new Map([['flight-a', 11]])}
      {...overrides}
    />,
  );
}

describe('ScheduleEditor', () => {
  it('saves a renamed session without a Save button', async () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Session 1'), { target: { value: 'Women' } });
    fireEvent.blur(screen.getByDisplayValue('Women'));

    await waitFor(() => expect(updateSession).toHaveBeenCalledTimes(1));
    expect(updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1', competitionId: COMP_ID, name: 'Women' }),
    );
    await waitFor(() => expect(screen.getByText('Saved ✓')).toBeTruthy());
  });

  it('fills the weigh-in time in two hours before a newly set lift-off', async () => {
    renderEditor({ sessions: [{ ...session, weigh_in_time: null, lift_off_time: null }] });

    const liftOff = screen.getByLabelText('Lifting starts at');
    fireEvent.change(liftOff, { target: { value: '11:00' } });
    expect(screen.getByLabelText<HTMLInputElement>('Weigh-ins open at').value).toBe('09:00');

    fireEvent.blur(liftOff);
    await waitFor(() => expect(updateSession).toHaveBeenCalled());
    expect(updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ liftOffTime: '11:00', weighInTime: '09:00' }),
    );
  });

  it('moves a suggested weigh-in time along with the lift-off', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Lifting starts at'), { target: { value: '11:00' } });
    expect(screen.getByLabelText<HTMLInputElement>('Weigh-ins open at').value).toBe('09:00');
  });

  it('leaves a weigh-in time the operator chose themselves alone', () => {
    renderEditor({ sessions: [{ ...session, weigh_in_time: '08:00:00' }] });
    fireEvent.change(screen.getByLabelText('Lifting starts at'), { target: { value: '11:00' } });
    expect(screen.getByLabelText<HTMLInputElement>('Weigh-ins open at').value).toBe('08:00');
  });

  it('adds the next lettered flight with one click', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '+ Add flight' }));
    await waitFor(() => expect(createFlight).toHaveBeenCalledTimes(1));
    expect(createFlight).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', name: 'Flight C' }),
    );
  });

  it('moves a flight with arrows rather than a sort-order box', async () => {
    renderEditor();
    expect(screen.queryByLabelText('Flight sort order')).toBeNull();
    expect(screen.getByLabelText<HTMLButtonElement>('Move Flight A earlier').disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Move Flight A later'));
    await waitFor(() => expect(moveFlight).toHaveBeenCalledWith({ id: 'flight-a', direction: 'down' }));
  });

  it('adds a session already dated, timed and with its flights', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: '+ Add a session on Saturday 11 July' }));
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession).toHaveBeenCalledWith({
      competitionId: COMP_ID,
      name: 'Session 2',
      sessionDate: '2026-07-11',
      liftOffTime: '12:00',
      weighInTime: '10:00',
      platformId: null,
      flightCount: 2,
    });
  });

  it('groups sessions under the comp days, including a day with none yet', () => {
    renderEditor({ startsOn: '2026-07-11', endsOn: '2026-07-12' });
    expect(screen.getByText('Saturday 11 July')).toBeTruthy();
    expect(screen.getByText('Sunday 12 July')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add a session on Sunday 12 July' })).toBeTruthy();
  });

  it('shows how many lifters each flight holds', () => {
    renderEditor();
    expect(screen.getByDisplayValue('Flight A').closest('div')?.textContent).toContain('11');
  });

  it('surfaces a rejected save rather than looking saved', async () => {
    updateFlight.mockResolvedValue({ status: 'error', message: 'A flight with that name already exists.' });
    renderEditor();

    const flightB = screen.getByLabelText('Flight name — Flight B');
    fireEvent.change(flightB, { target: { value: 'Flight A' } });
    fireEvent.blur(flightB);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('A flight with that name already exists.'),
    );
  });
});
