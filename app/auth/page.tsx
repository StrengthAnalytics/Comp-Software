import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { isAdmin } from '@/lib/auth/admin';
import { ConfigNotice } from '@/components/config-notice';
import { SignInForm } from '@/components/auth/sign-in-form';

export default async function AuthPage() {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAdmin(user.email)) {
    redirect('/comps');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Admin access only. Sign in with your email and password.
        </p>
        <div className="mt-6">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}
