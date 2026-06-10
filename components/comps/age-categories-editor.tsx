'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createAgeCategoryAction,
  deleteAgeCategoryAction,
  seedDefaultAgeCategoriesAction,
  updateAgeCategoryAction,
} from '@/actions/age-categories';
import type { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type AgeCategory = Pick<Database['public']['Tables']['age_categories']['Row'], 'id' | 'name' | 'sort_order'>;

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

function AgeCategoryRow({ competitionId, ageCategory }: { competitionId: string; ageCategory: AgeCategory }) {
  const router = useRouter();
  const [name, setName] = useState(ageCategory.name);
  const [sortOrder, setSortOrder] = useState(ageCategory.sort_order);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name !== ageCategory.name || sortOrder !== ageCategory.sort_order;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAgeCategoryAction({ id: ageCategory.id, competitionId, name, sortOrder });
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
      const result = await deleteAgeCategoryAction({ id: ageCategory.id, competitionId });
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
        aria-label="Age category name"
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
      <Button variant="secondary" onClick={save} disabled={pending || !dirty}>
        Save
      </Button>
      <Button variant="secondary" onClick={remove} disabled={pending}>
        Delete
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AgeCategoriesEditor({
  competitionId,
  ageCategories,
}: {
  competitionId: string;
  ageCategories: AgeCategory[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createAgeCategoryAction({
        competitionId,
        name,
        sortOrder: ageCategories.length,
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
      const result = await seedDefaultAgeCategoriesAction(competitionId);
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card
      title="Age categories"
      action={
        <Button variant="secondary" onClick={seed} disabled={pending}>
          Seed IPF defaults
        </Button>
      }
    >
      <div className="divide-y divide-neutral-100">
        {ageCategories.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No age categories yet.</p>
        ) : (
          ageCategories.map((ageCategory) => (
            <AgeCategoryRow key={ageCategory.id} competitionId={competitionId} ageCategory={ageCategory} />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <input
          aria-label="New age category name"
          placeholder="e.g. Open"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${INPUT_CLASS} flex-1`}
        />
        <Button onClick={add} disabled={pending || name.trim() === ''}>
          Add age category
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
