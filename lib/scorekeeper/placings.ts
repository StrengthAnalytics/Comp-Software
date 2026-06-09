import type { Sex } from '@/lib/scoring/ipf-gl';
import { compareValues, nullsLast } from '@/lib/ordering';

// Live individual placings for the run/warm-up boards: each lifter's place within their placement
// category, computed twice — once on the total achieved so far ("current") and once on the projected
// total if they make their declared attempts ("predicted"). Pure; the boards gather the data (each
// entry's two totals, plus the grouping fields) and this returns the ranked places.
//
// Placement category is weight class × age category × sex (kit type is fixed per comp, so it isn't
// part of the key). A lifter with no weight class or no age category assigned can't be placed yet and
// is left out of both maps (the board shows a dash). Within a category, lifters are ranked by total
// descending; a lifter with a zero total (no good lift yet, or — for predicted — a lift they can no
// longer make) is unranked. Ties on total break by lighter bodyweight, then lower lot number (the
// IPF order); two lifters share a place only when total and bodyweight are equal, and the next place
// skips accordingly (standard competition ranking).

export type PlaceableEntry = {
  id: string;
  weightClassId: string | null;
  ageCategoryId: string | null;
  sex: Sex;
  bodyweightKg: number | null;
  lotNumber: number | null;
  // Sum of best good lifts so far (running, partial totals allowed) — drives the current place.
  currentTotal: number;
  // Projected total if the lifter makes their declared attempts — drives the predicted place.
  predictedTotal: number;
};

export type Placings = {
  currentPlaceById: Map<string, number>;
  predictedPlaceById: Map<string, number>;
};

// Ranks one placement group by a chosen total, returning [entryId, place] for every lifter with a
// positive total. Lifters with a zero total are omitted (unranked). Tie-break: lighter bodyweight,
// then lower lot; a place is shared only when total and bodyweight are equal.
function placeWithin(
  group: readonly PlaceableEntry[],
  totalOf: (entry: PlaceableEntry) => number,
): [string, number][] {
  const ranked = group
    .filter((entry) => totalOf(entry) > 0)
    .toSorted((a, b) => {
      const byTotal = totalOf(b) - totalOf(a);
      if (byTotal !== 0) {
        return byTotal;
      }
      // nullsLast/compareValues keep the comparison NaN-safe when two entries are both unweighed or
      // both lot-less (Infinity − Infinity would be NaN, an invalid comparator result).
      const byBodyweight = compareValues(nullsLast(a.bodyweightKg), nullsLast(b.bodyweightKg));
      if (byBodyweight !== 0) {
        return byBodyweight;
      }
      return compareValues(nullsLast(a.lotNumber), nullsLast(b.lotNumber));
    });

  const places: [string, number][] = [];
  let previousTotal: number | null = null;
  let previousBodyweight: number | null = null;
  let previousRank = 0;
  for (const [index, entry] of ranked.entries()) {
    const total = totalOf(entry);
    const tied = previousTotal !== null && total === previousTotal && entry.bodyweightKg === previousBodyweight;
    const rank = tied ? previousRank : index + 1;
    places.push([entry.id, rank]);
    previousTotal = total;
    previousBodyweight = entry.bodyweightKg;
    previousRank = rank;
  }
  return places;
}

export function computePlacings(entries: readonly PlaceableEntry[]): Placings {
  const groups = new Map<string, PlaceableEntry[]>();
  for (const entry of entries) {
    if (!entry.weightClassId || !entry.ageCategoryId) {
      continue;
    }
    const key = `${entry.weightClassId}|${entry.ageCategoryId}|${entry.sex}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const currentPlaceById = new Map<string, number>();
  const predictedPlaceById = new Map<string, number>();
  for (const group of groups.values()) {
    for (const [id, place] of placeWithin(group, (entry) => entry.currentTotal)) {
      currentPlaceById.set(id, place);
    }
    for (const [id, place] of placeWithin(group, (entry) => entry.predictedTotal)) {
      predictedPlaceById.set(id, place);
    }
  }
  return { currentPlaceById, predictedPlaceById };
}
