'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitRotaChangeRequestAction, submitRotaSignupAction } from '@/actions/rota';
import type { FieldErrors } from '@/types/action-result';
import {
  ROTA_CHANGE_KIND_LABELS,
  ROTA_CHANGE_KINDS,
  type RotaChangeKind,
} from '@/types/rota';
import {
  forgetRememberedVolunteer,
  loadRememberedVolunteer,
  saveRememberedVolunteer,
  type RememberedVolunteer,
} from '@/lib/rota/remembered-volunteer';
import { displayRotaTime } from '@/lib/rota/time';
import { Button } from '@/components/ui/button';
import { RotaDialog } from '@/components/rota/rota-dialog';
import { OPEN_SLOT_CLASS, RotaGrid, type RotaGridSection } from '@/components/rota/rota-grid';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';
const NETWORK_ERROR = 'Could not reach the server — please try again.';

// The change-request message box's label, by what the volunteer needs (a swap or "something else"
// must say what; a drop-out needn't).
const CHANGE_MESSAGE_LABELS: Record<RotaChangeKind, string> = {
  drop_out: 'Anything else? (optional)',
  swap: 'Which slot would you like instead?',
  other: 'What do you need?',
};

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

// A slot as the volunteer would name it: "Sat AM · Refs".
type SlotChoice = { roleId: string; label: string; arriveBy: string | null };

