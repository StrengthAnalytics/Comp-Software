import { RECORD_LIFTS } from '@/lib/constants';
import type { RecordView } from '@/lib/records/record-view';

// Pure filtering and sorting for the records screens. Shared by the admin manager and the public
// browser so the two can never disagree about which records match a set of filters or in what order.

export type RecordSortKey = 'category' | 'weight-desc' | 'date-desc' | 'name';

export type RecordFilters = {
  query: string;
  region: string;
  gender: string;
  lift: string;
  equipment: string;
  ageCategory: string;
  weightClass: string;
};

// Sentinel for "no filter on this field". Field values are never this, so it can't collide.
export const ALL_FILTER = 'all';

export const EMPTY_RECORD_FILTERS: RecordFilters = {
  query: '',
  region: ALL_FILTER,
  gender: ALL_FILTER,
  lift: ALL_FILTER,
  equipment: ALL_FILTER,
  ageCategory: ALL_FILTER,
  weightClass: ALL_FILTER,
};

// Leading number of a weight class ("-83 kg" → 83, "120 kg+" → 120) for a numeric class sort.
// Unparseable classes sort last.
export function weightClassValue(weightClass: string): number {
  const match = /\d+(\.\d+)?/.exec(weightClass);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

export function matchesRecordFilters(record: RecordView, filters: RecordFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query !== '' && !record.name.toLowerCase().includes(query)) {
    return false;
  }
  if (filters.region !== ALL_FILTER && record.region !== filters.region) {
    return false;
  }
  if (filters.gender !== ALL_FILTER && record.gender !== filters.gender) {
    return false;
  }
  if (filters.lift !== ALL_FILTER && record.lift !== filters.lift) {
    return false;
  }
  if (filters.equipment !== ALL_FILTER && record.equipment !== filters.equipment) {
    return false;
  }
  if (filters.ageCategory !== ALL_FILTER && record.ageCategory !== filters.ageCategory) {
    return false;
  }
  if (filters.weightClass !== ALL_FILTER && record.weightClass !== filters.weightClass) {
    return false;
  }
  return true;
}

export function compareRecords(a: RecordView, b: RecordView, sort: RecordSortKey): number {
  switch (sort) {
    case 'weight-desc': {
      return b.weightKg - a.weightKg;
    }
    case 'date-desc': {
      // Newest first; records with no date sort last.
      return (b.dateSet ?? '').localeCompare(a.dateSet ?? '');
    }
    case 'name': {
      return a.name.localeCompare(b.name);
    }
    case 'category': {
      return (
        a.region.localeCompare(b.region) ||
        a.gender.localeCompare(b.gender) ||
        weightClassValue(a.weightClass) - weightClassValue(b.weightClass) ||
        a.weightClass.localeCompare(b.weightClass) ||
        RECORD_LIFTS.indexOf(a.lift) - RECORD_LIFTS.indexOf(b.lift) ||
        a.ageCategory.localeCompare(b.ageCategory)
      );
    }
  }
}

// Filter then sort, returning a new array (never mutates the input).
export function selectRecords(
  records: readonly RecordView[],
  filters: RecordFilters,
  sort: RecordSortKey,
): RecordView[] {
  return records.filter((record) => matchesRecordFilters(record, filters)).toSorted((a, b) => compareRecords(a, b, sort));
}
