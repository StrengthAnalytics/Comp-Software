'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction, type SignInState } from '@/actions/auth';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null;
  }
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {messages[0]}
    </p>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState<SignInState | null, FormData>(signInAction, null);
  const fieldErrors = state?.status === 'error' ? state.fieldErrors : undefined;
  const hasFieldErrors = fieldErrors && Object.keys(fieldErrors).length > 0;

  return (
    <form action={formAction} className="space-y-4">
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
          className={INPUT_CLASS}
        />
        <FieldError messages={fieldErrors?.email} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={INPUT_CLASS}
        />
        <FieldError messages={fieldErrors?.password} />
      </div>
      {state?.status === 'error' && !hasFieldErrors ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
