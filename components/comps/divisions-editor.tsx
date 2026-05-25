'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDivisionAction,
  deleteDivisionAction,
  seedDefaultDivisionsAction,
  updateDivisionAction,
} from '@/actions/divisions';
import type { Database } from '@/types/database.types';

type Division = Pick<Database['public']['Tables']['divisions']['Row'], 'id' | 'name' | 'sort_order'>;

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

function DivisionRow({ competitionId, division }: { competitionId: string; division: Division }) {
  const router = useRouter();
  const [name, setName] = useState(division.name);
  const [sortOrder, setSortOrder] = useState(division.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name !== division.name || sortOrder !== division.sort_order;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateDivisionAction({ id: division.id, competitionId, name, sortOrder });
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
      const result = await deleteDivisionAction({ id: division.id, competitionId });
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
        aria-label="Division name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${INPUT_CLASS} flex-1`}
      />
      <input
        aria-label="Sort order"
        type="number"
        value={sortOrder}
        onChange={(event) => setSortOrder(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <button type="button" onClick={save} disabled={pending || !dirty} className={GHOST_BUTTON}>
        Save
      </button>
      <button type="button" onClick={remove} disabled={pending} className={GHOST_BUTTON}>
        Delete
      </button>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function DivisionsEditor({
  competitionId,
  divisions,
}: {
  competitionId: string;
  divisions: Division[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createDivisionAction({
        competitionId,
        name,
        sortOrder: divisions.length,
      });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setName('');
      router.refresh();
    });
  }

  function seed() {
    setError(null);
    startTransition(async () => {
      const result = await seedDefaultDivisionsAction(competitionId);
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
        <h2 className="text-lg font-semibold tracking-tight">Divisions</h2>
        <button type="button" onClick={seed} disabled={pending} className={GHOST_BUTTON}>
          Seed IPF defaults
        </button>
      </div>

      <div className="mt-4 divide-y divide-neutral-100">
        {divisions.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No divisions yet.</p>
        ) : (
          divisions.map((division) => (
            <DivisionRow key={division.id} competitionId={competitionId} division={division} />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <input
          aria-label="New division name"
          placeholder="e.g. Open"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="button" onClick={add} disabled={pending || name.trim() === ''} className={PRIMARY_BUTTON}>
          Add division
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
