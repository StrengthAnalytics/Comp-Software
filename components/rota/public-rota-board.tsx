'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { submitRotaSignupAction } from '@/actions/rota';
import type { FieldErrors } from '@/types/action-result';
import { Button } from '@/components/ui/button';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';

export type PublicRotaRole = {
  id: string;
  title: string;
  arrive_by: string | null;
  capacity: number;
  sort_order: number;
  // The signed-up volunteers' names — the only personal detail the public board shows.
  names: string[];
};

export type PublicRotaSection = {
  id: string;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
  roles: PublicRotaRole[];
};

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

// The inline sign-up form for one open role. Name shows publicly; email and mobile go only to the
// organiser. Submits through the app's second anonymous server action.
function SignupForm({
  competitionId,
  role,
  onSuccess,
  onCancel,
}: {
  competitionId: string;
  role: PublicRotaRole;
  onSuccess: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors(undefined);

    const result = await submitRotaSignupAction({ competitionId, roleId: role.id, name, email, phone, website });
    setSubmitting(false);
    if (result.status === 'error') {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }
    onSuccess(name.trim());
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-3">
      {/* Honeypot: hidden from people and from focus order, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`rota-website-${role.id}`}>Website</label>
        <input
          id={`rota-website-${role.id}`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor={`rota-name-${role.id}`} className={LABEL_CLASS}>
          Your name
        </label>
        <input
          id={`rota-name-${role.id}`}
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
        <FieldError messages={fieldErrors?.name} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`rota-email-${role.id}`} className={LABEL_CLASS}>
            Email
          </label>
          <input
            id={`rota-email-${role.id}`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.email} />
        </div>
        <div>
          <label htmlFor={`rota-phone-${role.id}`} className={LABEL_CLASS}>
            Mobile number
          </label>
          <input
            id={`rota-phone-${role.id}`}
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.phone} />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Only your name shows on the rota — the organisers alone see your email and mobile.
      </p>

      {formError === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Signing up…' : `Sign up for ${role.title}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RoleCard({
  competitionId,
  role,
  isActive,
  onOpen,
  onCancel,
  onSuccess,
}: {
  competitionId: string;
  role: PublicRotaRole;
  isActive: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSuccess: (name: string) => void;
}) {
  const openSlots = Math.max(role.capacity - role.names.length, 0);

  let slotAction: ReactNode = (
    <Button variant="secondary" onClick={onOpen} className="mt-2">
      Sign up
    </Button>
  );
  if (openSlots === 0) {
    slotAction = <p className="mt-2 text-xs font-medium text-neutral-500">Full</p>;
  } else if (isActive) {
    slotAction = <SignupForm competitionId={competitionId} role={role} onSuccess={onSuccess} onCancel={onCancel} />;
  }

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-neutral-900">{role.title}</p>
        {role.arrive_by ? <p className="text-xs text-neutral-500">Arrive by {role.arrive_by}</p> : null}
      </div>

      <ul className="mt-2 space-y-1">
        {role.names.map((volunteerName, index) => (
          <li
            key={`${role.id}-${index}`}
            className="rounded bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-900"
          >
            {volunteerName}
          </li>
        ))}
        {Array.from({ length: openSlots }).map((_, index) => (
          <li
            key={`${role.id}-open-${index}`}
            className="rounded border border-dashed border-neutral-300 px-2 py-1 text-sm text-neutral-400"
          >
            Open
          </li>
        ))}
      </ul>

      {slotAction}
    </div>
  );
}

function SectionCard({
  competitionId,
  section,
  activeRoleId,
  onOpen,
  onCancel,
  onSuccess,
}: {
  competitionId: string;
  section: PublicRotaSection;
  activeRoleId: string | null;
  onOpen: (roleId: string) => void;
  onCancel: () => void;
  onSuccess: (role: PublicRotaRole, name: string) => void;
}) {
  const roles = section.roles.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        {section.day_label ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{section.day_label}</p>
        ) : null}
        <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
        {section.subtitle ? <p className="mt-0.5 text-sm text-neutral-600">{section.subtitle}</p> : null}
      </header>

      {roles.length === 0 ? (
        <p className="text-sm text-neutral-500">No roles in this column yet.</p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              competitionId={competitionId}
              role={role}
              isActive={activeRoleId === role.id}
              onOpen={() => onOpen(role.id)}
              onCancel={onCancel}
              onSuccess={(name) => onSuccess(role, name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type PublicRotaBoardProps = {
  competitionId: string;
  sections: PublicRotaSection[];
  withdrawalContact: string | null;
};

// The volunteer-facing rota: every column and role with the names already signed up, and a sign-up
// form on each open slot. Volunteers can only add themselves (the second anon write); removing or
// changing a slot goes through the organiser via the withdrawal-contact line.
export function PublicRotaBoard({ competitionId, sections, withdrawalContact }: PublicRotaBoardProps) {
  const router = useRouter();
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ name: string; role: string } | null>(null);

  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  function handleSuccess(role: PublicRotaRole, name: string) {
    setActiveRoleId(null);
    setConfirmation({ name: name === '' ? 'You' : name, role: role.title });
    // Server-rendered board: re-read so the new name appears in the slot.
    router.refresh();
  }

  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-neutral-900">The rota isn&rsquo;t ready yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
          The organisers haven&rsquo;t added any roles to this rota yet. Please check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmation ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Thanks{confirmation.name === 'You' ? '' : `, ${confirmation.name}`} — you&rsquo;re signed up for{' '}
            {confirmation.role}.
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Sign up for another slot below if you can help with more.
          </p>
        </div>
      ) : null}

      {withdrawalContact ? (
        <p className="rounded-md bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
          Need to withdraw or change a slot? {withdrawalContact}
        </p>
      ) : null}

      <div className="space-y-4">
        {ordered.map((section) => (
          <SectionCard
            key={section.id}
            competitionId={competitionId}
            section={section}
            activeRoleId={activeRoleId}
            onOpen={(roleId) => setActiveRoleId(roleId)}
            onCancel={() => setActiveRoleId(null)}
            onSuccess={handleSuccess}
          />
        ))}
      </div>
    </div>
  );
}
