import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { CompShell } from '@/components/comps/comp-shell';

export default async function CompLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ 'comp-slug': string }>;
}) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

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
