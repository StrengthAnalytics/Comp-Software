'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEntryAction, deleteEntryAction, updateEntryAction } from '@/actions/entries';
import {
  createLifterAction,
  searchLiftersAction,
  updateLifterAction,
  type LifterSearchResult,
} from '@/actions/lifters';
import {
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  GENDER_LABELS,
  GENDERS,
  type Gender,
  type Lifts,
} from '@/lib/constants';
import { BulkImport } from '@/components/entries/bulk-import';
import { formatBulkExport, type ExportRow } from '@/lib/entries/bulk-import';
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
  rack_height_squat: string | null;
  rack_height_bench: string | null;
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

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function numberToInput(value: number | null): string {
  return value === null ? '' : String(value);
}

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
  return `${lifter.surname}, ${lifter.first_name}`;
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
          disabled={pending || firstName.trim() === '' || surname.trim() === ''}
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
  const [weightClassId, setWeightClassId] = useState(entry.weight_class_id ?? '');
  const [divisionId, setDivisionId] = useState(entry.division_id ?? '');
  const [lotNumber, setLotNumber] = useState(numberToInput(entry.lot_number));
  const [bodyweight, setBodyweight] = useState(numberToInput(entry.bodyweight_kg));
  const [openerSquat, setOpenerSquat] = useState(numberToInput(entry.opener_squat_kg));
  const [openerBench, setOpenerBench] = useState(numberToInput(entry.opener_bench_kg));
  const [openerDeadlift, setOpenerDeadlift] = useState(numberToInput(entry.opener_deadlift_kg));
  const [rackSquat, setRackSquat] = useState(entry.rack_height_squat ?? '');
  const [rackBench, setRackBench] = useState(entry.rack_height_bench ?? '');
  const [status, setStatus] = useState<EntryStatus>(entry.status);
  const [editingLifter, setEditingLifter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A lifter only competes in weight classes for their own gender.
  const classOptions = weightClasses.filter((weightClass) => weightClass.gender === entry.lifter.gender);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateEntryAction({
        id: entry.id,
        competitionId,
        weightClassId: weightClassId === '' ? null : weightClassId,
        divisionId: divisionId === '' ? null : divisionId,
        lotNumber: parseOptionalNumber(lotNumber),
        bodyweightKg: parseOptionalNumber(bodyweight),
        openerSquatKg: lifts.squat ? parseOptionalNumber(openerSquat) : null,
        openerBenchKg: lifts.bench ? parseOptionalNumber(openerBench) : null,
        openerDeadliftKg: lifts.deadlift ? parseOptionalNumber(openerDeadlift) : null,
        rackHeightSquat: lifts.squat ? rackSquat.trim() || null : null,
        rackHeightBench: lifts.bench ? rackBench.trim() || null : null,
        status,
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
            value={weightClassId}
            onChange={(event) => setWeightClassId(event.target.value)}
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
          <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} className={INPUT_CLASS}>
            <option value="">—</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>

        <NumberField label="Lot number" value={lotNumber} onChange={setLotNumber} step="1" />
        <NumberField label="Bodyweight (kg)" value={bodyweight} onChange={setBodyweight} step="0.1" />

        {lifts.squat ? (
          <NumberField label="Opening squat (kg)" value={openerSquat} onChange={setOpenerSquat} step="0.5" />
        ) : null}
        {lifts.bench ? (
          <NumberField label="Opening bench (kg)" value={openerBench} onChange={setOpenerBench} step="0.5" />
        ) : null}
        {lifts.deadlift ? (
          <NumberField label="Opening deadlift (kg)" value={openerDeadlift} onChange={setOpenerDeadlift} step="0.5" />
        ) : null}

        {lifts.squat ? <TextField label="Squat rack height" value={rackSquat} onChange={setRackSquat} /> : null}
        {lifts.bench ? <TextField label="Bench rack height" value={rackBench} onChange={setRackBench} /> : null}

        <label className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>Status</span>
          <select
            value={status}
            onChange={(event) => {
              // The select only renders ENTRY_STATUSES values, so this narrowing is exact.
              setStatus(event.target.value as EntryStatus);
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
          onClick={submit}
          disabled={pending || firstName.trim() === '' || surname.trim() === ''}
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
                        <button
                          type="button"
                          onClick={() => register(lifter.id)}
                          disabled={pending}
                          className={GHOST_BUTTON}
                        >
                          Register
                        </button>
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

export function EntriesManager({
  competitionId,
  lifts,
  divisions,
  weightClasses,
  entries,
}: {
  competitionId: string;
  lifts: Lifts;
  divisions: DivisionOption[];
  weightClasses: WeightClassOption[];
  entries: EntryWithLifter[];
}) {
  const registeredLifterIds = new Set(entries.map((entry) => entry.lifter.id));

  return (
    <div className="space-y-6">
      <AddEntry competitionId={competitionId} registeredLifterIds={registeredLifterIds} />

      <BulkImport competitionId={competitionId} lifts={lifts} />

      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Registered lifters{entries.length > 0 ? ` (${entries.length})` : ''}
          </h2>
          <CopyEntriesButton
            entries={entries}
            divisions={divisions}
            weightClasses={weightClasses}
            lifts={lifts}
          />
        </div>
        {entries.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
            No lifters registered yet.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                competitionId={competitionId}
                entry={entry}
                lifts={lifts}
                divisions={divisions}
                weightClasses={weightClasses}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
