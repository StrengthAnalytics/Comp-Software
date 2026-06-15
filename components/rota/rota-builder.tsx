'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createRotaRoleAction,
  createRotaSectionAction,
  deleteRotaRoleAction,
  deleteRotaSectionAction,
  moveRotaRoleAction,
  moveRotaSectionAction,
  setRotaOpenAction,
  setRotaWithdrawalContactAction,
  updateRotaRoleAction,
  updateRotaSectionAction,
} from '@/actions/rota';
import { MAX_ROTA_SLOT_CAPACITY, SUGGESTED_ROTA_ROLES } from '@/lib/constants';
import { ROTA_WITHDRAWAL_CONTACT_MAX } from '@/types/rota';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { Database } from '@/types/database.types';

type CompStatus = Database['public']['Enums']['comp_status'];

export type RotaBuilderRole = {
  id: string;
  title: string;
  arrive_by: string | null;
  capacity: number;
  sort_order: number;
  // How many volunteers have claimed this role (admin-only contact details are loaded in Phase 4).
  signupCount: number;
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
  const full = role.signupCount >= role.capacity;

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
    if (role.signupCount > 0 && !confirming) {
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
        {role.signupCount} / {role.capacity} filled
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
  const hasSignups = section.roles.some((role) => role.signupCount > 0);
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
            <RoleRow
              key={role.id}
              role={role}
              sectionId={section.id}
              isFirst={index === 0}
              isLast={index === roles.length - 1}
            />
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

type RotaBuilderProps = {
  competitionId: string;
  slug: string;
  competitionStatus: CompStatus;
  initialOpen: boolean;
  initialWithdrawalContact: string | null;
  sections: RotaBuilderSection[];
};

// The admin staff-rota builder: design the rota's columns (sections) and the roles within each
// (with a slot count and arrive-by time), open or close volunteer sign-ups, set the withdraw/change
// contact line, and copy the shareable link. Volunteers fill the slots from the public board.
export function RotaBuilder({
  competitionId,
  slug,
  competitionStatus,
  initialOpen,
  initialWithdrawalContact,
  sections,
}: RotaBuilderProps) {
  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  return (
    <div className="space-y-6">
      <RotaShareCard
        competitionId={competitionId}
        slug={slug}
        competitionStatus={competitionStatus}
        initialOpen={initialOpen}
        initialWithdrawalContact={initialWithdrawalContact}
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
    </div>
  );
}
