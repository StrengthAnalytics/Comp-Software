'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { seedDefaultAgeCategoriesAction } from '@/actions/age-categories';
import { seedDefaultWeightClassesAction } from '@/actions/weight-classes';
import { GENDER_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type AgeCategoryRow = { id: string; name: string };
type WeightClassRow = { id: string; name: string; gender: string };

// Read-only category panel for an IPF-federation comp: the standard IPF age categories and weight
// classes are applied automatically at creation and locked (the server rejects edits too — see
// requireEditableCategories). If the creation-time seed failed the lists are empty, so the card
// offers the idempotent "Seed IPF defaults" recovery instead of leaving the comp stuck.
export function IpfCategoriesCard({
  competitionId,
  ageCategories,
  weightClasses,
}: {
  competitionId: string;
  ageCategories: AgeCategoryRow[];
  weightClasses: WeightClassRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsSeed = ageCategories.length === 0 || weightClasses.length === 0;
  const male = weightClasses.filter((weightClass) => weightClass.gender === 'male');
  const female = weightClasses.filter((weightClass) => weightClass.gender === 'female');

  function seed() {
    setError(null);
    startTransition(async () => {
      const ageResult = await seedDefaultAgeCategoriesAction(competitionId);
      if (ageResult.status === 'error') {
        setError(ageResult.message);
        return;
      }
      const classResult = await seedDefaultWeightClassesAction(competitionId);
      if (classResult.status === 'error') {
        setError(classResult.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card title="Age categories & weight classes">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        This is an IPF competition, so the standard IPF age categories and weight classes are applied
        automatically and can&rsquo;t be edited.
      </p>

      {needsSeed ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            The standard categories haven&rsquo;t been applied yet (the automatic step didn&rsquo;t complete when
            this competition was created).
          </p>
          <Button className="mt-3" onClick={seed} disabled={pending}>
            {pending ? 'Seeding…' : 'Seed IPF defaults'}
          </Button>
        </div>
      ) : (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Age categories</dt>
            <dd className="mt-1 text-neutral-800">
              {ageCategories.map((ageCategory) => ageCategory.name).join(' · ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Weight classes — {GENDER_LABELS.male}
            </dt>
            <dd className="mt-1 text-neutral-800">{male.map((weightClass) => weightClass.name).join(' · ')}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Weight classes — {GENDER_LABELS.female}
            </dt>
            <dd className="mt-1 text-neutral-800">{female.map((weightClass) => weightClass.name).join(' · ')}</dd>
          </div>
        </dl>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
