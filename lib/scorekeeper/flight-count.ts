import type { Database } from '@/types/database.types';

type AttemptResult = Database['public']['Enums']['attempt_result'];

// A lifter contesting the current lift: which flight they're in and the result of each of their three
// attempts of that lift (null = the attempt has not been created yet). Used to count attempts still to
// come in a flight.
export type FlightCountLifter = {
  flightId: string;
  results: readonly (AttemptResult | null)[];
};

export type FlightCountInput = {
  // The flight currently on the platform.
  currentFlightId: string;
  // Every flight in the live session, with display name and running order.
  flights: readonly { id: string; name: string; sortOrder: number }[];
  // Rostered lifters in the live session contesting the lift (individual comp: everyone; team comp:
  // only members whose team_lift is this lift).
  lifters: readonly FlightCountLifter[];
};

export type FlightCount = {
  // Attempts of this lift still to come in the current flight — including the one on the platform now —
  // which equals the number of lifts until the next flight starts this lift, or until the end of the
  // meet when the current flight is the last to contest it.
  count: number;
  // The next flight to contest this lift after the current one, or null when the current flight is the
  // last (final or only flight) to contest it.
  nextFlightName: string | null;
};

// An attempt is still "to come" while it is pending or not yet created; any decided result
// (good_lift/no_lift/not_taken/withdrawn) is done and is not counted.
function isToCome(result: AttemptResult | null): boolean {
  return result === null || result === 'pending';
}

// Counts the attempts of the current lift remaining in the current flight, and names the next flight to
// contest the lift. The session running order does every round of a lift in one flight before the next
// flight starts that lift, so "remaining in this flight" is exactly "lifts until the next flight's
// first attempt of this lift" (and there is no next flight — count to the end — for the final/only
// flight). The count includes the attempt currently on the platform (it is still pending), so it ticks
// down as each lift is judged. Pure; unit-tested.
export function computeLiftsToNextFlight(input: FlightCountInput): FlightCount {
  const current = input.flights.find((flight) => flight.id === input.currentFlightId);
  const count = input.lifters
    .filter((lifter) => lifter.flightId === input.currentFlightId)
    .reduce((total, lifter) => total + lifter.results.filter((result) => isToCome(result)).length, 0);

  // Only flights that actually have a lifter contesting this lift can be "next", so an empty flight (or
  // one with no member on this lift in a team comp) never reads as the next flight.
  const contestingFlightIds = new Set(input.lifters.map((lifter) => lifter.flightId));
  const nextFlight = current
    ? input.flights
        .filter((flight) => contestingFlightIds.has(flight.id) && flight.sortOrder > current.sortOrder)
        .toSorted((a, b) => a.sortOrder - b.sortOrder)[0]
    : undefined;

  return { count, nextFlightName: nextFlight?.name ?? null };
}
