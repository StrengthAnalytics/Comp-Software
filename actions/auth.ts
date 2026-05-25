'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/admin';
import { emailSchema, otpTokenSchema } from '@/types/auth';
import { fail, ok, type ActionResult } from '@/types/action-result';

export type OtpRequestState = ActionResult<{ email: string }>;
export type OtpVerifyState = ActionResult;

// Step 1 of sign-in: email a 6-digit OTP. Restricted to allowlisted admins (defense-in-depth on
// top of disabled public sign-ups), and shouldCreateUser:false so no new accounts are ever made.
export async function requestOtpAction(
  _previous: OtpRequestState | null,
  formData: FormData,
): Promise<OtpRequestState> {
  return Sentry.withServerActionInstrumentation('requestOtp', async () => {
    const parsed = emailSchema.safeParse(formData.get('email'));
    if (!parsed.success) {
      return fail('Enter a valid email address.', { email: ['Enter a valid email address.'] });
    }

    const email = parsed.data;

    if (!isAdmin(email)) {
      return fail('That email is not authorised to sign in.', {
        email: ['That email is not authorised to sign in.'],
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      Sentry.captureException(error);
      return fail('Could not send a sign-in code. Please try again.');
    }

    return ok({ email });
  });
}

// Step 2 of sign-in: verify the code. On success the server client writes the session cookie and
// we redirect into the admin area.
export async function verifyOtpAction(
  _previous: OtpVerifyState | null,
  formData: FormData,
): Promise<OtpVerifyState> {
  const result = await Sentry.withServerActionInstrumentation('verifyOtp', async () => {
    const email = emailSchema.safeParse(formData.get('email'));
    const token = otpTokenSchema.safeParse(formData.get('token'));

    if (!email.success || !token.success) {
      return fail('Enter the 6-digit code from your email.', {
        token: ['Enter the 6-digit code from your email.'],
      });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.data,
      token: token.data,
      type: 'email',
    });

    if (error) {
      Sentry.captureException(error);
      return fail('That code was not valid or has expired. Request a new one.');
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
