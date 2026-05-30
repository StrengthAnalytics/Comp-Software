import {
  orderSessionRoster,
  orderTeamSessionRoster,
  type SessionAttempt,
} from '@/lib/attempts/running-order';
import type { BoardEntry, BoardFlight } from '@/lib/scorekeeper/board-types';

// A live-session roster row before ordering: the lifter and the flight they are in.
export type RosterItem = { entry: BoardEntry; flight: BoardFlight };

// Orders a live session's roster for display, choosing the grouping by competition type: a team comp
// groups by lift across the whole session (each member contests one assigned lift), an individual comp
// follows each flight's single current lift. Shared by the run screen and the warm-up board so the two
// can't project the roster or pick the strategy differently. Returns one `{ entry, flightName }` per
// lifter in display order.
export function orderRosterForSession(
  items: readonly RosterItem[],
  attempts: readonly SessionAttempt[],
  isTeamCompetition: boolean,
): { entry: BoardEntry; flightName: string }[] {
  const rows = items.map((item) => ({
    entryId: item.entry.id,
    flightId: item.flight.id,
    flightSortOrder: item.flight.sortOrder,
    lotNumber: item.entry.lotNumber,
    teamLift: item.entry.teamLift,
    entry: item.entry,
    flightName: item.flight.name,
  }));
  const ordered = isTeamCompetition ? orderTeamSessionRoster(rows, attempts) : orderSessionRoster(rows, attempts);
  return ordered.map(({ entry, flightName }) => ({ entry, flightName }));
}
