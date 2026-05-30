import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardEntry, BoardFlight, BoardPlatform, BoardSession } from '@/lib/scorekeeper/board-types';

// The run screen's writes and its realtime subscriptions are the only things that reach the network;
// stub them so the test drives the offline/online behaviour deterministically. The subscription hook is
// a no-op (no websocket), and the three server actions are spies whose resolution we control.
vi.mock('@/actions/attempts', () => ({
  setAttemptWeightAction: vi.fn(),
  setAttemptResultAction: vi.fn(),
}));
vi.mock('@/actions/entries', () => ({
  updateEntryRackSettingsAction: vi.fn(),
}));
vi.mock('@/lib/realtime/use-postgres-changes', () => ({
  usePostgresChanges: () => {},
}));

import { setAttemptResultAction, setAttemptWeightAction } from '@/actions/attempts';
import { updateEntryRackSettingsAction } from '@/actions/entries';
import { ScoresheetBoard } from '@/components/scorekeeper/scoresheet-board';

const weightAction = vi.mocked(setAttemptWeightAction);
const resultAction = vi.mocked(setAttemptResultAction);
const rackAction = vi.mocked(updateEntryRackSettingsAction);

const COMP_ID = 'comp-1';
const platforms: BoardPlatform[] = [{ id: 'plat-1', name: 'Platform 1' }];
const sessions: BoardSession[] = [{ id: 'sess-1', name: 'Morning', sortOrder: 1, platformId: 'plat-1' }];
const flights: BoardFlight[] = [{ id: 'flight-1', sessionId: 'sess-1', name: 'A', sortOrder: 1 }];
const entry: BoardEntry = {
  id: 'entry-1',
  lifterName: 'Smith, John',
  sex: 'male',
  flightId: 'flight-1',
  lotNumber: 1,
  teamLift: null,
  bodyweightKg: 80,
  weightClassName: null,
  divisionName: null,
  rackHeightSquat: null,
  squatRackSetting: null,
  rackHeightBench: null,
  benchSafetyHeight: null,
  benchSpotting: null,
};

function renderBoard() {
  return render(
    <ScoresheetBoard
      competitionId={COMP_ID}
      isTeamCompetition={false}
      kitType="classic"
      lifts={{ squat: true, bench: true, deadlift: true }}
      platforms={platforms}
      sessions={sessions}
      flights={flights}
      weightClasses={[]}
      divisions={[]}
      entries={[entry]}
      attempts={[]}
    />,
  );
}

// Drive navigator.onLine plus the matching online/offline event the connectivity hook listens for
// (on globalThis, the same target useOnline subscribes to).
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  act(() => {
    globalThis.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

const squatOpenerCell = () => screen.getByLabelText(/Set weight for Smith, John, Squat attempt 1/);

function enterSquatOpener(weight: string) {
  fireEvent.click(squatOpenerCell());
  const input = screen.getByLabelText(/Weight for Smith, John, Squat attempt 1/);
  fireEvent.change(input, { target: { value: weight } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  weightAction.mockResolvedValue({ status: 'ok', data: { id: 'attempt-server-id' } });
  resultAction.mockResolvedValue({ status: 'ok', data: undefined });
  rackAction.mockResolvedValue({ status: 'ok', data: undefined });
  setOnline(true);
});

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('ScoresheetBoard offline resilience', () => {
  it('holds an edit made offline without crashing, then syncs it on reconnect', async () => {
    renderBoard();
    setOnline(false);

    enterSquatOpener('100');

    // Held locally: no server call while offline, the value is shown, and the pill says it will sync.
    expect(weightAction).not.toHaveBeenCalled();
    expect(squatOpenerCell()).toHaveTextContent('100');
    expect(screen.getByText('Offline — 1 change will sync when reconnected')).toBeInTheDocument();

    setOnline(true);

    await waitFor(() => expect(weightAction).toHaveBeenCalledTimes(1));
    expect(weightAction).toHaveBeenCalledWith({
      competitionId: COMP_ID,
      entryId: 'entry-1',
      lift: 'squat',
      attemptNumber: 1,
      weightKg: 100,
    });
    await waitFor(() =>
      expect(screen.queryByText('Offline — 1 change will sync when reconnected')).not.toBeInTheDocument(),
    );
  });

  it('persists an offline edit across a reload and syncs it when back online', async () => {
    const { unmount } = renderBoard();
    setOnline(false);
    enterSquatOpener('102.5');
    expect(weightAction).not.toHaveBeenCalled();

    // Simulate a reload while still offline: tear down and remount with the same server snapshot.
    unmount();
    renderBoard();

    // The queued edit is restored from localStorage and shown — still unsynced.
    expect(squatOpenerCell()).toHaveTextContent('102.5');
    expect(weightAction).not.toHaveBeenCalled();

    setOnline(true);
    await waitFor(() => expect(weightAction).toHaveBeenCalledTimes(1));
    expect(weightAction).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry-1', lift: 'squat', attemptNumber: 1, weightKg: 102.5 }),
    );
  });

  it('records a result on an attempt created offline, replaying weight before result', async () => {
    renderBoard();
    setOnline(false);

    enterSquatOpener('100');
    fireEvent.click(screen.getByLabelText(/Good lift for Smith, John/));

    expect(weightAction).not.toHaveBeenCalled();
    expect(resultAction).not.toHaveBeenCalled();
    expect(screen.getByText('Offline — 2 changes will sync when reconnected')).toBeInTheDocument();

    setOnline(true);

    await waitFor(() => expect(resultAction).toHaveBeenCalledTimes(1));
    expect(weightAction).toHaveBeenCalledTimes(1);
    expect(resultAction).toHaveBeenCalledWith({
      competitionId: COMP_ID,
      entryId: 'entry-1',
      lift: 'squat',
      attemptNumber: 1,
      result: 'good_lift',
    });
    // The weight must reach the server before the result that depends on the attempt existing.
    expect(weightAction.mock.invocationCallOrder[0]).toBeLessThan(resultAction.mock.invocationCallOrder[0]);
  });

  it('keeps the screen alive and the value on-screen when a save fails on the wire', async () => {
    weightAction.mockRejectedValue(new Error('network down'));
    renderBoard(); // online

    enterSquatOpener('100');

    // The thrown action is caught (no blank screen): the board stays mounted and the typed value is
    // retained for the scheduled retry.
    await waitFor(() => expect(weightAction).toHaveBeenCalled());
    expect(squatOpenerCell()).toHaveTextContent('100');
  });
});
