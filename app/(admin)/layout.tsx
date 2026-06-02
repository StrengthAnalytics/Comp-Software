import Link from 'next/link';
import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { ConfigNotice } from '@/components/config-notice';
import { signOutAction } from '@/actions/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  const user = await requireAdminPage();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/comps" className="text-sm font-semibold tracking-tight">
              Comp-Software
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/comps" className="text-sm text-neutral-600 hover:text-neutral-900">
                Competitions
              </Link>
              <Link href="/records" className="text-sm text-neutral-600 hover:text-neutral-900">
                Records
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-600">
            <span className="hidden sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
