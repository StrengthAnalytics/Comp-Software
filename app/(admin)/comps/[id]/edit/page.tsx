import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CompForm } from '@/components/comps/comp-form';
import { CompShell } from '@/components/comps/comp-shell';
import { DeleteCompetition } from '@/components/comps/delete-competition';
import { DivisionsEditor } from '@/components/comps/divisions-editor';
import { OverlayLinks } from '@/components/comps/overlay-links';
import { WeightClassesEditor } from '@/components/comps/weight-classes-editor';

export default async function EditCompPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, kit_type, event_type, status, starts_on, ends_on, is_team_competition')
    .eq('id', id)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  const [{ data: divisions }, { data: weightClasses }, { count: entryCount }, { data: platformRows }, { data: sessionRows }] =
    await Promise.all([
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
      supabase.from('entries').select('id', { count: 'exact', head: true }).eq('competition_id', id),
      supabase.from('platforms').select('id, name').eq('competition_id', id).order('name', { ascending: true }),
      supabase.from('sessions').select('id, platform_id').eq('competition_id', id),
    ]);

  // The overlay control offers a per-platform URL only when there is a real choice — the platforms that
  // actually have a session, mirroring how the venue displays resolve their platform.
  const sessionPlatformIds = new Set((sessionRows ?? []).map((session) => session.platform_id).filter(Boolean));
  const overlayPlatforms = (platformRows ?? []).filter((platform) => sessionPlatformIds.has(platform.id));

  return (
    <CompShell
      slug={comp.slug}
      compId={comp.id}
      compName={comp.name}
      isTeamCompetition={comp.is_team_competition}
    >
      <div className="space-y-8">
        <div>
          <Link href="/comps" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Competitions
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{comp.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">/{comp.slug}</p>
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
              is_team_competition: comp.is_team_competition,
            }}
          />
        </div>

        <DivisionsEditor competitionId={comp.id} divisions={divisions ?? []} />
        <WeightClassesEditor competitionId={comp.id} weightClasses={weightClasses ?? []} />

        <OverlayLinks slug={comp.slug} platforms={overlayPlatforms} />

        <DeleteCompetition
          competitionId={comp.id}
          competitionName={comp.name}
          competitionStatus={comp.status}
          entryCount={entryCount ?? 0}
        />
      </div>
    </CompShell>
  );
}
