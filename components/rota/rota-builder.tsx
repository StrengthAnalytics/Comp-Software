'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addRotaSignupAction,
  createRotaRoleAction,
  createRotaSectionAction,
  deleteRotaRoleAction,
  deleteRotaSectionAction,
  generateRotaFromSessionsAction,
  moveRotaRoleAction,
  moveRotaSectionAction,
  removeRotaSignupAction,
  setRotaOpenAction,
  setRotaWithdrawalContactAction,
  updateRotaRoleAction,
  updateRotaSectionAction,
} from '@/actions/rota';
import { DEFAULT_ROTA_ROLE_TEMPLATE, MAX_ROTA_SLOT_CAPACITY, SUGGESTED_ROTA_ROLES } from '@/lib/constants';
import { useDebouncedRefresh } from '@/lib/realtime/use-debounced-refresh';
import { useRotaSignupsSubscription } from '@/lib/realtime/use-rota-signups-subscription';
import { buildRotaContactsCsv } from '@/lib/rota/export-csv';
import { ROTA_WITHDRAWAL_CONTACT_MAX } from '@/types/rota';
import { ResetRota } from '@/components/rota/reset-rota';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { Database } from '@/types/database.types';

type CompStatus = Database['public']['Enums']['comp_status'];

export type RotaSignupSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
};

export type RotaBuilderRole = {
  id: string;
  title: string;
  arrive_by: string | null;
  capacity: number;
  sort_order: number;
  // The volunteers who have claimed this role, with their admin-only contact details.
  signups: RotaSignupSummary[];
};

export type RotaBuilderSection = {
  id: string;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
  roles: RotaBuilderRole[];
};

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

const COPY_RESET_MS = 2000;

// A tiny up/down reorder control pair. The list edges disable the relevant arrow.
function MoveControls({
  onMove,
  isFirst,
  isLast,
  disabled,
  label,
}: {
  onMove: (direction: 'up' | 'down') => void;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="flex">
      <button
        type="button"
        onClick={() => onMove('up')}
        disabled={disabled || isFirst}
        aria-label={`Move ${label} up`}
        className="rounded px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMove('down')}
        disabled={disabled || isLast}
        aria-label={`Move ${label} down`}
        className="rounded px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
      >
        ↓
      </button>
    </div>
  );
}

// --- Share + settings (link, open toggle, withdrawal-contact line) --------------------------------

