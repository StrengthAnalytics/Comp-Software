'use client';

import { useMemo, useState } from 'react';
import {
  ALL_FILTER,
  EMPTY_RECORD_FILTERS,
  selectRecords,
  weightClassValue,
  type RecordFilters,
  type RecordSortKey,
} from '@/lib/records/filter';
import type { RecordView } from '@/lib/records/record-view';
import { EmptyState } from '@/components/ui/empty-state';
import {
  RECORD_EQUIPMENT_LABELS,
  RECORD_GENDER_LABELS,
  RECORD_LIFT_LABELS,
  RECORD_LIFTS,
} from '@/lib/constants';

const FILTER_CLASS =
  'rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted((a, b) => a.localeCompare(b));
}

export function RecordsBrowser({ records }: { records: RecordView[] }) {
  const [filters, setFilters] = useState<RecordFilters>(EMPTY_RECORD_FILTERS);
  const [sort, setSort] = useState<RecordSortKey>('category');

  const regionOptions = useMemo(() => uniqueSorted(records.map((record) => record.region)), [records]);
  const ageOptions = useMemo(() => uniqueSorted(records.map((record) => record.ageCategory)), [records]);
  const weightClassOptions = useMemo(
    () => [...new Set(records.map((record) => record.weightClass))].toSorted((a, b) => weightClassValue(a) - weightClassValue(b)),
    [records],
  );

  const filtered = useMemo(() => selectRecords(records, filters, sort), [records, filters, sort]);

  function setFilter<K extends keyof RecordFilters>(key: K, value: RecordFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const hasActiveFilters =
    filters.query.trim() !== '' ||
    filters.region !== ALL_FILTER ||
    filters.gender !== ALL_FILTER ||
    filters.lift !== ALL_FILTER ||
    filters.equipment !== ALL_FILTER ||
    filters.ageCategory !== ALL_FILTER ||
    filters.weightClass !== ALL_FILTER;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">UK Powerlifting Records</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Regional and national British Powerlifting records. {records.length} record
          {records.length === 1 ? '' : 's'} on file.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.query}
          onChange={(event) => setFilter('query', event.target.value)}
          placeholder="Find by name…"
          className={`${FILTER_CLASS} min-w-48`}
          aria-label="Find by name"
        />
        <select
          value={filters.region}
          onChange={(event) => setFilter('region', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Region"
        >
          <option value={ALL_FILTER}>All regions</option>
          {regionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={filters.gender}
          onChange={(event) => setFilter('gender', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Sex"
        >
          <option value={ALL_FILTER}>All sexes</option>
          <option value="M">{RECORD_GENDER_LABELS.M}</option>
          <option value="F">{RECORD_GENDER_LABELS.F}</option>
        </select>
        <select
          value={filters.weightClass}
          onChange={(event) => setFilter('weightClass', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Weight class"
        >
          <option value={ALL_FILTER}>All classes</option>
          {weightClassOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={filters.lift}
          onChange={(event) => setFilter('lift', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Lift"
        >
          <option value={ALL_FILTER}>All lifts</option>
          {RECORD_LIFTS.map((option) => (
            <option key={option} value={option}>
              {RECORD_LIFT_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          value={filters.equipment}
          onChange={(event) => setFilter('equipment', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Equipment"
        >
          <option value={ALL_FILTER}>All equipment</option>
          <option value="equipped">{RECORD_EQUIPMENT_LABELS.equipped}</option>
          <option value="unequipped">{RECORD_EQUIPMENT_LABELS.unequipped}</option>
        </select>
        <select
          value={filters.ageCategory}
          onChange={(event) => setFilter('ageCategory', event.target.value)}
          className={FILTER_CLASS}
          aria-label="Age category"
        >
          <option value={ALL_FILTER}>All ages</option>
          {ageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as RecordSortKey)}
          className={`${FILTER_CLASS} ml-auto`}
          aria-label="Sort"
        >
          <option value="category">Sort: category</option>
          <option value="weight-desc">Sort: heaviest</option>
          <option value="date-desc">Sort: newest</option>
          <option value="name">Sort: name</option>
        </select>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_RECORD_FILTERS)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-neutral-600" role="status">
        Showing {filtered.length} record{filtered.length === 1 ? '' : 's'}.
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={records.length === 0 ? 'No records published yet' : 'No records match these filters'}
          description={
            records.length === 0
              ? 'UK regional and national records will appear here once published.'
              : 'Adjust or clear the filters above.'
          }
        />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Sex</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Lift</th>
                <th className="px-3 py-2 font-medium">Kit</th>
                <th className="px-3 py-2 text-right font-medium">Record (kg)</th>
                <th className="px-3 py-2 font-medium">Holder</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 text-neutral-700">{record.region}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.gender}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.weightClass}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.ageCategory}</td>
                  <td className="px-3 py-2 text-neutral-700">{RECORD_LIFT_LABELS[record.lift]}</td>
                  <td className="px-3 py-2 text-neutral-700">{RECORD_EQUIPMENT_LABELS[record.equipment]}</td>
                  <td className="px-3 py-2 text-right font-semibold text-neutral-900">{record.weightKg.toFixed(1)}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900">{record.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{record.dateSet ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
