import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import {
  RotaBuilder,
  type RotaBuilderRole,
  type RotaBuilderSection,
  type RotaSignupSummary,
} from '@/components/rota/rota-builder';

export default async function RotaPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  const supabase = await createClient();

  const [{ data: sectionRows }, { data: roleRows }, { data: signupRows }, { data: sessionRows }] =
    await Promise.all([
      supabase
        .from('rota_sections')
        .select('id, session_id, day_label, title, subtitle, sort_order')
        .eq('competition_id', comp.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('rota_roles')
        .select('id, section_id, title, arrive_by, capacity, sort_order')
        .eq('competition_id', comp.id)
        .order('sort_order', { ascending: true }),
      // Admin reads the base table for the full contact list (RLS admin-only); the public board uses
      // the PII-free view instead.
      supabase
        .from('rota_signups')
        .select('id, role_id, name, email, phone, created_at')
        .eq('competition_id', comp.id)
        .order('created_at', { ascending: true }),
      // For the "Generate from sessions" card and the per-column "Duplicate to…" control: the comp's
      // sessions — those without a column are the available targets.
      supabase.from('sessions').select('id, name').eq('competition_id', comp.id).order('sort_order', { ascending: true }),
    ]);

  const linkedSessionIds = new Set(
    (sectionRows ?? []).map((section) => section.session_id).filter((id): id is string => id !== null),
  );
  const sessionCount = (sessionRows ?? []).length;
  const availableSessions = (sessionRows ?? [])
    .filter((session) => !linkedSessionIds.has(session.id))
    .map((session) => ({ id: session.id, name: session.name }));
  const pendingSessionCount = availableSessions.length;

  const signupsByRole = new Map<string, RotaSignupSummary[]>();
  for (const row of signupRows ?? []) {
    const list = signupsByRole.get(row.role_id) ?? [];
    list.push({ id: row.id, name: row.name, email: row.email, phone: row.phone, created_at: row.created_at });
    signupsByRole.set(row.role_id, list);
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
      signups: signupsByRole.get(role.id) ?? [],
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
        competitionName={comp.name}
        slug={comp.slug}
        competitionStatus={comp.status}
        initialOpen={comp.rota_open}
        initialWithdrawalContact={comp.rota_withdrawal_contact}
        sessionCount={sessionCount}
        pendingSessionCount={pendingSessionCount}
        availableSessions={availableSessions}
        sections={sections}
      />
    </div>
  );
}
