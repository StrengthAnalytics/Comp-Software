'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  requestOtpAction,
  verifyOtpAction,
  type OtpRequestState,
  type OtpVerifyState,
} from '@/actions/auth';
import { OTP_LENGTH } from '@/lib/constants';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null;
  }
  return <p className="mt-1 text-sm text-red-600">{messages[0]}</p>;
}

export function SignInForm() {
  const [requestState, requestAction] = useActionState<OtpRequestState | null, FormData>(
    requestOtpAction,
    null,
  );
  const [verifyState, verifyAction] = useActionState<OtpVerifyState | null, FormData>(
    verifyOtpAction,
    null,
  );
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (requestState?.status === 'ok') {
      setEmail(requestState.data.email);
      setStep('code');
    }
  }, [requestState]);

  if (step === 'code') {
    return (
      <form action={verifyAction} className="space-y-4">
        <p className="text-sm text-neutral-600">
          Enter the {OTP_LENGTH}-digit code sent to <span className="font-medium">{email}</span>.
        </p>
        <input type="hidden" name="email" value={email} />
        <div>
          <label htmlFor="token" className="text-sm font-medium text-neutral-700">
            Code
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            required
            className={INPUT_CLASS}
          />
          <FieldError messages={verifyState?.status === 'error' ? verifyState.fieldErrors?.token : undefined} />
        </div>
        {verifyState?.status === 'error' && !verifyState.fieldErrors?.token ? (
          <p className="text-sm text-red-600">{verifyState.message}</p>
        ) : null}
        <SubmitButton label="Verify and sign in" pendingLabel="Verifying…" />
        <button
          type="button"
          onClick={() => setStep('email')}
          className="w-full text-sm text-neutral-500 hover:text-neutral-800"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={email}
          className={INPUT_CLASS}
        />
        <FieldError messages={requestState?.status === 'error' ? requestState.fieldErrors?.email : undefined} />
      </div>
      {requestState?.status === 'error' && !requestState.fieldErrors?.email ? (
        <p className="text-sm text-red-600">{requestState.message}</p>
      ) : null}
      <SubmitButton label="Email me a code" pendingLabel="Sending…" />
    </form>
  );
}