function sectionLabel(section: PublicRotaSection): string {
  return [section.day_label, section.title].filter((part) => part && part.trim() !== '').join(' ');
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

// Hidden from people and from focus order, tempting to bots. Any value marks the submit as a bot.
function Honeypot({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={id}>Website</label>
      <input
        id={id}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// --- Sign up for one slot ------------------------------------------------------------------------

function SignupDialog({
  competitionId,
  slot,
  remembered,
  onClose,
  onSuccess,
}: {
  competitionId: string;
  slot: SlotChoice;
  remembered: RememberedVolunteer | null;
  onClose: () => void;
  onSuccess: (details: RememberedVolunteer, remember: boolean) => void;
}) {
  // With saved details the dialog is a one-tap confirm; "Not you?" switches to the full form.
  const [editing, setEditing] = useState(remembered === null);
  const [name, setName] = useState(remembered?.name ?? '');
  const [email, setEmail] = useState(remembered?.email ?? '');
  const [phone, setPhone] = useState(remembered?.phone ?? '');
  const [remember, setRemember] = useState(true);
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors(undefined);

    try {
      const result = await submitRotaSignupAction({ competitionId, roleId: slot.roleId, name, email, phone, website });
      if (result.status === 'error') {
        setFormError(result.message);
        setFieldErrors(result.fieldErrors);
        // A field problem with saved details: show the form so it can be fixed.
        if (result.fieldErrors) {
          setEditing(true);
        }
        return;
      }
      onSuccess({ name: name.trim(), email: email.trim(), phone: phone.trim() }, remember);
    } catch {
      // A dropped connection (the venue/mobile networks this is built for) rejects the action rather
      // than returning an error result; surface it instead of leaving the button stuck.
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RotaDialog
      title={`Sign up: ${slot.label}`}
      description={slot.arriveBy ? `Please arrive by ${slot.arriveBy}.` : undefined}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Honeypot id="rota-signup-website" value={website} onChange={setWebsite} />

        {editing ? (
          <>
            <div>
              <label htmlFor="rota-name" className={LABEL_CLASS}>
                Your name
              </label>
              <input
                id="rota-name"
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={INPUT_CLASS}
              />
              <FieldError messages={fieldErrors?.name} />
            </div>
            <div>
              <label htmlFor="rota-email" className={LABEL_CLASS}>
                Email
              </label>
              <input
                id="rota-email"
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
              <label htmlFor="rota-phone" className={LABEL_CLASS}>
                Mobile number
              </label>
              <input
                id="rota-phone"
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={INPUT_CLASS}
              />
              <FieldError messages={fieldErrors?.phone} />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Remember my details on this device
            </label>
            <p className="text-xs text-neutral-500">
              Only your name shows on the rota. Your email and mobile go only to the organisers.
            </p>
          </>
        ) : (
          <div className="rounded-md bg-neutral-50 p-3 text-sm">
            <p className="font-semibold text-neutral-900">Sign up as {name}?</p>
            <p className="mt-0.5 text-neutral-600">
              {email} · {phone}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 text-sm font-medium text-brand-700 hover:underline"
            >
              Not you? Use different details
            </button>
          </div>
        )}

        {formError === null ? null : (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing up…' : (editing ? 'Sign up' : 'Yes, sign me up')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </RotaDialog>
  );
}

// --- Request a change ------------------------------------------------------------------------------

function ChangeRequestDialog({
  competitionId,
  slots,
  remembered,
  onClose,
}: {
  competitionId: string;
  slots: SlotChoice[];
  remembered: RememberedVolunteer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(remembered?.name ?? '');
  const [contact, setContact] = useState(remembered?.email ?? '');
  const [roleId, setRoleId] = useState('');
  const [kind, setKind] = useState<RotaChangeKind>('drop_out');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors(undefined);
    try {
      const result = await submitRotaChangeRequestAction({
        competitionId,
        roleId: roleId === '' ? null : roleId,
        name,
        contact,
        kind,
        message,
        website,
      });
      if (result.status === 'error') {
        setFormError(result.message);
        setFieldErrors(result.fieldErrors);
        return;
      }
      setSent(true);
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <RotaDialog title="Request sent" onClose={onClose}>
        <p className="text-sm text-neutral-700">
          Thanks{name.trim() ? `, ${name.trim()}` : ''}. The organisers have your request and will update the rota
          or get in touch.
        </p>
        <div className="mt-4">
          <Button onClick={onClose}>Done</Button>
        </div>
      </RotaDialog>
    );
  }

  const messageLabel = CHANGE_MESSAGE_LABELS[kind];

  return (
    <RotaDialog
      title="Request a change"
      description="Only the organisers can change the rota. Tell them what you need and they'll sort it."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Honeypot id="rota-change-website" value={website} onChange={setWebsite} />

        <div>
          <label htmlFor="rota-change-name" className={LABEL_CLASS}>
            Your name
          </label>
          <input
            id="rota-change-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="rota-change-contact" className={LABEL_CLASS}>
            Your email or mobile
          </label>
          <input
            id="rota-change-contact"
            required
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.contact} />
        </div>

        <div>
          <label htmlFor="rota-change-slot" className={LABEL_CLASS}>
            Which slot?
          </label>
          <select
            id="rota-change-slot"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Several slots / not sure</option>
            {slots.map((slot) => (
              <option key={slot.roleId} value={slot.roleId}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className={LABEL_CLASS}>What do you need?</legend>
          <div className="mt-1 space-y-1">
            {ROTA_CHANGE_KINDS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="radio"
                  name="rota-change-kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                />
                {ROTA_CHANGE_KIND_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="rota-change-message" className={LABEL_CLASS}>
            {messageLabel}
          </label>
          <textarea
            id="rota-change-message"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.message} />
        </div>

        {formError === null ? null : (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </RotaDialog>
  );
}

// --- The board -------------------------------------------------------------------------------------

type PublicRotaBoardProps = {
  competitionId: string;
  sections: PublicRotaSection[];
  withdrawalContact: string | null;
};

// The volunteer-facing rota, laid out like the organisers' spreadsheet: sessions across, jobs down,
// green for a filled slot (name only) and a tappable "+ Sign up" for each open one. Volunteers can
// only add themselves (an anon write); dropping out or swapping goes to the organiser through
// "Request a change".
export function PublicRotaBoard({ competitionId, sections, withdrawalContact }: PublicRotaBoardProps) {
  const router = useRouter();
  const [remembered, setRemembered] = useState<RememberedVolunteer | null>(null);
  const [signupSlot, setSignupSlot] = useState<SlotChoice | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ name: string; slot: string } | null>(null);

  // Saved details live in this browser only, so read them after mount (the server render has none).
  useEffect(() => {
    setRemembered(loadRememberedVolunteer());
  }, []);

  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  const slots: SlotChoice[] = ordered.flatMap((section) =>
    section.roles
      .toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((role) => ({
        roleId: role.id,
        label: `${sectionLabel(section)} · ${role.title}`,
        arriveBy: displayRotaTime(role.arrive_by),
      })),
  );
  const slotByRole = new Map(slots.map((slot) => [slot.roleId, slot]));

  const gridSections: RotaGridSection[] = ordered.map((section) => ({
    ...section,
    roles: section.roles.map((role) => ({
      ...role,
      filled: role.names.map((volunteerName, index) => ({ key: `${role.id}-${index}`, name: volunteerName })),
    })),
  }));

  function handleSignedUp(details: RememberedVolunteer, remember: boolean) {
    if (remember) {
      saveRememberedVolunteer(details);
      setRemembered(details);
    }
    setConfirmation({ name: details.name, slot: signupSlot?.label ?? '' });
    setSignupSlot(null);
    // Server-rendered board: re-read so the new name appears in the slot.
    router.refresh();
  }

  function forgetMe() {
    forgetRememberedVolunteer();
    setRemembered(null);
  }

  if (ordered.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-neutral-900">The rota isn&rsquo;t ready yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
          The organisers haven&rsquo;t added any roles to this rota yet. Please check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmation ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Thanks, {confirmation.name}! You&rsquo;re signed up for {confirmation.slot}.
          </p>
          <p className="mt-1 text-sm text-emerald-800">Tap another open slot if you can help with more.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm bg-emerald-400" /> Filled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-neutral-300 bg-neutral-100" />{' '}
            Needs someone (tap to sign up)
          </span>
          {remembered ? (
            <span>
              Signing up as <span className="font-medium text-neutral-800">{remembered.name}</span>.{' '}
              <button type="button" onClick={forgetMe} className="font-medium text-brand-700 hover:underline">
                Forget my details
              </button>
            </span>
          ) : null}
        </div>
        <Button variant="secondary" onClick={() => setChangeOpen(true)}>
          Request a change
        </Button>
      </div>

      {withdrawalContact ? (
        <p className="rounded-md bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
          Need to withdraw or change a slot? {withdrawalContact}
        </p>
      ) : null}

      <RotaGrid
        sections={gridSections}
        renderOpen={(role) => {
          const slot = slotByRole.get(role.id);
          return (
            <button
              type="button"
              onClick={() => slot && setSignupSlot(slot)}
              aria-label={`Sign up for ${slot?.label ?? role.title}`}
              className={`${OPEN_SLOT_CLASS} font-medium hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700`}
            >
              + Sign up
            </button>
          );
        }}
      />

      {signupSlot ? (
        <SignupDialog
          competitionId={competitionId}
          slot={signupSlot}
          remembered={remembered}
          onClose={() => setSignupSlot(null)}
          onSuccess={handleSignedUp}
        />
      ) : null}

      {changeOpen ? (
        <ChangeRequestDialog
          competitionId={competitionId}
          slots={slots}
          remembered={remembered}
          onClose={() => setChangeOpen(false)}
        />
      ) : null}
    </div>
  );
}
