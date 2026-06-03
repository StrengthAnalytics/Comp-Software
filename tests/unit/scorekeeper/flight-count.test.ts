import { describe, expect, it } from 'vitest';
import { computeLiftsToNextFlight } from '@/lib/scorekeeper/flight-count';

const flights = [
  { id: 'A', name: 'A', sortOrder: 0 },
  { id: 'B', name: 'B', sortOrder: 1 },
];

describe('computeLiftsToNextFlight', () => {
  it('counts all to-come attempts in the current flight, including the one on the platform', () => {
    const result = computeLiftsToNextFlight({
      currentFlightId: 'A',
      flights,
      lifters: [
        // Flight A: one lifter mid-flight (round 1 done), one untouched.
        { flightId: 'A', results: ['good_lift', 'pending', null] },
        { flightId: 'A', results: [null, null, null] },
        // Flight B lifters don't count toward flight A's remaining tally.
        { flightId: 'B', results: [null, null, null] },
      ],
    });
    // Flight A: (pending + round3) = 2, plus (3) = 5.
    expect(result.count).toBe(5);
    expect(result.nextFlightName).toBe('B');
  });

  it('does not count decided attempts (good/no/not-taken/withdrawn)', () => {
    const result = computeLiftsToNextFlight({
      currentFlightId: 'A',
      flights,
      lifters: [
        { flightId: 'A', results: ['good_lift', 'no_lift', 'good_lift'] },
        { flightId: 'A', results: ['withdrawn', 'not_taken', 'pending'] },
      ],
    });
    expect(result.count).toBe(1);
  });

  it('returns no next flight for the final/only flight', () => {
    const result = computeLiftsToNextFlight({
      currentFlightId: 'B',
      flights,
      lifters: [{ flightId: 'B', results: ['good_lift', 'pending', null] }],
    });
    expect(result.count).toBe(2);
    expect(result.nextFlightName).toBeNull();
  });

  it('skips empty flights when finding the next one', () => {
    const result = computeLiftsToNextFlight({
      currentFlightId: 'A',
      flights: [
        { id: 'A', name: 'A', sortOrder: 0 },
        { id: 'B', name: 'B', sortOrder: 1 },
        { id: 'C', name: 'C', sortOrder: 2 },
      ],
      // Flight B has no lifter contesting this lift; C does.
      lifters: [
        { flightId: 'A', results: ['pending', null, null] },
        { flightId: 'C', results: [null, null, null] },
      ],
    });
    expect(result.nextFlightName).toBe('C');
  });
});
