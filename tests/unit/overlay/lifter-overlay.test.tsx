import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BoardAttempt, BoardEntry, BoardFlight, BoardSession } from '@/lib/scorekeeper/board-types';

// The overlay subscribes to realtime through useBoardState; stub the base subscription hook so the
// component renders purely from its seeded props (no websocket).
vi.mock('@/lib/realtime/use-postgres-changes', () => ({
  usePostgresChanges: () => {},
}));

import { LifterOverlay } from '@/components/overlay/lifter-overlay';

const sessions: BoardSession[] = [{ id: 'sess-1', name: 'Morning', sortOrder: 1, platformId: 'plat-1' }];
const flights: BoardFlight[] = [{ id: 'flight-1', sessionId: 'sess-1', name: 'A', sortOrder: 1 }];

function entry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: 'entry-1',
    lifterName: 'Smith, John',
    sex: 'male',
    flightId: 'flight-1',
    lotNumber: 1,
    teamLift: null,
    teamId: null,
    teamName: null,
    bodyweightKg: 90,
    weightClassId: null,
    weightClassName: '93 kg',
    ageCategoryId: null,
    ageCategoryName: 'Open',
    rackHeightSquat: null,
    squatRackSetting: null,
    rackHeightBench: null,
    benchSafetyHeight: null,
    benchSpotting: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<BoardAttempt> = {}): BoardAttempt {
  return {
    id: 'a1',
    entryId: 'entry-1',
    lift: 'squat',
    attemptNumber: 1,
    weightKg: 250,
    result: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

const baseProps = {
  competitionId: 'comp-1',
  platformId: 'plat-1',
  isTeamCompetition: false,
  kitType: 'classic' as const,
  lifts: { squat: true, bench: true, deadlift: true },
  sessions,
  flights,
  weightClasses: [],
  ageCategories: [],
  teams: [],
};

afterEach(cleanup);

describe('LifterOverlay', () => {
  it('renders the current lifter card (not the old stub) when a lifter is on the platform', () => {
    render(<LifterOverlay {...baseProps} entries={[entry()]} attempts={[attempt()]} />);

    // The stub rendered the literal text "Lifter overlay"; the real overlay never does.
    expect(screen.queryByText('Lifter overlay')).toBeNull();

    expect(screen.getByText('Smith, John')).toBeInTheDocument();
    expect(screen.getByText('93 kg · Open')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    // Flight · lift · attempt header on the card.
    expect(screen.getByText('A · Squat · Attempt 1')).toBeInTheDocument();
  });

  it('renders nothing in the canvas when no declared pending attempt is on the platform', () => {
    const { container } = render(
      <LifterOverlay {...baseProps} entries={[entry()]} attempts={[attempt({ result: 'good_lift' })]} />,
    );

    expect(screen.queryByText('Smith, John')).toBeNull();
    // The fixed canvas is present but empty.
    expect(container.querySelector('div')?.childElementCount).toBe(0);
  });
});
