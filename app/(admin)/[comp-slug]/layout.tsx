import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';

// Validates the comp slug for every comp-scoped admin page (unknown slug → 404). The comp-scoped
// sidebar itself lives in the (admin) layout's AppShell, which resolves the active comp from the
// URL, so this layout adds no chrome of its own.
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

  return <>{children}</>;
}
