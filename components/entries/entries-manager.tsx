'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createEntryAction,
  deleteEntryAction,
  recalculateAgeCategoriesAction,
  updateEntryAction,
} from '@/actions/entries';
import { useEntriesSubscription } from '@/lib/realtime/use-entries-subscription';
import { useDebouncedRefresh } from '@/lib/realtime/use-debounced-refresh';
import { reconcileForm, type EntryFormValues } from '@/lib/entries/form-sync';
import {
  createLifterAction,
  deleteLifterAction,
  searchLiftersAction,
  updateLifterAction,
  type LifterSearchResult,
} from '@/actions/lifters';
import {
  BENCH_SPOTTING_LABELS,
  BENCH_SPOTTINGS,
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  GENDER_LABELS,
  GENDERS,
  SQUAT_RACK_SETTING_LABELS,
  SQUAT_RACK_SETTINGS,
  type BenchSpotting,
  type Gender,
  type Lifts,
  type SquatRackSetting,
} from '@/lib/constants';
import { BulkImport } from '@/components/entries/bulk-import';
import { DeleteAllEntries } from '@/components/entries/delete-all-entries';
import { OptionalSelectField } from '@/components/optional-select-field';
import { formatBulkExport, type ExportRow } from '@/lib/entries/bulk-import';
import { formatLifterName } from '@/lib/lifters/name';
import { numberToInput, parseOptionalNumber } from '@/lib/number-input';
import type { ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type EntryStatus = Database['public']['Enums']['entry_status'];

export type EntryLifter = {
  id: string;
  first_name: string;
  surname: string;
  gender: string;
  date_of_birth: string | null;
  ipf_member_id: string | null;
  club: string | null;
  country: string | null;
};

export type EntryWithLifter = {
  id: string;
  weight_class_id: string | null;
  division_id: string | null;
  lot_number: number | null;
  bodyweight_kg: number | null;
  opener_squat_kg: number | null;
  opener_bench_kg: number | null;
  opener_deadlift_kg: number | null;
  rack_height_squat: number | null;
  squat_rack_setting: SquatRackSetting | null;
  rack_height_bench: number | null;
  bench_safety_height: number | null;
  bench_spotting: BenchSpotting | null;
  status: EntryStatus;
  lifter: EntryLifter;
};

export type DivisionOption = { id: string; name: string };
export type WeightClassOption = { id: string; name: string; gender: string };

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

// Surfaces the most specific message an action returned: a field error when present, else the
// form-level message. Entry validation reports failures per field (e.g. mismatched gender).
function readError(result: ActionResult<unknown>): string {
  if (result.status !== 'error') {
    return '';
  }
  const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return firstField?.[0] ?? result.message;
}

function asGender(value: string): Gender {
  return value === 'female' ? 'female' : 'male';
}

function fullName(lifter: { first_name: string; surname: string }): string {
  return formatLifterName(lifter.surname, lifter.first_name);
}

// Snapshot of an entry's editable fields in their controlled-input (string) form, so the card can
// reconcile a fresh server snapshot against what's in the boxes (see reconcileForm).
function entryToForm(entry: EntryWithLifter): EntryFormValues {
  return {
    weightClassId: entry.weight_class_id ?? '',
    divisionId: entry.division_id ?? '',
    lotNumber: numberToInput(entry.lot_number),
    bodyweight: numberToInput(entry.bodyweight_kg),
    openerSquat: numberToInput(entry.opener_squat_kg),
    openerBench: numberToInput(entry.opener_bench_kg),
    openerDeadlift: numberToInput(entry.opener_deadlift_kg),
    rackSquat: numberToInput(entry.rack_height_squat),
    squatSetting: entry.squat_rack_setting ?? '',
    rackBench: numberToInput(entry.rack_height_bench),
    benchSafety: numberToInput(entry.bench_safety_height),
    benchSpotting: entry.bench_spotting ?? '',
    status: entry.status,
  };
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />
    </label>
  );
}

