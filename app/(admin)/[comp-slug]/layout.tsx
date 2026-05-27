import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CompShell } from '@/components/comps/comp-shell';

export default async function CompLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ 'comp-slug': string }>;
}) {
  const { 'comp-slug': slug } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, slug, is_team_competition')
    .eq('slug', slug)
    .maybeSingle();

  if (!comp) {
    notFound();
  }

  return (
    <CompShell
      slug={comp.slug}
      compId={comp.id}
      compName={comp.name}
      isTeamCompetition={comp.is_team_competition}
    >
      {children}
    </CompShell>
  );
}
