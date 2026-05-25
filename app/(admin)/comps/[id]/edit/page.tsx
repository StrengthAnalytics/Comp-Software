import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CompForm } from '@/components/comps/comp-form';
import { DivisionsEditor } from '@/components/comps/divisions-editor';
import { WeightClassesEditor } from '@/components/comps/weight-classes-editor';

export default async function EditCompPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, kit_type, event_type, status, starts_on, ends_on')
    .eq('id', id)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  const [{ data: divisions }, { data: weightClasses }] = await Promise.all([
    supabase
      .from('divisions')
      .select('id, name, sort_order')
      .eq('competition_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('weight_classes')
      .select('id, name, gender, lower_kg, upper_kg, sort_order')
      .eq('competition_id', id)
      .order('sort_order', { ascending: true }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/comps" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Competitions
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{comp.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">/{comp.slug}</p>
        <Link
          href={`/${comp.slug}/entries`}
          className="mt-3 inline-block text-sm font-medium text-neutral-900 underline"
        >
          Entries &amp; weigh-in →
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <CompForm
          initial={{
            id: comp.id,
            name: comp.name,
            slug: comp.slug,
            kit_type: comp.kit_type,
            event_type: comp.event_type,
            status: comp.status,
            starts_on: comp.starts_on ?? '',
            ends_on: comp.ends_on ?? '',
          }}
        />
      </div>

      <DivisionsEditor competitionId={comp.id} divisions={divisions ?? []} />
      <WeightClassesEditor competitionId={comp.id} weightClasses={weightClasses ?? []} />
    </div>
  );
}