// Edits the persistent lifter behind an entry. Membership numbers change year to year, so this is
// how a returning lifter's number (and other details) get refreshed at re-registration.
function LifterDetailsEditor({ lifter, onClose }: { lifter: EntryLifter; onClose: () => void }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(lifter.first_name);
  const [surname, setSurname] = useState(lifter.surname);
  const [gender, setGender] = useState<Gender>(asGender(lifter.gender));
  const [membership, setMembership] = useState(lifter.ipf_member_id ?? '');
  const [club, setClub] = useState(lifter.club ?? '');
  const [country, setCountry] = useState(lifter.country ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(lifter.date_of_birth ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateLifterAction({
        id: lifter.id,
        first_name: firstName,
        surname,
        gender,
        date_of_birth: dateOfBirth.trim() || null,
        ipf_member_id: membership.trim() || null,
        club: club.trim() || null,
        country: country.trim() || null,
      });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="First name" value={firstName} onChange={setFirstName} />
        <TextField label="Surname" value={surname} onChange={setSurname} />
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Gender</span>
          <select value={gender} onChange={(event) => setGender(asGender(event.target.value))} className={INPUT_CLASS}>
            {GENDERS.map((value) => (
              <option key={value} value={value}>
                {GENDER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Membership number" value={membership} onChange={setMembership} />
        <TextField label="Club" value={club} onChange={setClub} />
        <TextField label="Country" value={country} onChange={setCountry} />
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Date of birth</span>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || firstName.trim() === ''}
          className={PRIMARY_BUTTON}
        >
          {pending ? 'Saving…' : 'Save lifter'}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={GHOST_BUTTON}>
          Cancel
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function EntryCard({
  competitionId,
  entry,
  lifts,
  divisions,
  weightClasses,
}: {
  competitionId: string;
  entry: EntryWithLifter;
  lifts: Lifts;
  divisions: DivisionOption[];
  weightClasses: WeightClassOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<EntryFormValues>(() => entryToForm(entry));
  // The server snapshot the boxes were last seeded from, held in a ref so the reconcile effect can read
  // it without re-running. Lets us tell the operator's unsaved edits apart from a change that landed
  // from another screen.
  const baselineRef = useRef<EntryFormValues>(form);
  const formRef = useRef<EntryFormValues>(form);
  formRef.current = form;
  // A change that arrived from another screen (a run-screen opener correction, a weigh-in save) while
  // this card had unsaved edits — surfaced so the operator can pull it in rather than overwrite it.
  const [externalUpdate, setExternalUpdate] = useState<EntryFormValues | null>(null);
  const [editingLifter, setEditingLifter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = useCallback(<K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  // Reconcile a fresh server snapshot (re-pulled by the manager's router.refresh after a real-time
  // entry change) into the form. The `entry` prop changes identity on every refresh, so the effect runs
  // each time and reconcileForm decides whether anything actually changed. Refs/setters are stable, so
  // `entry` is the only dependency.
  useEffect(() => {
    const incoming = entryToForm(entry);
    const action = reconcileForm(incoming, formRef.current, baselineRef.current);
    switch (action.type) {
      case 'ignore': {
        return;
      }
      case 'rebase': {
        baselineRef.current = action.snapshot;
        setExternalUpdate(null);
        return;
      }
      case 'apply': {
        baselineRef.current = action.snapshot;
        setForm(action.snapshot);
        setExternalUpdate(null);
        return;
      }
      case 'flag': {
        setExternalUpdate(action.snapshot);
        return;
      }
    }
  }, [entry]);

  // Adopt the change that arrived elsewhere, discarding this card's unsaved edits.
  function loadExternalUpdate() {
    if (!externalUpdate) {
      return;
    }
    baselineRef.current = externalUpdate;
    setForm(externalUpdate);
    setExternalUpdate(null);
  }

  // A lifter only competes in weight classes for their own gender.
  const classOptions = weightClasses.filter((weightClass) => weightClass.gender === entry.lifter.gender);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateEntryAction({
        id: entry.id,
        competitionId,
        weightClassId: form.weightClassId === '' ? null : form.weightClassId,
        divisionId: form.divisionId === '' ? null : form.divisionId,
        lotNumber: parseOptionalNumber(form.lotNumber),
        bodyweightKg: parseOptionalNumber(form.bodyweight),
        openerSquatKg: lifts.squat ? parseOptionalNumber(form.openerSquat) : null,
        openerBenchKg: lifts.bench ? parseOptionalNumber(form.openerBench) : null,
        openerDeadliftKg: lifts.deadlift ? parseOptionalNumber(form.openerDeadlift) : null,
        rackHeightSquat: lifts.squat ? parseOptionalNumber(form.rackSquat) : null,
        squatRackSetting: lifts.squat && form.squatSetting !== '' ? form.squatSetting : null,
        rackHeightBench: lifts.bench ? parseOptionalNumber(form.rackBench) : null,
        benchSafetyHeight: lifts.bench ? parseOptionalNumber(form.benchSafety) : null,
        benchSpotting: lifts.bench && form.benchSpotting !== '' ? form.benchSpotting : null,
        status: form.status,
      });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!globalThis.confirm(`Remove ${fullName(entry.lifter)} from this competition?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteEntryAction({ id: entry.id });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{fullName(entry.lifter)}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {GENDER_LABELS[asGender(entry.lifter.gender)]}
            {entry.lifter.ipf_member_id ? ` · Membership ${entry.lifter.ipf_member_id}` : ''}
            {entry.lifter.club ? ` · ${entry.lifter.club}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingLifter((value) => !value)}
            disabled={pending}
            className={GHOST_BUTTON}
          >
            {editingLifter ? 'Close' : 'Edit lifter'}
          </button>
          <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
            Remove
          </button>
        </div>
      </div>

      {editingLifter ? (
        <LifterDetailsEditor lifter={entry.lifter} onClose={() => setEditingLifter(false)} />
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Weight class</span>
          <select
            value={form.weightClassId}
            onChange={(event) => update('weightClassId', event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">—</option>
            {classOptions.map((weightClass) => (
              <option key={weightClass.id} value={weightClass.id}>
                {weightClass.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Division</span>
          <select
            value={form.divisionId}
            onChange={(event) => update('divisionId', event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">—</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>

        <NumberField label="Lot number" value={form.lotNumber} onChange={(value) => update('lotNumber', value)} step="1" />
        <NumberField
          label="Bodyweight (kg)"
          value={form.bodyweight}
          onChange={(value) => update('bodyweight', value)}
          step="0.01"
        />

        {lifts.squat ? (
          <NumberField
            label="Opening squat (kg)"
            value={form.openerSquat}
            onChange={(value) => update('openerSquat', value)}
            step="0.5"
          />
        ) : null}
        {lifts.bench ? (
          <NumberField
            label="Opening bench (kg)"
            value={form.openerBench}
            onChange={(value) => update('openerBench', value)}
            step="0.5"
          />
        ) : null}
        {lifts.deadlift ? (
          <NumberField
            label="Opening deadlift (kg)"
            value={form.openerDeadlift}
            onChange={(value) => update('openerDeadlift', value)}
            step="0.5"
          />
        ) : null}

        {lifts.squat ? (
          <NumberField
            label="Squat rack height"
            value={form.rackSquat}
            onChange={(value) => update('rackSquat', value)}
            step="1"
          />
        ) : null}
        {lifts.squat ? (
          <OptionalSelectField
            label="Squat rack setting"
            value={form.squatSetting}
            onChange={(value) => update('squatSetting', value)}
            options={SQUAT_RACK_SETTINGS}
            labels={SQUAT_RACK_SETTING_LABELS}
          />
        ) : null}
        {lifts.bench ? (
          <NumberField
            label="Bench height"
            value={form.rackBench}
            onChange={(value) => update('rackBench', value)}
            step="1"
          />
        ) : null}
        {lifts.bench ? (
          <NumberField
            label="Bench safety height"
            value={form.benchSafety}
            onChange={(value) => update('benchSafety', value)}
            step="1"
          />
        ) : null}
        {lifts.bench ? (
          <OptionalSelectField
            label="Bench spotting"
            value={form.benchSpotting}
            onChange={(value) => update('benchSpotting', value)}
            options={BENCH_SPOTTINGS}
            labels={BENCH_SPOTTING_LABELS}
          />
        ) : null}

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Status</span>
          <select
            value={form.status}
            onChange={(event) => {
              // The select only renders ENTRY_STATUSES values, so this narrowing is exact.
              update('status', event.target.value as EntryStatus);
            }}
            className={INPUT_CLASS}
          >
            {ENTRY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ENTRY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {externalUpdate ? (
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          This lifter was updated on another screen while you were editing. Saving will overwrite that
          change.
          <button type="button" onClick={loadExternalUpdate} className="font-medium underline">
            Load their changes
          </button>
          <span className="text-amber-700">(discards your unsaved edits)</span>
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function NewLifterForm({
  competitionId,
  onDone,
}: {
  competitionId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [membership, setMembership] = useState('');
  const [club, setClub] = useState('');
  const [country, setCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const created = await createLifterAction({
        first_name: firstName,
        surname,
        gender,
        date_of_birth: dateOfBirth.trim() || null,
        ipf_member_id: membership.trim() || null,
        club: club.trim() || null,
        country: country.trim() || null,
      });
      if (created.status === 'error') {
        setError(readError(created));
        return;
      }

      const registered = await createEntryAction({ competitionId, lifterId: created.data.id });
      if (registered.status === 'error') {
        // Registration failed after the lifter was created — roll the lifter back so a retry doesn't
        // leave an orphaned (entry-less) duplicate. Best-effort: the registration error is what the
        // operator needs to see and fix.
        await deleteLifterAction({ id: created.data.id });
        setError(readError(registered));
        return;
      }

      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="First name" value={firstName} onChange={setFirstName} />
        <TextField label="Surname" value={surname} onChange={setSurname} />
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Gender</span>
          <select value={gender} onChange={(event) => setGender(asGender(event.target.value))} className={INPUT_CLASS}>
            {GENDERS.map((value) => (
              <option key={value} value={value}>
                {GENDER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Membership number" value={membership} onChange={setMembership} />
        <TextField label="Club" value={club} onChange={setClub} />
        <TextField label="Country" value={country} onChange={setCountry} />
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Date of birth (required)</span>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || firstName.trim() === '' || dateOfBirth.trim() === ''}
          className={PRIMARY_BUTTON}
        >
          {pending ? 'Registering…' : 'Create & register'}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className={GHOST_BUTTON}>
          Cancel
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AddEntry({
  competitionId,
  registeredLifterIds,
}: {
  competitionId: string;
  registeredLifterIds: Set<string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LifterSearchResult[] | null>(null);
  const [showNewLifter, setShowNewLifter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchLiftersAction(query);
      if (result.status === 'error') {
        setError(readError(result));
        setResults(null);
        return;
      }
      setResults(result.data);
    });
  }

  function register(lifterId: string) {
    setError(null);
    startTransition(async () => {
      const result = await createEntryAction({ competitionId, lifterId });
      if (result.status === 'error') {
        setError(readError(result));
        return;
      }
      setResults(null);
      setQuery('');
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Add a lifter</h2>
        <button
          type="button"
          onClick={() => setShowNewLifter((value) => !value)}
          disabled={pending}
          className={GHOST_BUTTON}
        >
          {showNewLifter ? 'Search instead' : 'New lifter'}
        </button>
      </div>

      {showNewLifter ? (
        <NewLifterForm competitionId={competitionId} onDone={() => setShowNewLifter(false)} />
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Search by surname"
              placeholder="Search by surname"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  search();
                }
              }}
              className={`${INPUT_CLASS} flex-1`}
            />
            <button
              type="button"
              onClick={search}
              disabled={pending || query.trim() === ''}
              className={PRIMARY_BUTTON}
            >
              Search
            </button>
          </div>

          {results ? (
            <div className="mt-4 divide-y divide-neutral-100">
              {results.length === 0 ? (
                <p className="py-2 text-sm text-neutral-500">
                  No lifters found. Use “New lifter” to add one.
                </p>
              ) : (
                results.map((lifter) => {
                  const alreadyEntered = registeredLifterIds.has(lifter.id);
                  // The age category is assigned from the date of birth, so a lifter without one on
                  // file can't be registered until it's added (e.g. via a bulk import that carries it).
                  const missingDob = !lifter.date_of_birth;
                  return (
                    <div key={lifter.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{fullName(lifter)}</p>
                        <p className="text-xs text-neutral-500">
                          {GENDER_LABELS[asGender(lifter.gender)]}
                          {lifter.ipf_member_id ? ` · Membership ${lifter.ipf_member_id}` : ''}
                          {lifter.club ? ` · ${lifter.club}` : ''}
                        </p>
                      </div>
                      {alreadyEntered ? (
                        <span className="text-xs text-neutral-400">Already entered</span>
                      ) : (
                        missingDob ? (
                          <span className="text-xs text-amber-700">Add a date of birth to register</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => register(lifter.id)}
                            disabled={pending}
                            className={GHOST_BUTTON}
                          >
                            Register
                          </button>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const COPY_RESET_MS = 2000;

function CopyEntriesButton({
  entries,
  divisions,
  weightClasses,
  lifts,
}: {
  entries: EntryWithLifter[];
  divisions: DivisionOption[];
  weightClasses: WeightClassOption[];
  lifts: Lifts;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entries.length === 0) {
    return null;
  }

  const divisionNameById = new Map(divisions.map((division) => [division.id, division.name]));
  const weightClassNameById = new Map(weightClasses.map((weightClass) => [weightClass.id, weightClass.name]));

  async function copy() {
    setError(null);
    const rows: ExportRow[] = entries.map((entry) => ({
      firstName: entry.lifter.first_name,
      surname: entry.lifter.surname,
      gender: entry.lifter.gender,
      dateOfBirth: entry.lifter.date_of_birth,
      membership: entry.lifter.ipf_member_id,
      club: entry.lifter.club,
      country: entry.lifter.country,
      divisionName: entry.division_id ? (divisionNameById.get(entry.division_id) ?? null) : null,
      weightClassName: entry.weight_class_id ? (weightClassNameById.get(entry.weight_class_id) ?? null) : null,
      lot: entry.lot_number,
      bodyweight: entry.bodyweight_kg,
      openerSquat: entry.opener_squat_kg,
      openerBench: entry.opener_bench_kg,
      openerDeadlift: entry.opener_deadlift_kg,
    }));

    try {
      await globalThis.navigator.clipboard.writeText(formatBulkExport(rows, lifts));
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setError('Could not copy automatically.');
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
      <button type="button" onClick={() => void copy()} className={GHOST_BUTTON}>
        {copied ? 'Copied' : 'Copy current entries'}
      </button>
    </div>
  );
}

// Re-derives every registered lifter's age division from the comp date and their current date of
// birth. The division is otherwise only assigned at registration, so this is the way to pick up a
// date-of-birth correction made afterwards. Confirms first (it overrides any manual division change)
// and reports a one-line summary of what changed.
function RecalculateAgeCategories({
  competitionId,
  entryCount,
}: {
  competitionId: string;
  entryCount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    const confirmed = globalThis.confirm(
      `Recalculate age categories for all ${entryCount} lifter${entryCount === 1 ? '' : 's'} from their date of birth? ` +
        "This sets each lifter's division to their age category and overrides any manual division change.",
    );
    if (!confirmed) {
      return;
    }
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const result = await recalculateAgeCategoriesAction({ competitionId });
      if (result.status === 'error') {
        setIsError(true);
        setMessage(readError(result));
        return;
      }
      const { updated, unchanged, noDateOfBirth, noMatchingDivision } = result.data;
      const parts = [`${updated} updated`, `${unchanged} unchanged`];
      if (noDateOfBirth > 0) {
        parts.push(`${noDateOfBirth} no date of birth`);
      }
      if (noMatchingDivision > 0) {
        parts.push(`${noMatchingDivision} no matching division`);
      }
      setMessage(parts.join(' · '));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {message ? (
        <span role={isError ? 'alert' : 'status'} className={`text-xs ${isError ? 'text-red-600' : 'text-neutral-600'}`}>
          {message}
        </span>
      ) : null}
      <button type="button" onClick={run} disabled={pending} className={GHOST_BUTTON}>
        {pending ? 'Recalculating…' : 'Recalculate age categories'}
      </button>
    </div>
  );
}

export function EntriesManager({
  competitionId,
  competitionName,
  competitionStatus,
  competitionStartsOn,
  lifts,
  divisions,
  weightClasses,
  entries,
}: {
  competitionId: string;
  competitionName: string;
  competitionStatus: Database['public']['Enums']['comp_status'];
  competitionStartsOn: string | null;
  lifts: Lifts;
  divisions: DivisionOption[];
  weightClasses: WeightClassOption[];
  entries: EntryWithLifter[];
}) {
  const registeredLifterIds = new Set(entries.map((entry) => entry.lifter.id));
  const [query, setQuery] = useState('');

  // Real-time: when an entry changes on another screen — a weigh-in save, or the head table correcting
  // an opener (which writes back to the entry's opener column) — re-pull the server props so every card
  // reconciles the change. A card with no unsaved edits adopts it; one mid-edit keeps the operator's
  // edits and flags the incoming change (see EntryCard / reconcileForm). Coalesced into one refresh, and
  // scoped to this competition (inherits RLS). New registrations and removals from elsewhere arrive the
  // same way, re-running the server fetch that joins the lifter and re-sorts the list.
  const scheduleRefresh = useDebouncedRefresh();
  useEntriesSubscription(competitionId, scheduleRefresh);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      normalizedQuery === ''
        ? entries
        : entries.filter((entry) => fullName(entry.lifter).toLowerCase().includes(normalizedQuery)),
    [entries, normalizedQuery],
  );

  const hasDate = competitionStartsOn !== null;

  return (
    <div className="space-y-6">
      {hasDate ? (
        <>
          <AddEntry competitionId={competitionId} registeredLifterIds={registeredLifterIds} />
          <BulkImport competitionId={competitionId} lifts={lifts} />
        </>
      ) : (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold tracking-tight text-amber-900">Set a competition date first</h2>
          <p className="mt-1 text-sm text-amber-800">
            Lifters are assigned an age category automatically from the competition date and each lifter&rsquo;s date
            of birth, so adding lifters is disabled until this competition has a date. Add one on the{' '}
            <a className="font-medium underline" href={`/comps/${competitionId}/edit`}>
              Setup screen
            </a>
            , then come back to register lifters.
          </p>
        </section>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Registered lifters{entries.length > 0 ? ` (${entries.length})` : ''}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {entries.length > 0 ? (
              <input
                type="search"
                aria-label="Find a lifter by name"
                placeholder="Find a lifter…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={`${INPUT_CLASS} w-56`}
              />
            ) : null}
            {hasDate && competitionStatus !== 'completed' && entries.length > 0 ? (
              <RecalculateAgeCategories competitionId={competitionId} entryCount={entries.length} />
            ) : null}
            <CopyEntriesButton
              entries={entries}
              divisions={divisions}
              weightClasses={weightClasses}
              lifts={lifts}
            />
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
            No lifters registered yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {visibleEntries.length === 0 ? (
              <p className="text-sm text-neutral-500">No lifters match “{query.trim()}”.</p>
            ) : (
              visibleEntries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  competitionId={competitionId}
                  entry={entry}
                  lifts={lifts}
                  divisions={divisions}
                  weightClasses={weightClasses}
                />
              ))
            )}
          </div>
        )}
      </div>

      <DeleteAllEntries
        competitionId={competitionId}
        competitionName={competitionName}
        competitionStatus={competitionStatus}
        entryCount={entries.length}
      />
    </div>
  );
}
