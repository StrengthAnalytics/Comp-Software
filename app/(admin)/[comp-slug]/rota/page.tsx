import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { RotaBuilder, type RotaBuilderRole, type RotaBuilderSection } from '@/components/rota/rota-builder';

export default async function RotaPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [{ data: sectionRows }, { data: roleRows }, { data: signupRows }] = await Promise.all([
    supabase
      .from('rota_sections')
      .select('id, day_label, title, subtitle, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('rota_roles')
      .select('id, section_id, title, arrive_by, capacity, sort_order')
      .eq('competition_id', comp.id)
      .order('sort_order', { ascending: true }),
    // Admin reads the base table (contact details load in Phase 4); here we only tally per role.
    supabase.from('rota_signups').select('role_id').eq('competition_id', comp.id),
  ]);

  const countByRole = new Map<string, number>();
  for (const row of signupRows ?? []) {
    countByRole.set(row.role_id, (countByRole.get(row.role_id) ?? 0) + 1);
  }

  const rolesBySection = new Map<string, RotaBuilderRole[]>();
  for (const role of roleRows ?? []) {
    const list = rolesBySection.get(role.section_id) ?? [];
    list.push({
      id: role.id,
      title: role.title,
      arrive_by: role.arrive_by,
      capacity: role.capacity,
      sort_order: role.sort_order,
      signupCount: countByRole.get(role.id) ?? 0,
    });
    rolesBySection.set(role.section_id, list);
  }

  const sections: RotaBuilderSection[] = (sectionRows ?? []).map((section) => ({
    id: section.id,
    day_label: section.day_label,
    title: section.title,
    subtitle: section.subtitle,
    sort_order: section.sort_order,
    roles: rolesBySection.get(section.id) ?? [],
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff rota</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Build the volunteer rota and share the sign-up link. Volunteers add themselves to open
          slots; only you can move or remove anyone.
        </p>
      </div>

      <RotaBuilder
        competitionId={comp.id}
        slug={comp.slug}
        competitionStatus={comp.status}
        initialOpen={comp.rota_open}
        initialWithdrawalContact={comp.rota_withdrawal_contact}
        sections={sections}
      />
    </div>
  );
}
