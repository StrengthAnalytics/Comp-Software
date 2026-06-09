import * as Sentry from '@sentry/nextjs';
import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { ConfigNotice } from '@/components/config-notice';
import { AppShell, type ShellComp } from '@/components/shell/app-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  const user = await requireAdminPage();

  // The full comp list feeds the sidebar's competition switcher (newest first). A handful of comps
  // per year, so no pagination; on a read failure the shell still renders with app-level nav only
  // (comp pages fetch their own data), and the error goes to Sentry rather than being swallowed.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('id, slug, name, status, is_team_competition')
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    Sentry.captureException(error);
  }

  const comps: ShellComp[] = (data ?? []).map((comp) => ({
    id: comp.id,
    slug: comp.slug,
    name: comp.name,
    status: comp.status,
    isTeamCompetition: comp.is_team_competition,
  }));

  return (
    <AppShell comps={comps} userEmail={user.email ?? ''}>
      {children}
    </AppShell>
  );
}
