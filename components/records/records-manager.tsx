'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteRecordAction } from '@/actions/records';
import { formatRecordsExport, type RecordExportRow } from '@/lib/records/bulk-import';
import { ALL_FILTER, selectRecords, type RecordFilters, type RecordSortKey } from '@/lib/records/filter';
import type { RecordView } from '@/lib/records/record-view';
import {
  RECORD_EQUIPMENT_LABELS,
  RECORD_GENDER_LABELS,
  RECORD_LIFT_LABELS,
  RECORD_LIFTS,
} from '@/lib/constants';
import { RecordForm } from '@/components/records/record-form';
import { RecordsBulkImport } from '@/components/records/records-bulk-import';

const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const FILTER_CLASS =
  'rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const COPY_RESET_MS = 2000;
const ALL = ALL_FILTER;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted((a, b) => a.localeCompare(b));
}

function toExportRow(record: RecordView): RecordExportRow {
  return {
    region: record.region,
    name: record.name,
    weightClass: record.weightClass,
    gender: record.gender,
    lift: record.lift,
    ageCategory: record.ageCategory,
    weightKg: record.weightKg,
    dateSet: record.dateSet,
    equipment: record.equipment,
  };
}

export function RecordsManager({ records }: { records: RecordView[] }) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState(ALL);
  const [gender, setGender] = useState(ALL);
  const [lift, setLift] = useState(ALL);
  const [equipment, setEquipment] = useState(ALL);
  const [ageCategory, setAgeCategory] = useState(ALL);
  const [sort, setSort] = useState<RecordSortKey>('category');

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RecordView | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const regionOptions = useMemo(() => uniqueSorted(records.map((record) => record.region)), [records]);
  const ageOptions = useMemo(() => uniqueSorted(records.map((record) => record.ageCategory)), [records]);

  const filtered = useMemo(() => {
    const filters: RecordFilters = {
      query,
      region,
      gender,
      lift,
      equipment,
      ageCategory,
      weightClass: ALL,
    };
    return selectRecords(records, filters, sort);
  }, [records, query, region, gender, lift, equipment, ageCategory, sort]);

  function closeForms() {
    setShowAdd(false);
    setEditing(null);
  }

  function onSaved() {
    closeForms();
    router.refresh();
  }

  function deleteRecord(id: string) {
    setActionError(null);
    startTransition(async () => {
      const outcome = await deleteRecordAction({ id });
      if (outcome.status === 'error') {
        setActionError(outcome.message);
        return;
      }
      setConfirmingDelete(null);
      router.refresh();
    });
  }

  async function copyExport() {
    setActionError(null);
    try {
      await globalThis.navigator.clipboard.writeText(
        formatRecordsExport(filtered.map((record) => toExportRow(record))),
      );
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setActionError('Could not copy to the clipboard.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UK records</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {records.length} record{records.length === 1 ? '' : 's'}.{' '}
            <Link href="/records" target="_blank" rel="noopener" className="underline hover:text-neutral-900">
              View the public page
            </Link>{' '}
            (opens in a new tab).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyExport()}
            disabled={filtered.length === 0}
            className={GHOST_BUTTON}
          >
            {copied ? 'Copied' : `Copy ${filtered.length} to spreadsheet`}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowAdd((open) => !open);
            }}
            className={PRIMARY_BUTTON}
          >
            Add record
          </button>
        </div>
      </div>

      {showAdd ? <RecordForm onClose={closeForms} onSaved={onSaved} /> : null}
      {editing ? <RecordForm initial={editing} onClose={closeForms} onSaved={onSaved} /> : null}

      <RecordsBulkImport />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find by name…"
          className={`${FILTER_CLASS} min-w-48`}
          aria-label="Find by name"
        />
        <select value={region} onChange={(event) => setRegion(event.target.value)} className={FILTER_CLASS} aria-label="Region">
          <option value={ALL}>All regions</option>
          {regionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={gender} onChange={(event) => setGender(event.target.value)} className={FILTER_CLASS} aria-label="Gender">
          <option value={ALL}>All genders</option>
          <option value="M">{RECORD_GENDER_LABELS.M}</option>
          <option value="F">{RECORD_GENDER_LABELS.F}</option>
        </select>
        <select value={lift} onChange={(event) => setLift(event.target.value)} className={FILTER_CLASS} aria-label="Lift">
          <option value={ALL}>All lifts</option>
          {RECORD_LIFTS.map((option) => (
            <option key={option} value={option}>
              {RECORD_LIFT_LABELS[option]}
            </option>
          ))}
        </select>
        <select
          value={equipment}
          onChange={(event) => setEquipment(event.target.value)}
          className={FILTER_CLASS}
          aria-label="Equipment"
        >
          <option value={ALL}>All equipment</option>
          <option value="equipped">{RECORD_EQUIPMENT_LABELS.equipped}</option>
          <option value="unequipped">{RECORD_EQUIPMENT_LABELS.unequipped}</option>
        </select>
        <select
          value={ageCategory}
          onChange={(event) => setAgeCategory(event.target.value)}
          className={FILTER_CLASS}
          aria-label="Age category"
        >
          <option value={ALL}>All ages</option>
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
      </div>

      {actionError ? (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          {records.length === 0 ? 'No records yet. Add one, or bulk add from a spreadsheet.' : 'No records match these filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Holder</th>
                <th className="px-3 py-2 font-medium">Sex</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Lift</th>
                <th className="px-3 py-2 font-medium">Kit</th>
                <th className="px-3 py-2 text-right font-medium">kg</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 text-neutral-700">{record.region}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900">{record.name}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.gender}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.weightClass}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.ageCategory}</td>
                  <td className="px-3 py-2 text-neutral-700">{RECORD_LIFT_LABELS[record.lift]}</td>
                  <td className="px-3 py-2 text-neutral-700">{RECORD_EQUIPMENT_LABELS[record.equipment]}</td>
                  <td className="px-3 py-2 text-right font-medium text-neutral-900">{record.weightKg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-neutral-700">{record.dateSet ?? '—'}</td>
                  <td className="max-w-48 truncate px-3 py-2 text-neutral-500" title={record.notes ?? ''}>
                    {record.notes ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    {confirmingDelete === record.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => deleteRecord(record.id)}
                          disabled={pending}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(null)}
                          className="text-xs text-neutral-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAdd(false);
                            setEditing(record);
                          }}
                          className="text-xs font-medium text-neutral-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setConfirmingDelete(record.id);
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
