import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { ConfigNotice } from '@/components/config-notice';

// Full-screen, chrome-less admin surface for venue display screens (e.g. the loading-crew display).
// Admin-gated exactly like the (admin) layout — these routes are not in proxy.ts's protected
// prefixes, so this server-side gate is the real lock — but with no header or sidebar: the display
// owns the whole viewport, so nothing sits in the DOM/tab order behind its full-screen overlay. The
// light surface here is only seen by the platform chooser / empty states; the live display paints its
// own dark full-bleed background over it.
export default async function DisplayLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  await requireAdminPage();

  return <div className="min-h-screen bg-neutral-50 text-neutral-900">{children}</div>;
}
