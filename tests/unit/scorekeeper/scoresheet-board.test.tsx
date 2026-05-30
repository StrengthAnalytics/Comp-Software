import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardEntry, BoardFlight, BoardPlatform, BoardSession } from '@/lib/scorekeeper/board-types';

// The run screen's writes and its realtime subscriptions are the only things that reach the network;
// stub them so the test drives the offline/online behaviour deterministically. The subscription hook is
// a no-op (no websocket), the three server actions are spies whose resolution we control, and the
// router's refresh (used to reconcile after a rejected save) is a spy.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
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
    expect(resultAction).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: COMP_ID,
        entryId: 'entry-1',
        lift: 'squat',
        attemptNumber: 1,
        result: 'good_lift',
        // The mark time is carried on the wire so the server anchors the next-attempt countdown to
        // when the operator marked it offline, not to this reconnect-time flush.
        decidedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    // The weight must reach the server before the result that depends on the attempt existing.
    expect(weightAction.mock.invocationCallOrder[0]).toBeLessThan(resultAction.mock.invocationCallOrder[0]);
  });

  it('does not drop a re-edit made while the previous save of the same cell is in flight', async () => {
    renderBoard(); // online

    // Hold the first save open so the operator can correct the cell while it is still in flight.
    let resolveFirst!: (value: { status: 'ok'; data: { id: string } }) => void;
    weightAction.mockReturnValueOnce(
      new Promise<{ status: 'ok'; data: { id: string } }>((resolve) => {
        resolveFirst = resolve;
      }),
    );

    enterSquatOpener('100');
    await waitFor(() => expect(weightAction).toHaveBeenCalledTimes(1));
    expect(weightAction).toHaveBeenNthCalledWith(1, expect.objectContaining({ weightKg: 100 }));

    // Correct the same cell to 105 while the 100 save has not yet resolved.
    enterSquatOpener('105');
    expect(squatOpenerCell()).toHaveTextContent('105');

    // The 100 save now lands. The drain must NOT discard the queued 105 (which sits under the same
    // outbox key) — it has to send it on the follow-up flush, or the server would keep 100 while the
    // board shows 105.
    await act(async () => {
      resolveFirst({ status: 'ok', data: { id: 'attempt-server-id' } });
    });

    await waitFor(() => expect(weightAction).toHaveBeenCalledTimes(2));
    expect(weightAction).toHaveBeenNthCalledWith(2, expect.objectContaining({ weightKg: 105 }));
    expect(squatOpenerCell()).toHaveTextContent('105');
    // Once both have flushed nothing is left queued.
    await waitFor(() =>
      expect(screen.queryByText(/change(s)? .*sync|Syncing/)).not.toBeInTheDocument(),
    );
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

  it('reconciles to the server (and does not retry) when a save is rejected deterministically', async () => {
    weightAction.mockResolvedValue({
      status: 'error',
      message: 'After a good lift, the next attempt must be heavier than 105 kg.',
    });
    renderBoard(); // online

    enterSquatOpener('100');

    // The rejected op is sent once, surfaces the message, and is not retried; a server re-pull is
    // requested so the board converges to the database rather than holding the refused value.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(weightAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/must be heavier than 105 kg/)).toBeInTheDocument();
  });

  it('does not waste a call recording a result whose offline weight is rejected on reconnect', async () => {
    weightAction.mockResolvedValue({
      status: 'error',
      message: 'After a good lift, the next attempt must be heavier than 105 kg.',
    });
    renderBoard();
    setOnline(false);

    enterSquatOpener('100');
    fireEvent.click(screen.getByLabelText(/Good lift for Smith, John/));
    expect(weightAction).not.toHaveBeenCalled();
    expect(resultAction).not.toHaveBeenCalled();

    setOnline(true);

    // The weight is rejected, so the dependent result is dropped without being sent (its attempt was
    // never created), and the board re-pulls server truth.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(weightAction).toHaveBeenCalledTimes(1);
    expect(resultAction).not.toHaveBeenCalled();
  });

  it('defers a rejection reconcile while offline and runs it on reconnect', async () => {
    renderBoard(); // online

    // Hold the save open so we can drop the connection before its rejection lands.
    let rejectWith!: (result: { status: 'error'; message: string }) => void;
    weightAction.mockReturnValueOnce(
      new Promise<{ status: 'error'; message: string }>((resolve) => {
        rejectWith = resolve;
      }),
    );

    enterSquatOpener('100');
    await waitFor(() => expect(weightAction).toHaveBeenCalledTimes(1));

    // Connection drops while the save is in flight.
    setOnline(false);

    // The save resolves with a deterministic rejection. The reconcile (a full re-pull) must NOT fire
    // while offline — a router.refresh offline would no-op and waste the deferred reconcile.
    await act(async () => {
      rejectWith({ status: 'error', message: 'After a good lift, the next attempt must be heavier than 105 kg.' });
    });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByText(/must be heavier than 105 kg/)).toBeInTheDocument();

    // On reconnect the deferred reconcile runs so the board converges to server truth.
    setOnline(true);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