function RotaShareCard({
  competitionId,
  slug,
  competitionStatus,
  initialOpen,
  initialWithdrawalContact,
}: {
  competitionId: string;
  slug: string;
  competitionStatus: CompStatus;
  initialOpen: boolean;
  initialWithdrawalContact: string | null;
}) {
  const router = useRouter();
  // The public sign-up board lives at /[slug]/volunteer (this admin builder owns /[slug]/rota).
  const rotaPath = `/${slug}/volunteer`;

  const [open, setOpen] = useState(initialOpen);
  const [openPending, setOpenPending] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [contact, setContact] = useState(initialWithdrawalContact ?? '');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const contactDirty = contact !== (initialWithdrawalContact ?? '');

  async function toggleOpen() {
    const next = !open;
    setOpenError(null);
    setOpenPending(true);
    setOpen(next);
    const result = await setRotaOpenAction({ competitionId, open: next });
    setOpenPending(false);
    if (result.status === 'error') {
      setOpen(!next);
      setOpenError(result.message);
      return;
    }
    router.refresh();
  }

  async function saveContact() {
    setContactSaving(true);
    setContactSaved(false);
    setContactError(null);
    const result = await setRotaWithdrawalContactAction({
      competitionId,
      withdrawalContact: contact.trim() === '' ? null : contact,
    });
    setContactSaving(false);
    if (result.status === 'error') {
      setContactError(result.message);
      return;
    }
    setContactSaved(true);
    router.refresh();
  }

  async function copyLink() {
    setCopyError(null);
    const url = `${globalThis.location.origin}${rotaPath}`;
    try {
      await globalThis.navigator.clipboard.writeText(url);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopyError('Could not copy automatically — open the link and copy the URL from the address bar.');
    }
  }

  return (
    <Card title="Volunteer sign-up">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Share this link and volunteers add themselves to the slots below. They give their name, email
        and mobile — only their name shows on the public board; you alone see their contact details.
      </p>

      <div className="space-y-3 rounded-md border border-neutral-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">Sign-up link</p>
            <p className="truncate text-xs text-neutral-500">{rotaPath}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={copyLink}>
              {copied ? 'Copied ✓' : 'Copy URL'}
            </Button>
            <a
              href={rotaPath}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Preview
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${open ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                aria-hidden="true"
              />
              Accepting sign-ups
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              While this is on, anyone with the link can view the rota and sign up — it works even
              before the comp is published. Switch it off to close sign-ups.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={open}
            aria-label="Accepting sign-ups"
            disabled={openPending}
            onClick={toggleOpen}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              open ? 'bg-brand-600' : 'bg-neutral-300'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                open ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {competitionStatus === 'completed' ? (
          <p className="text-xs text-amber-700">This competition is completed — you can still reopen the rota if you need to.</p>
        ) : null}
        {openError ? (
          <p role="alert" className="text-sm text-red-600">
            {openError}
          </p>
        ) : null}
        {copyError ? (
          <p role="alert" className="text-sm text-red-600">
            {copyError}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <label htmlFor="rota-withdrawal-contact" className="text-sm font-medium text-neutral-700">
          Withdraw / change contact
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id="rota-withdrawal-contact"
            value={contact}
            maxLength={ROTA_WITHDRAWAL_CONTACT_MAX}
            placeholder="e.g. email rota@yourclub.org to withdraw or change a slot"
            onChange={(event) => {
              setContactSaved(false);
              setContact(event.target.value);
            }}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <Button variant="secondary" onClick={saveContact} disabled={contactSaving || !contactDirty}>
            {contactSaving ? 'Saving…' : 'Save'}
          </Button>
          {contactSaved ? (
            <p role="status" className="text-sm text-green-700">
              Saved.
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Shown on the public board so a volunteer knows who to contact — they can&rsquo;t remove
          themselves, only you can. Leave blank to hide it.
        </p>
        {contactError ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {contactError}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// --- A signed-up volunteer, with their admin-only contact details and a remove control -----------

function SignupRow({ signup }: { signup: RotaSignupSummary }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeRotaSignupAction({ id: signup.id });
      if (result.status === 'error') {
        setError(result.message);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-neutral-50 px-2 py-1 text-xs">
      <span className="font-medium text-neutral-900">{signup.name}</span>
      <a href={`mailto:${signup.email}`} className="text-neutral-600 hover:underline">
        {signup.email}
      </a>
      <a href={`tel:${signup.phone}`} className="text-neutral-600 hover:underline">
        {signup.phone}
      </a>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="ml-auto font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {confirming ? 'Confirm remove' : 'Remove'}
      </button>
      {error ? (
        <p role="alert" className="w-full text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AdminAddVolunteerForm({
  competitionId,
  roleId,
  onDone,
}: {
  competitionId: string;
  roleId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addRotaSignupAction({ competitionId, roleId, name, email, phone });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  const incomplete = name.trim() === '' || email.trim() === '' || phone.trim() === '';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2">
      <input
        aria-label="Volunteer name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${INPUT_CLASS} w-32`}
      />
      <input
        aria-label="Volunteer email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={`${INPUT_CLASS} w-44`}
      />
      <input
        aria-label="Volunteer mobile"
        type="tel"
        placeholder="Mobile"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className={`${INPUT_CLASS} w-32`}
      />
      <Button variant="secondary" onClick={add} disabled={pending || incomplete}>
        Add
      </Button>
      <Button variant="ghost" onClick={onDone} disabled={pending}>
        Cancel
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The volunteers signed up to one role, plus the admin's add-a-volunteer control on an open slot.
function RoleVolunteers({ competitionId, role }: { competitionId: string; role: RotaBuilderRole }) {
  const [adding, setAdding] = useState(false);
  const openSlots = Math.max(role.capacity - role.signups.length, 0);

  if (role.signups.length === 0 && openSlots === 0) {
    return null;
  }

  return (
    <div className="ml-12 mt-1 space-y-1">
      {role.signups.map((signup) => (
        <SignupRow key={signup.id} signup={signup} />
      ))}
      {openSlots > 0 ? (
        adding ? (
          <AdminAddVolunteerForm
            competitionId={competitionId}
            roleId={role.id}
            onDone={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            + Add volunteer
          </button>
        )
      ) : null}
    </div>
  );
}

// --- A single role row within a section -----------------------------------------------------------

function RoleRow({
  role,
  sectionId,
  isFirst,
  isLast,
}: {
  role: RotaBuilderRole;
  sectionId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(role.title);
  const [arriveBy, setArriveBy] = useState(role.arrive_by ?? '');
  const [capacity, setCapacity] = useState(role.capacity);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = title !== role.title || arriveBy !== (role.arrive_by ?? '') || capacity !== role.capacity;
  const full = role.signups.length >= role.capacity;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRotaRoleAction({ id: role.id, title, arriveBy, capacity });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (role.signups.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteRotaRoleAction({ id: role.id });
      if (result.status === 'error') {
        setError(result.message);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  function move(direction: 'up' | 'down') {
    setError(null);
    startTransition(async () => {
      const result = await moveRotaRoleAction({ id: role.id, sectionId, direction });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <MoveControls onMove={move} isFirst={isFirst} isLast={isLast} disabled={pending} label={`role ${role.title}`} />
      <input
        aria-label="Role title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className={`${INPUT_CLASS} min-w-0 flex-1`}
      />
      <input
        aria-label="Arrive by"
        value={arriveBy}
        placeholder="Arrive by"
        onChange={(event) => setArriveBy(event.target.value)}
        className={`${INPUT_CLASS} w-28`}
      />
      <input
        aria-label="Slots"
        type="number"
        min={1}
        max={MAX_ROTA_SLOT_CAPACITY}
        value={capacity}
        onChange={(event) => setCapacity(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <span
        className={`w-20 text-center text-xs font-medium ${full ? 'text-emerald-700' : 'text-neutral-500'}`}
        title="Volunteers signed up / slots"
      >
        {role.signups.length} / {role.capacity} filled
      </span>
      <Button variant="secondary" onClick={save} disabled={pending || !dirty}>
        Save
      </Button>
      <Button variant="secondary" onClick={remove} disabled={pending}>
        {confirming ? 'Confirm delete' : 'Delete'}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddRoleForm({ competitionId, sectionId }: { competitionId: string; sectionId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [arriveBy, setArriveBy] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createRotaRoleAction({ competitionId, sectionId, title, arriveBy, capacity });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setTitle('');
      setArriveBy('');
      setCapacity(1);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
      <input
        aria-label="New role title"
        list="rota-role-suggestions"
        placeholder="Add a role (e.g. Spotters / Loaders)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className={`${INPUT_CLASS} min-w-0 flex-1`}
      />
      <input
        aria-label="New role arrive by"
        placeholder="Arrive by"
        value={arriveBy}
        onChange={(event) => setArriveBy(event.target.value)}
        className={`${INPUT_CLASS} w-28`}
      />
      <input
        aria-label="New role slots"
        type="number"
        min={1}
        max={MAX_ROTA_SLOT_CAPACITY}
        value={capacity}
        onChange={(event) => setCapacity(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <Button onClick={add} disabled={pending || title.trim() === ''}>
        Add role
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// --- A section (a column of the rota grid) --------------------------------------------------------

function SectionBlock({
  competitionId,
  section,
  isFirst,
  isLast,
}: {
  competitionId: string;
  section: RotaBuilderSection;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [dayLabel, setDayLabel] = useState(section.day_label ?? '');
  const [title, setTitle] = useState(section.title);
  const [subtitle, setSubtitle] = useState(section.subtitle ?? '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    dayLabel !== (section.day_label ?? '') || title !== section.title || subtitle !== (section.subtitle ?? '');
  const hasSignups = section.roles.some((role) => role.signups.length > 0);
  const roles = section.roles.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRotaSectionAction({ id: section.id, dayLabel, title, subtitle });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteRotaSectionAction({ id: section.id });
      if (result.status === 'error') {
        setError(result.message);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  function move(direction: 'up' | 'down') {
    setError(null);
    startTransition(async () => {
      const result = await moveRotaSectionAction({ id: section.id, competitionId, direction });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-2">
        <MoveControls onMove={move} isFirst={isFirst} isLast={isLast} disabled={pending} label={`column ${section.title}`} />
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input
            aria-label="Day label"
            value={dayLabel}
            placeholder="Day (e.g. Sat)"
            onChange={(event) => setDayLabel(event.target.value)}
            className={`${INPUT_CLASS} w-28`}
          />
          <input
            aria-label="Column heading"
            value={title}
            placeholder="Heading (e.g. AM)"
            onChange={(event) => setTitle(event.target.value)}
            className={`${INPUT_CLASS} w-40`}
          />
          <input
            aria-label="Column subtitle"
            value={subtitle}
            placeholder="Subtitle (e.g. Weigh-in 8–9:30 · Lift-off 10:00)"
            onChange={(event) => setSubtitle(event.target.value)}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
        </div>
        <Button variant="secondary" onClick={save} disabled={pending || !dirty}>
          Save
        </Button>
        <Button variant="danger" onClick={remove} disabled={pending}>
          {confirming ? 'Confirm delete' : 'Delete'}
        </Button>
      </div>

      {confirming && hasSignups ? (
        <p className="mt-2 text-xs text-amber-700">
          This column has volunteers signed up — deleting it removes their sign-ups too.
        </p>
      ) : null}

      <div className="mt-3 divide-y divide-neutral-100">
        {roles.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No roles in this column yet.</p>
        ) : (
          roles.map((role, index) => (
            <div key={role.id} className="py-1">
              <RoleRow
                role={role}
                sectionId={section.id}
                isFirst={index === 0}
                isLast={index === roles.length - 1}
              />
              <RoleVolunteers competitionId={competitionId} role={role} />
            </div>
          ))
        )}
      </div>

      <AddRoleForm competitionId={competitionId} sectionId={section.id} />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddSectionForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [dayLabel, setDayLabel] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createRotaSectionAction({ competitionId, dayLabel, title, subtitle: '' });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setDayLabel('');
      setTitle('');
      router.refresh();
    });
  }

  return (
    <Card title="Add a column">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="New column day label"
          placeholder="Day (e.g. Sat)"
          value={dayLabel}
          onChange={(event) => setDayLabel(event.target.value)}
          className={`${INPUT_CLASS} w-28`}
        />
        <input
          aria-label="New column heading"
          placeholder="Heading (e.g. AM, Set-up)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <Button onClick={add} disabled={pending || title.trim() === ''}>
          Add column
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// Quick-start: create a column per comp session, pre-filled with the ticked default roles. Linked by
// session_id so it's idempotent — only sessions without a column are added, and the admin's edits are
// never overwritten.
function GenerateFromSessionsCard({
  competitionId,
  slug,
  sessionCount,
  pendingSessionCount,
}: {
  competitionId: string;
  slug: string;
  sessionCount: number;
  pendingSessionCount: number;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(() =>
    DEFAULT_ROTA_ROLE_TEMPLATE.map((role) => ({
      title: role.title,
      capacity: role.capacity,
      arriveBasis: role.arriveBasis,
      included: true,
    })),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setIncluded(index: number, included: boolean) {
    setRoles((current) => current.map((role, i) => (i === index ? { ...role, included } : role)));
  }
  function setCapacity(index: number, capacity: number) {
    setRoles((current) => current.map((role, i) => (i === index ? { ...role, capacity } : role)));
  }

  function generate() {
    const selected = roles
      .filter((role) => role.included)
      .map((role) => ({ title: role.title, capacity: role.capacity, arriveBasis: role.arriveBasis }));
    if (selected.length === 0) {
      setError('Tick at least one role to generate.');
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await generateRotaFromSessionsAction({ competitionId, roles: selected });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      const created = result.data.created;
      setMessage(
        created === 0
          ? 'All your sessions already have a column.'
          : `Added ${created} column${created === 1 ? '' : 's'} — one per session. Tweak the roles below as needed.`,
      );
      router.refresh();
    });
  }

  if (sessionCount === 0) {
    return (
      <Card title="Generate from sessions">
        <p className="-mt-3 text-sm text-neutral-600">
          Set up your sessions on the{' '}
          <a className="font-medium text-brand-700 underline" href={`/${slug}/flights`}>
            Sessions &amp; flights
          </a>{' '}
          screen, then come back here to create a rota column for each one in a click.
        </p>
      </Card>
    );
  }

  let buttonLabel = `Generate ${pendingSessionCount} column${pendingSessionCount === 1 ? '' : 's'}`;
  if (pending) {
    buttonLabel = 'Generating…';
  } else if (pendingSessionCount === 0) {
    buttonLabel = 'All sessions added';
  }

  return (
    <Card title="Generate from sessions">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Create a column for each session in one click, pre-filled with the roles you tick below.{' '}
        {pendingSessionCount === 0
          ? 'All your sessions already have a column — add a session and come back to generate it.'
          : `${pendingSessionCount} of ${sessionCount} session${sessionCount === 1 ? '' : 's'} need a column.`}
      </p>
      <p className="mb-4 text-xs text-neutral-500">
        Arrive-by times are filled in automatically — 30 minutes before the session&rsquo;s lift-off,
        or before weigh-in opens for the weigh-in and registration roles. You can edit any of them
        afterwards.
      </p>

      <ul className="divide-y divide-neutral-100">
        {roles.map((role, index) => (
          <li key={role.title} className="flex items-center justify-between gap-3 py-2">
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={role.included}
                onChange={(event) => setIncluded(index, event.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {role.title}
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              Positions
              <input
                type="number"
                min={1}
                max={MAX_ROTA_SLOT_CAPACITY}
                value={role.capacity}
                disabled={!role.included}
                aria-label={`${role.title} positions`}
                onChange={(event) => setCapacity(index, Number(event.target.value))}
                className={`${INPUT_CLASS} w-16 disabled:opacity-50`}
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={generate} disabled={pending || pendingSessionCount === 0}>
          {buttonLabel}
        </Button>
        {message ? (
          <p role="status" className="text-sm text-green-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

type RotaBuilderProps = {
  competitionId: string;
  competitionName: string;
  slug: string;
  competitionStatus: CompStatus;
  initialOpen: boolean;
  initialWithdrawalContact: string | null;
  sessionCount: number;
  pendingSessionCount: number;
  sections: RotaBuilderSection[];
};

// The admin staff-rota builder: design the rota's columns (sections) and the roles within each
// (with a slot count and arrive-by time), open or close volunteer sign-ups, set the withdraw/change
// contact line, and copy the shareable link. Volunteers fill the slots from the public board.
export function RotaBuilder({
  competitionId,
  competitionName,
  slug,
  competitionStatus,
  initialOpen,
  initialWithdrawalContact,
  sessionCount,
  pendingSessionCount,
  sections,
}: RotaBuilderProps) {
  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  // Live updates as volunteers claim slots (or another device removes one). Admin-only in practice —
  // anon has no read on rota_signups, so it never receives these events.
  const scheduleRefresh = useDebouncedRefresh();
  useRotaSignupsSubscription(competitionId, scheduleRefresh);

  const contactRows = ordered.flatMap((section) =>
    section.roles.flatMap((role) =>
      role.signups.map((signup) => ({
        day: section.day_label,
        section: section.title,
        role: role.title,
        arriveBy: role.arrive_by,
        name: signup.name,
        email: signup.email,
        phone: signup.phone,
        signedUpAt: signup.created_at,
      })),
    ),
  );

  const roleCount = ordered.reduce((sum, section) => sum + section.roles.length, 0);

  function exportContacts() {
    const csv = buildRotaContactsCsv(contactRows);
    const blob = new globalThis.Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = globalThis.URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = `${slug}-rota-contacts.csv`;
    link.click();
    globalThis.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {contactRows.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-100 px-4 py-2">
          <p className="text-sm text-neutral-700">
            {contactRows.length} volunteer{contactRows.length === 1 ? '' : 's'} signed up.
          </p>
          <Button variant="secondary" onClick={exportContacts}>
            Export contacts (CSV)
          </Button>
        </div>
      ) : null}

      <RotaShareCard
        competitionId={competitionId}
        slug={slug}
        competitionStatus={competitionStatus}
        initialOpen={initialOpen}
        initialWithdrawalContact={initialWithdrawalContact}
      />

      <GenerateFromSessionsCard
        competitionId={competitionId}
        slug={slug}
        sessionCount={sessionCount}
        pendingSessionCount={pendingSessionCount}
      />

      {/* Datalist of common role names, shared by every section's add-role input. */}
      <datalist id="rota-role-suggestions">
        {SUGGESTED_ROTA_ROLES.map((roleName) => (
          <option key={roleName} value={roleName} />
        ))}
      </datalist>

      {ordered.length === 0 ? (
        <EmptyState
          title="No rota columns yet"
          description="Build your rota like the spreadsheet: add a column for each session (e.g. “Sat — AM”, “Set-up”), then add the roles each one needs with a slot count."
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((section, index) => (
            <SectionBlock
              key={section.id}
              competitionId={competitionId}
              section={section}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
            />
          ))}
        </div>
      )}

      <AddSectionForm competitionId={competitionId} />

      <ResetRota
        competitionId={competitionId}
        competitionName={competitionName}
        sectionCount={ordered.length}
        roleCount={roleCount}
        signupCount={contactRows.length}
        onExport={exportContacts}
      />
    </div>
  );
}
