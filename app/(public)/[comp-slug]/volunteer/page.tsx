import { createClient } from '@/lib/supabase/server';
import { PublicRotaBoard, type PublicRotaRole, type PublicRotaSection } from '@/components/rota/public-rota-board';

// UK-style "11 July 2026"; comp dates are stored as ISO date strings.
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The public volunteer rota: sign-in-free, and reachable even while the comp is still a draft. The
// comp is read through the public_rota_comps view (gated on rota_open, not on publication), so a
// closed rota — or an unknown comp — simply returns no row and shows the closed notice. Volunteers
// add themselves to open slots through the app's second anonymous server action.
export default async function VolunteerPage({ params }: { params: Promise<{ 'comp-slug': string }> }) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('public_rota_comps')
    .select('id, name, starts_on, rota_withdrawal_contact')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp || !comp.id) {
    return (
      <main className="min-h-screen bg-neutral-100 px-4 py-10">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Sign-ups are closed</h1>
          <p className="mt-2 text-sm text-neutral-600">
            This volunteer rota isn&rsquo;t open at the moment. Contact the organisers if you think
            this is a mistake.
          </p>
        </div>
      </main>
    );
  }

  const compId = comp.id;

  const [{ data: sectionRows }, { data: roleRows }, { data: signupRows }] = await Promise.all([
    supabase
      .from('rota_sections')
      .select('id, day_label, title, subtitle, sort_order')
      .eq('competition_id', compId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('rota_roles')
      .select('id, section_id, title, arrive_by, capacity, sort_order')
      .eq('competition_id', compId)
      .order('sort_order', { ascending: true }),
    // Names only — the PII-free public view. Email/phone never reach this page. Ordered (name, id)
    // so the board is stable across refreshes (the view exposes no created_at to sort by sign-up time).
    supabase
      .from('public_rota_signups')
      .select('role_id, name')
      .eq('competition_id', compId)
      .order('name', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  const namesByRole = new Map<string, string[]>();
  for (const row of signupRows ?? []) {
    if (!row.role_id) {
      continue;
    }
    const list = namesByRole.get(row.role_id) ?? [];
    if (row.name) {
      list.push(row.name);
    }
    namesByRole.set(row.role_id, list);
  }

  const rolesBySection = new Map<string, PublicRotaRole[]>();
  for (const role of roleRows ?? []) {
    const list = rolesBySection.get(role.section_id) ?? [];
    list.push({
      id: role.id,
      title: role.title,
      arrive_by: role.arrive_by,
      capacity: role.capacity,
      sort_order: role.sort_order,
      names: namesByRole.get(role.id) ?? [],
    });
    rolesBySection.set(role.section_id, list);
  }

  const sections: PublicRotaSection[] = (sectionRows ?? []).map((section) => ({
    id: section.id,
    day_label: section.day_label,
    title: section.title,
    subtitle: section.subtitle,
    sort_order: section.sort_order,
    roles: rolesBySection.get(section.id) ?? [],
  }));

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{comp.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {comp.starts_on ? `${formatDate(comp.starts_on)} · ` : ''}Volunteer rota
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-600">
            Pick a role and add yourself to an open slot. Only your name shows here — your email and
            mobile go only to the organisers.
          </p>
        </header>

        <PublicRotaBoard
          competitionId={compId}
          sections={sections}
          withdrawalContact={comp.rota_withdrawal_contact}
        />
      </div>
    </main>
  );
}
