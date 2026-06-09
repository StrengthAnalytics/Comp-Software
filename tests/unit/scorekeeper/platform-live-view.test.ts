import { describe, expect, it } from 'vitest';
import { buildPlatformLiveView } from '@/lib/scorekeeper/platform-live-view';
import type { BoardAttempt, BoardEntry, BoardFlight, BoardSession } from '@/lib/scorekeeper/board-types';

// Minimal board-shape builders — only the fields the live-view derivation reads are set per case.
function session(overrides: Partial<BoardSession> = {}): BoardSession {
  return { id: 's1', name: 'Session 1', sortOrder: 0, platformId: 'p1', ...overrides };
}

function flight(overrides: Partial<BoardFlight> = {}): BoardFlight {
  return { id: 'f1', sessionId: 's1', name: 'Flight A', sortOrder: 0, ...overrides };
}

function entry(overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: 'e1',
    lifterName: 'Lifter One',
    sex: 'male',
    flightId: 'f1',
    lotNumber: 1,
    teamLift: null,
    teamId: null,
    teamName: null,
    bodyweightKg: 80,
    weightClassId: null,
    weightClassName: null,
    ageCategoryId: null,
    ageCategoryName: null,
    division: null,
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
    entryId: 'e1',
    lift: 'squat',
    attemptNumber: 1,
    weightKg: 100,
    result: 'pending',
    decidedAt: null,
    ...overrides,
  };
}

describe('buildPlatformLiveView', () => {
  it('returns an empty view when the platform has no rostered session', () => {
    const view = buildPlatformLiveView({
      platformId: 'p1',
      sessions: [session()],
      flights: [flight()],
      entries: [],
      attempts: [],
    });

    expect(view.liveSession).toBeNull();
    expect(view.rosterItems).toEqual([]);
    expect(view.liveRows).toEqual([]);
    expect(view.positions).toEqual({ onPlatform: null, onDeck: null, inTheHole: null });
  });

  it('rosters weighed-in lifters before any attempt is declared', () => {
    const view = buildPlatformLiveView({
      platformId: 'p1',
      sessions: [session()],
      flights: [flight()],
      entries: [entry()],
      attempts: [],
    });

    expect(view.liveSession?.id).toBe('s1');
    expect(view.rosterItems).toHaveLength(1);
    expect(view.rosterItems[0].entry.id).toBe('e1');
    // No declared attempt yet, so nobody is on the platform.
    expect(view.positions.onPlatform).toBeNull();
  });

  it('puts the lightest declared pending attempt on the platform, then on deck, then in the hole', () => {
    const entries = [
      entry({ id: 'e1', flightId: 'f1', lotNumber: 1 }),
      entry({ id: 'e2', flightId: 'f1', lotNumber: 2 }),
      entry({ id: 'e3', flightId: 'f1', lotNumber: 3 }),
    ];
    const attempts = [
      attempt({ id: 'a1', entryId: 'e1', weightKg: 120 }),
      attempt({ id: 'a2', entryId: 'e2', weightKg: 100 }),
      attempt({ id: 'a3', entryId: 'e3', weightKg: 110 }),
    ];

    const view = buildPlatformLiveView({
      platformId: 'p1',
      sessions: [session()],
      flights: [flight()],
      entries,
      attempts,
    });

    expect(view.positions.onPlatform?.entryId).toBe('e2'); // 100 kg
    expect(view.positions.onDeck?.entryId).toBe('e3'); // 110 kg
    expect(view.positions.inTheHole?.entryId).toBe('e1'); // 120 kg
    // Rows carry the joined entry + flight for the caller to render without re-joining.
    expect(view.positions.onPlatform?.entry.lifterName).toBe('Lifter One');
    expect(view.positions.onPlatform?.flight.name).toBe('Flight A');
  });

  it('scopes to the requested platform, ignoring other platforms', () => {
    const sessions = [
      session({ id: 's1', platformId: 'p1', sortOrder: 0 }),
      session({ id: 's2', platformId: 'p2', sortOrder: 0 }),
    ];
    const flights = [
      flight({ id: 'f1', sessionId: 's1' }),
      flight({ id: 'f2', sessionId: 's2' }),
    ];
    const entries = [
      entry({ id: 'e1', flightId: 'f1' }),
      entry({ id: 'e2', flightId: 'f2' }),
    ];
    const attempts = [
      attempt({ id: 'a1', entryId: 'e1', weightKg: 100 }),
      attempt({ id: 'a2', entryId: 'e2', weightKg: 90 }),
    ];

    const view = buildPlatformLiveView({ platformId: 'p2', sessions, flights, entries, attempts });

    expect(view.liveSession?.id).toBe('s2');
    expect(view.positions.onPlatform?.entryId).toBe('e2');
  });

  it('skips an empty earlier session so the platform does not freeze on it', () => {
    const sessions = [
      session({ id: 's1', platformId: 'p1', sortOrder: 0 }), // no rostered lifters
      session({ id: 's2', platformId: 'p1', sortOrder: 1 }),
    ];
    const flights = [flight({ id: 'f2', sessionId: 's2' })];
    const entries = [entry({ id: 'e1', flightId: 'f2' })];
    const attempts = [attempt({ id: 'a1', entryId: 'e1', weightKg: 100 })];

    const view = buildPlatformLiveView({ platformId: 'p1', sessions, flights, entries, attempts });

    expect(view.liveSession?.id).toBe('s2');
    expect(view.positions.onPlatform?.entryId).toBe('e1');
  });

  it('treats a session with no assigned platform as the synthetic "none" platform', () => {
    const view = buildPlatformLiveView({
      platformId: 'none',
      sessions: [session({ platformId: null })],
      flights: [flight()],
      entries: [entry()],
      attempts: [attempt({ weightKg: 100 })],
    });

    expect(view.liveSession?.id).toBe('s1');
    expect(view.positions.onPlatform?.entryId).toBe('e1');
  });

  it('ignores decided and undeclared attempts when picking who is on the platform', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2', lotNumber: 2 })];
    const attempts = [
      attempt({ id: 'a1', entryId: 'e1', weightKg: 100, result: 'good_lift' }), // decided
      attempt({ id: 'a2', entryId: 'e2', weightKg: null }), // undeclared
    ];

    const view = buildPlatformLiveView({
      platformId: 'p1',
      sessions: [session()],
      flights: [flight()],
      entries,
      attempts,
    });

    // The session is live (it has a rostered lifter), but no pending declared attempt remains.
    expect(view.liveSession?.id).toBe('s1');
    expect(view.positions.onPlatform).toBeNull();
  });
});
