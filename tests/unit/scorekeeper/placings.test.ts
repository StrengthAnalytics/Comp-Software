import { describe, expect, it } from 'vitest';
import { computePlacings, type PlaceableEntry } from '@/lib/scorekeeper/placings';

function placeable(overrides: Partial<PlaceableEntry> = {}): PlaceableEntry {
  return {
    id: 'e1',
    weightClassId: 'wc-83',
    divisionId: 'div-open',
    sex: 'male',
    bodyweightKg: 82,
    lotNumber: 1,
    currentTotal: 0,
    predictedTotal: 0,
    ...overrides,
  };
}

describe('computePlacings', () => {
  it('ranks lifters in a category by total descending', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'a', currentTotal: 600 }),
      placeable({ id: 'b', currentTotal: 650 }),
      placeable({ id: 'c', currentTotal: 620 }),
    ]);
    expect(currentPlaceById.get('b')).toBe(1);
    expect(currentPlaceById.get('c')).toBe(2);
    expect(currentPlaceById.get('a')).toBe(3);
  });

  it('ranks current and predicted independently', () => {
    const { currentPlaceById, predictedPlaceById } = computePlacings([
      placeable({ id: 'a', currentTotal: 600, predictedTotal: 700 }),
      placeable({ id: 'b', currentTotal: 650, predictedTotal: 660 }),
    ]);
    // b leads on what's achieved, a leads on the projection.
    expect(currentPlaceById.get('b')).toBe(1);
    expect(predictedPlaceById.get('a')).toBe(1);
    expect(predictedPlaceById.get('b')).toBe(2);
  });

  it('separates lifters into categories by weight class, division and sex', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'a', weightClassId: 'wc-83', currentTotal: 600 }),
      placeable({ id: 'b', weightClassId: 'wc-93', currentTotal: 500 }),
      placeable({ id: 'c', divisionId: 'div-junior', currentTotal: 550 }),
      placeable({ id: 'd', sex: 'female', weightClassId: 'wc-63', currentTotal: 400 }),
    ]);
    // Each lifter is alone in their own category, so all place first.
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(currentPlaceById.get(id)).toBe(1);
    }
  });

  it('leaves out lifters with no total (no good lift yet, or a bombed projection)', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'a', currentTotal: 600 }),
      placeable({ id: 'b', currentTotal: 0 }),
    ]);
    expect(currentPlaceById.get('a')).toBe(1);
    expect(currentPlaceById.has('b')).toBe(false);
  });

  it('leaves out lifters with no weight class or division assigned', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'a', currentTotal: 600 }),
      placeable({ id: 'b', weightClassId: null, currentTotal: 700 }),
      placeable({ id: 'c', divisionId: null, currentTotal: 800 }),
    ]);
    expect(currentPlaceById.get('a')).toBe(1);
    expect(currentPlaceById.has('b')).toBe(false);
    expect(currentPlaceById.has('c')).toBe(false);
  });

  it('breaks an equal total by lighter bodyweight', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'heavy', currentTotal: 600, bodyweightKg: 82 }),
      placeable({ id: 'light', currentTotal: 600, bodyweightKg: 80 }),
    ]);
    expect(currentPlaceById.get('light')).toBe(1);
    expect(currentPlaceById.get('heavy')).toBe(2);
  });

  it('sorts a lifter with no recorded bodyweight or lot last among equal totals', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'weighed', currentTotal: 600, bodyweightKg: 80, lotNumber: 2 }),
      placeable({ id: 'unweighed', currentTotal: 600, bodyweightKg: null, lotNumber: null }),
    ]);
    expect(currentPlaceById.get('weighed')).toBe(1);
    expect(currentPlaceById.get('unweighed')).toBe(2);
  });

  it('shares a place on an equal total and bodyweight, then skips the next rank', () => {
    const { currentPlaceById } = computePlacings([
      placeable({ id: 'a', currentTotal: 600, bodyweightKg: 80, lotNumber: 1 }),
      // No lot number: sorts after a at equal total+bodyweight, but still shares the place.
      placeable({ id: 'b', currentTotal: 600, bodyweightKg: 80, lotNumber: null }),
      placeable({ id: 'c', currentTotal: 550, bodyweightKg: 80, lotNumber: 3 }),
    ]);
    expect(currentPlaceById.get('a')).toBe(1);
    expect(currentPlaceById.get('b')).toBe(1);
    expect(currentPlaceById.get('c')).toBe(3);
  });
});
