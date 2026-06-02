import { describe, expect, it } from 'vitest';
import {
  ALL_FILTER,
  EMPTY_RECORD_FILTERS,
  compareRecords,
  matchesRecordFilters,
  selectRecords,
  weightClassValue,
  type RecordFilters,
} from '@/lib/records/filter';
import type { RecordView } from '@/lib/records/record-view';

function record(overrides: Partial<RecordView> = {}): RecordView {
  return {
    id: Math.random().toString(),
    region: 'British',
    name: 'A Lifter',
    gender: 'M',
    weightClass: '-83 kg',
    ageCategory: 'Open',
    lift: 'squat',
    equipment: 'unequipped',
    weightKg: 300,
    dateSet: '2024-01-15',
    notes: null,
    ...overrides,
  };
}

describe('weightClassValue', () => {
  it('extracts the leading number and sorts the unlimited class by its number', () => {
    expect(weightClassValue('-83 kg')).toBe(83);
    expect(weightClassValue('120 kg+')).toBe(120);
    expect(weightClassValue('nonsense')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('matchesRecordFilters', () => {
  const base = record({ name: 'Jane Doe', region: 'England', gender: 'F', lift: 'deadlift' });

  it('matches when every filter is "all"', () => {
    expect(matchesRecordFilters(base, EMPTY_RECORD_FILTERS)).toBe(true);
  });

  it('filters by a case-insensitive name substring', () => {
    expect(matchesRecordFilters(base, { ...EMPTY_RECORD_FILTERS, query: 'jane' })).toBe(true);
    expect(matchesRecordFilters(base, { ...EMPTY_RECORD_FILTERS, query: 'smith' })).toBe(false);
  });

  it.each([
    ['region', 'England', 'Wales'],
    ['gender', 'F', 'M'],
    ['lift', 'deadlift', 'squat'],
  ])('filters by %s', (key, match, miss) => {
    expect(matchesRecordFilters(base, { ...EMPTY_RECORD_FILTERS, [key]: match })).toBe(true);
    expect(matchesRecordFilters(base, { ...EMPTY_RECORD_FILTERS, [key]: miss })).toBe(false);
  });
});

describe('compareRecords', () => {
  it('orders by descending weight for "weight-desc"', () => {
    expect(compareRecords(record({ weightKg: 200 }), record({ weightKg: 300 }), 'weight-desc')).toBeGreaterThan(0);
  });

  it('orders newest first for "date-desc", nulls last', () => {
    expect(compareRecords(record({ dateSet: '2024-01-01' }), record({ dateSet: '2023-01-01' }), 'date-desc')).toBeLessThan(0);
    expect(compareRecords(record({ dateSet: null }), record({ dateSet: '2023-01-01' }), 'date-desc')).toBeGreaterThan(0);
  });

  it('orders by class number then lift order within a category', () => {
    const lighter = record({ weightClass: '-66 kg', lift: 'squat' });
    const heavier = record({ weightClass: '-83 kg', lift: 'squat' });
    expect(compareRecords(lighter, heavier, 'category')).toBeLessThan(0);

    const squat = record({ weightClass: '-83 kg', lift: 'squat' });
    const deadlift = record({ weightClass: '-83 kg', lift: 'deadlift' });
    expect(compareRecords(squat, deadlift, 'category')).toBeLessThan(0);
  });
});

describe('selectRecords', () => {
  const records = [
    record({ id: '1', name: 'Heavy', weightClass: '-120 kg', weightKg: 400, lift: 'squat' }),
    record({ id: '2', name: 'Light', weightClass: '-66 kg', weightKg: 250, lift: 'squat' }),
    record({ id: '3', name: 'Bench', weightClass: '-66 kg', weightKg: 180, lift: 'bench_press' }),
  ];

  it('filters then sorts without mutating the input', () => {
    const before = [...records];
    const filters: RecordFilters = { ...EMPTY_RECORD_FILTERS, weightClass: '-66 kg' };
    const result = selectRecords(records, filters, 'weight-desc');
    expect(result.map((r) => r.id)).toEqual(['2', '3']);
    expect(records).toEqual(before);
  });

  it('returns all records sorted by category when unfiltered', () => {
    const result = selectRecords(records, EMPTY_RECORD_FILTERS, 'category');
    // -66 kg classes before -120 kg; within -66, squat before bench.
    expect(result.map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('uses ALL_FILTER as the no-op sentinel', () => {
    expect(EMPTY_RECORD_FILTERS.region).toBe(ALL_FILTER);
  });
});
