'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createWeightClassAction,
  deleteWeightClassAction,
  seedDefaultWeightClassesAction,
  updateWeightClassAction,
} from '@/actions/weight-classes';
import { GENDER_LABELS, GENDERS, type Gender } from '@/lib/constants';
import type { Database } from '@/types/database.types';

type WeightClass = Pick<
  Database['public']['Tables']['weight_classes']['Row'],
  'id' | 'name' | 'gender' | 'lower_kg' | 'upper_kg' | 'sort_order'
>;

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

// Empty upper-bound input means "unlimited" (e.g. 120kg+), stored as null.
function parseUpper(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function asGender(value: string): Gender {
  return value === 'female' ? 'female' : 'male';
}

function WeightClassRow({
  competitionId,
  weightClass,
}: {
  competitionId: string;
  weightClass: WeightClass;
}) {
  const router = useRouter();
  const [name, setName] = useState(weightClass.name);
  const [gender, setGender] = useState<Gender>(asGender(weightClass.gender));
  const [lowerKg, setLowerKg] = useState(String(weightClass.lower_kg));
  const [upperKg, setUpperKg] = useState(weightClass.upper_kg === null ? '' : String(weightClass.upper_kg));
  const [sortOrder, setSortOrder] = useState(weightClass.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateWeightClassAction({
        id: weightClass.id,
        competitionId,
        name,
        gender,
        lowerKg: Number(lowerKg),
        upperKg: parseUpper(upperKg),
        sortOrder,
      });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteWeightClassAction({ id: weightClass.id, competitionId });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <input
        aria-label="Weight class name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${INPUT_CLASS} w-28`}
      />
      <select
        aria-label="Gender"
        value={gender}
        onChange={(event) => setGender(asGender(event.target.value))}
        className={INPUT_CLASS}
      >
        {GENDERS.map((value) => (
          <option key={value} value={value}>
            {GENDER_LABELS[value]}
          </option>
        ))}
      </select>
      <input
        aria-label="Lower bound kg"
        type="number"
        step="0.01"
        value={lowerKg}
        onChange={(event) => setLowerKg(event.target.value)}
        className={`${INPUT_CLASS} w-24`}
      />
      <input
        aria-label="Upper bound kg (blank for unlimited)"
        type="number"
        step="0.01"
        placeholder="∞"
        value={upperKg}
        onChange={(event) => setUpperKg(event.target.value)}
        className={`${INPUT_CLASS} w-24`}
      />
      <input
        aria-label="Sort order"
        type="number"
        value={sortOrder}
        onChange={(event) => setSortOrder(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <button type="button" onClick={save} disabled={pending} className={GHOST_BUTTON}>
        Save
      </button>
      <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
        Delete
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function WeightClassesEditor({
  competitionId,
  weightClasses,
}: {
  competitionId: string;
  weightClasses: WeightClass[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [lowerKg, setLowerKg] = useState('0');
  const [upperKg, setUpperKg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createWeightClassAction({
        competitionId,
        name,
        gender,
        lowerKg: Number(lowerKg),
        upperKg: parseUpper(upperKg),
        sortOrder: weightClasses.length,
      });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setName('');
      setUpperKg('');
      router.refresh();
    });
  }

  function seed() {
    setError(null);
    startTransition(async () => {
      const result = await seedDefaultWeightClassesAction(competitionId);
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Weight classes</h2>
        <button type="button" onClick={seed} disabled={pending} className={GHOST_BUTTON}>
          Seed IPF defaults
        </button>
      </div>

      <div className="mt-4 divide-y divide-neutral-100">
        {weightClasses.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No weight classes yet.</p>
        ) : (
          weightClasses.map((weightClass) => (
            <WeightClassRow
              key={weightClass.id}
              competitionId={competitionId}
              weightClass={weightClass}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <input
          aria-label="New weight class name"
          placeholder="e.g. -83 kg"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} w-28`}
        />
        <select
          aria-label="Gender"
          value={gender}
          onChange={(event) => setGender(asGender(event.target.value))}
          className={INPUT_CLASS}
        >
          {GENDERS.map((value) => (
            <option key={value} value={value}>
              {GENDER_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          aria-label="Lower bound kg"
          type="number"
          step="0.01"
          placeholder="lower"
          value={lowerKg}
          onChange={(event) => setLowerKg(event.target.value)}
          className={`${INPUT_CLASS} w-24`}
        />
        <input
          aria-label="Upper bound kg (blank for unlimited)"
          type="number"
          step="0.01"
          placeholder="upper (∞)"
          value={upperKg}
          onChange={(event) => setUpperKg(event.target.value)}
          className={`${INPUT_CLASS} w-24`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add weight class
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
