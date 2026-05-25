'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/admin';
import { emailSchema, passwordSchema } from '@/types/auth';
import { fail, ok, type ActionResult } from '@/types/action-result';

export type SignInState = ActionResult;

// Email + password sign-in. Initial-build auth: simpler to operate than OTP while the dev SMTP is
// heavily rate-limited (see ARCHITECTURE.md §5; production switches to OTP). The ADMIN_EMAILS
// allowlist remains the real gate, so the authorization model is unchanged. On success the server
// client writes the session cookie and we redirect into the admin area.
export async function signInAction(
  _previous: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const result = await Sentry.withServerActionInstrumentation('signIn', async () => {
    const email = emailSchema.safeParse(formData.get('email'));
    const password = passwordSchema.safeParse(formData.get('password'));

    if (!email.success || !password.success) {
      return fail('Enter your email and password.', {
        ...(email.success ? {} : { email: ['Enter a valid email address.'] }),
        ...(password.success ? {} : { password: ['Enter your password.'] }),
      });
    }

    // Defense-in-depth on top of disabled public sign-ups: only allowlisted admins may sign in.
    if (!isAdmin(email.data)) {
      return fail('That email is not authorised to sign in.', {
        email: ['That email is not authorised to sign in.'],
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.data,
      password: password.data,
    });

    if (error) {
      Sentry.captureException(error);
      return fail('Incorrect email or password.');
    }

    return ok();
  });

  if (result.status === 'ok') {
    redirect('/comps');
  }

  return result;
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth');
}
