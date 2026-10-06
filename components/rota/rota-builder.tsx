'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addRotaRoleToAllSectionsAction,
  createRotaRoleAction,
  createRotaSectionAction,
  deleteRotaRoleAction,
  deleteRotaSectionAction,
  duplicateRotaSectionToSessionAction,
  generateRotaFromSessionsAction,
  moveRotaRoleAction,
  moveRotaSectionAction,
  setRotaOpenAction,
  setRotaWithdrawalContactAction,
  updateRotaRoleAction,
  updateRotaSectionAction,
} from '@/actions/rota';
import {
  DEFAULT_ROTA_ROLE_TEMPLATE,
  MAX_ROTA_SLOT_CAPACITY,
  ROTA_ARRIVE_BEFORE_MINUTES,
  ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES,
  SUGGESTED_ROTA_ROLES,
  type RotaArriveBasis,
} from '@/lib/constants';
import { useDebouncedRefresh } from '@/lib/realtime/use-debounced-refresh';
import { useRotaChangeRequestsSubscription } from '@/lib/realtime/use-rota-change-requests-subscription';
import { useRotaSignupsSubscription } from '@/lib/realtime/use-rota-signups-subscription';
import { buildRotaContactsCsv } from '@/lib/rota/export-csv';
import { ROTA_WITHDRAWAL_CONTACT_MAX } from '@/types/rota';
import { ResetRota } from '@/components/rota/reset-rota';
import { RotaAdminGrid } from '@/components/rota/rota-admin-grid';
import { RotaChangeRequests, type RotaChangeRequestSummary } from '@/components/rota/rota-change-requests';
import { RotaFormatting } from '@/components/rota/rota-formatting';
import { DEFAULT_ROTA_STYLE, type RotaStyle } from '@/types/rota-style';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs } from '@/components/ui/tabs';
import type { Database } from '@/types/database.types';

type CompStatus = Database['public']['Enums']['comp_status'];

export type RotaSignupSummary = {
  id: string;
  name: string;
  // Null for a helper the admin added by name only.
  email: string | null;
  phone: string | null;
  created_at: string;
};

export type RotaBuilderRole = {
  id: string;
  title: string;
  arrive_by: string | null;
  // Which session time arrive_by follows, or null for a typed time (see lib/rota/sync-plan.ts).
  arrive_basis: RotaArriveBasis | null;
  capacity: number;
  sort_order: number;
  // The volunteers who have claimed this role, with their admin-only contact details.
  signups: RotaSignupSummary[];
};

export type RotaBuilderSection = {
  id: string;
  // The session this column belongs to (its header and times follow it), or null for a hand-made
  // column such as Set-up.
  session_id: string | null;
  day_label: string | null;
  title: string;
  subtitle: string | null;
  sort_order: number;
  roles: RotaBuilderRole[];
};

// A comp session that has no rota column yet — a possible target for "duplicate this column to…".
export type RotaAvailableSession = { id: string; name: string };

const INPUT_CLASS =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';

const COPY_RESET_MS = 2000;

// A slot count must be a whole number ≥ 1. Clearing a number input yields Number('') === 0 and a
// partial entry yields NaN; guard the submit so neither is sent (the server's Zod .int().min(1)
// would otherwise reject them with only a generic banner and no field highlight).
function isValidCapacity(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

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
    try {
      const result = await setRotaOpenAction({ competitionId, open: next });
      if (result.status === 'error') {
        setOpen(!next);
        setOpenError(result.message);
        return;
      }
      router.refresh();
    } catch {
      // A dropped connection rejects the action rather than returning an error result; roll the
      // optimistic flip back so the switch can't get stuck showing "on" while the rota is still off.
      setOpen(!next);
      setOpenError('Could not reach the server — please try again.');
    } finally {
      setOpenPending(false);
    }
  }

  async function saveContact() {
    setContactSaving(true);
    setContactSaved(false);
    setContactError(null);
    try {
      const result = await setRotaWithdrawalContactAction({
        competitionId,
        withdrawalContact: contact.trim() === '' ? null : contact,
      });
      if (result.status === 'error') {
        setContactError(result.message);
        return;
      }
      setContactSaved(true);
      router.refresh();
    } catch {
      setContactError('Could not reach the server — please try again.');
    } finally {
      setContactSaving(false);
    }
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
        Share this link and volunteers tap an open slot to sign up. They give their name, email and
        mobile — only their name shows on the public rota; you alone see their contact details.
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
          Extra contact line <span className="font-normal text-neutral-500">(optional)</span>
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
          Volunteers can&rsquo;t change the rota themselves — they use the &ldquo;Request a change&rdquo;
          button, which lands in the Rota tab. This line is shown under that button if you&rsquo;d
          also like to give a direct contact. Leave blank to hide it.
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

// --- Arrive-by: follow the session's clock, or a typed time ---------------------------------------

// "manual" is the select's value for a typed time (arrive_basis null).
type ArriveChoice = RotaArriveBasis | 'manual';

const ARRIVE_CHOICE_LABELS: Record<ArriveChoice, string> = {
  lift_off: `${ROTA_ARRIVE_BEFORE_MINUTES} min before lift-off`,
  weigh_in: `${ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES} min before weigh-in`,
  manual: 'Set a time',
};

const ARRIVE_CHOICES: readonly ArriveChoice[] = ['lift_off', 'weigh_in', 'manual'];

function toArriveChoice(value: string): ArriveChoice {
  return value === 'lift_off' || value === 'weigh_in' ? value : 'manual';
}

// In a session's column a job can follow the session (its time is worked out from the session and
// moves when the session does), or have a time typed in. In any other column it's always typed.
function ArriveByControl({
  linked,
  choice,
  onChoice,
  typed,
  onTyped,
  currentTime,
  textLabel,
  selectLabel,
}: {
  linked: boolean;
  choice: ArriveChoice;
  onChoice: (choice: ArriveChoice) => void;
  typed: string;
  onTyped: (value: string) => void;
  // The time the server worked out for the saved choice, shown next to a following job. Undefined
  // while an unsaved choice is picked (the time is worked out on save).
  currentTime: string | null | undefined;
  textLabel: string;
  selectLabel: string;
}) {
  const textInput = (
    <input
      aria-label={textLabel}
      value={typed}
      placeholder="Arrive by"
      onChange={(event) => onTyped(event.target.value)}
      className={`${INPUT_CLASS} w-28`}
    />
  );
  if (!linked) {
    return textInput;
  }
  return (
    <div className="flex w-72 items-center gap-2">
      <select
        aria-label={selectLabel}
        value={choice}
        onChange={(event) => onChoice(toArriveChoice(event.target.value))}
        className={`${INPUT_CLASS} w-44`}
      >
        {ARRIVE_CHOICES.map((value) => (
          <option key={value} value={value}>
            {ARRIVE_CHOICE_LABELS[value]}
          </option>
        ))}
      </select>
      {choice === 'manual' ? (
        textInput
      ) : (
        <span className="w-24 text-sm text-neutral-700">
          {currentTime === undefined ? 'Set on save' : (currentTime ?? 'No session time')}
        </span>
      )}
    </div>
  );
}

// --- A single role row within a section -----------------------------------------------------------

function RoleRow({
  role,
  sectionId,
  linked,
  isFirst,
  isLast,
}: {
  role: RotaBuilderRole;
  sectionId: string;
  // Whether the column is a session's (so the job can follow the session's clock).
  linked: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(role.title);
  const [arriveBy, setArriveBy] = useState(role.arrive_by ?? '');
  const [arriveChoice, setArriveChoice] = useState<ArriveChoice>(role.arrive_basis ?? 'manual');
  const [capacity, setCapacity] = useState(role.capacity);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savedChoice: ArriveChoice = role.arrive_basis ?? 'manual';
  const dirty =
    title !== role.title ||
    arriveChoice !== savedChoice ||
    (arriveChoice === 'manual' && arriveBy !== (role.arrive_by ?? '')) ||
    capacity !== role.capacity;
  const full = role.signups.length >= role.capacity;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRotaRoleAction({
        id: role.id,
        title,
        arriveBy,
        arriveBasis: linked && arriveChoice !== 'manual' ? arriveChoice : null,
        capacity,
      });
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
      <ArriveByControl
        linked={linked}
        choice={arriveChoice}
        onChoice={setArriveChoice}
        typed={arriveBy}
        onTyped={setArriveBy}
        currentTime={arriveChoice === savedChoice ? role.arrive_by : undefined}
        textLabel="Arrive by"
        selectLabel="Arrive-by time"
      />
      <input
        aria-label="Spaces"
        type="number"
        min={1}
        max={MAX_ROTA_SLOT_CAPACITY}
        value={capacity}
        onChange={(event) => setCapacity(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <span
        className={`w-20 text-center text-xs font-medium ${full ? 'text-emerald-700' : 'text-neutral-500'}`}
        title="Volunteers signed up / spaces"
      >
        {role.signups.length} / {role.capacity} filled
      </span>
      <Button variant="secondary" onClick={save} disabled={pending || !dirty || !isValidCapacity(capacity)}>
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

function AddRoleForm({
  competitionId,
  sectionId,
  linked,
}: {
  competitionId: string;
  sectionId: string;
  linked: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [arriveBy, setArriveBy] = useState('');
  // A new job in a session's column arrives with the crew, 30 minutes before lift-off, by default.
  const [arriveChoice, setArriveChoice] = useState<ArriveChoice>('lift_off');
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createRotaRoleAction({
        competitionId,
        sectionId,
        title,
        arriveBy,
        arriveBasis: linked && arriveChoice !== 'manual' ? arriveChoice : null,
        capacity,
      });
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
      <ArriveByControl
        linked={linked}
        choice={arriveChoice}
        onChoice={setArriveChoice}
        typed={arriveBy}
        onTyped={setArriveBy}
        currentTime={undefined}
        textLabel="New role arrive by"
        selectLabel="New role arrive-by time"
      />
      <input
        aria-label="New role spaces"
        type="number"
        min={1}
        max={MAX_ROTA_SLOT_CAPACITY}
        value={capacity}
        onChange={(event) => setCapacity(Number(event.target.value))}
        className={`${INPUT_CLASS} w-20`}
      />
      <Button onClick={add} disabled={pending || title.trim() === '' || !isValidCapacity(capacity)}>
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

// Copies this column's roles onto a session that has no column yet (the new column's header comes
// from that session). Hidden when every session already has a column.
function DuplicateSectionControl({
  competitionId,
  sourceSectionId,
  availableSessions,
}: {
  competitionId: string;
  sourceSectionId: string;
  availableSessions: RotaAvailableSession[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (availableSessions.length === 0) {
    return null;
  }

  function duplicate() {
    if (targetId === '') {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await duplicateRotaSectionToSessionAction({
        competitionId,
        sourceSectionId,
        targetSessionId: targetId,
      });
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setTargetId('');
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
      <span className="text-xs text-neutral-500">Copy these roles to a session with no column yet:</span>
      <select
        aria-label="Duplicate to session"
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        className={`${INPUT_CLASS} min-w-0 flex-1`}
      >
        <option value="">Choose a session…</option>
        {availableSessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.name}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={duplicate} disabled={pending || targetId === ''}>
        Duplicate
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
  slug,
  section,
  isFirst,
  isLast,
  availableSessions,
}: {
  competitionId: string;
  slug: string;
  section: RotaBuilderSection;
  isFirst: boolean;
  isLast: boolean;
  availableSessions: RotaAvailableSession[];
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
  // A session's column takes its heading and times from the session, so they're edited there.
  const linked = section.session_id !== null;
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
        {linked ? (
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-neutral-900">
              {section.day_label ? `${section.day_label} · ` : ''}
              {section.title}
            </p>
            {section.subtitle ? <p className="text-sm text-neutral-600">{section.subtitle}</p> : null}
            <p className="mt-1 text-xs text-neutral-500">
              Follows the session. Change its name, day or times on{' '}
              <Link href={`/${slug}/flights`} className="font-medium text-neutral-700 underline">
                Sessions &amp; flights
              </Link>{' '}
              and this column updates to match.
            </p>
          </div>
        ) : (
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
        )}
        {linked ? null : (
          <Button variant="secondary" onClick={save} disabled={pending || !dirty}>
            Save
          </Button>
        )}
        <Button variant="danger" onClick={remove} disabled={pending}>
          {confirming ? 'Confirm delete' : 'Delete'}
        </Button>
      </div>

      {confirming && hasSignups ? (
        <p className="mt-2 text-xs text-amber-700">
          This column has volunteers signed up — deleting it removes their sign-ups too.
        </p>
      ) : null}

      {roles.length > 0 ? (
        // Column headings for the role rows below (they line up with the inputs' widths).
        <div aria-hidden="true" className="mt-3 hidden items-center gap-2 pl-14 text-xs font-medium text-neutral-500 sm:flex">
          <span className="flex-1">Role</span>
          <span className={linked ? 'w-72' : 'w-28'}>Arrive by</span>
          <span className="w-20">Spaces</span>
          <span className="w-20 text-center">Filled</span>
          <span className="w-36" />
        </div>
      ) : null}

      <div className="mt-1 divide-y divide-neutral-100">
        {roles.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No roles in this column yet.</p>
        ) : (
          roles.map((role, index) => (
            <div key={role.id} className="py-1">
              <RoleRow
                role={role}
                sectionId={section.id}
                linked={linked}
                isFirst={index === 0}
                isLast={index === roles.length - 1}
              />
            </div>
          ))
        )}
      </div>

      <AddRoleForm competitionId={competitionId} sectionId={section.id} linked={linked} />

      <DuplicateSectionControl
        competitionId={competitionId}
        sourceSectionId={section.id}
        availableSessions={availableSessions}
      />

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
        Arrive-by times are filled in automatically — {ROTA_ARRIVE_BEFORE_MINUTES} minutes before the
        session&rsquo;s lift-off, or {ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES} minutes before weigh-in opens
        for the weigh-in team — and they move when you change a session&rsquo;s times. New sessions
        get a column of their own automatically. You can add or delete roles, change the spaces, or
        set any job to a fixed time at any time.
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
              Spaces
              <input
                type="number"
                min={1}
                max={MAX_ROTA_SLOT_CAPACITY}
                value={role.capacity}
                disabled={!role.included}
                aria-label={`${role.title} spaces`}
                onChange={(event) => setCapacity(index, Number(event.target.value))}
                className={`${INPUT_CLASS} w-16 disabled:opacity-50`}
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={generate}
          disabled={
            pending ||
            pendingSessionCount === 0 ||
            roles.some((role) => role.included && !isValidCapacity(role.capacity))
          }
        >
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

// Adds one job to every column at once (e.g. "Commentary" for every session) — quicker than adding it
// column by column. In a session's column the new role arrives with the crew (and follows the session);
// in any other column it takes that column's usual arrive-by time.
function AddRoleToAllForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    setAdded(null);
    startTransition(async () => {
      try {
        const result = await addRotaRoleToAllSectionsAction({ competitionId, title, capacity });
        if (result.status === 'error') {
          setError(result.message);
          return;
        }
        setAdded(result.data.added);
        setTitle('');
        setCapacity(1);
        router.refresh();
      } catch {
        setError('Could not reach the server — please try again.');
      }
    });
  }

  return (
    <Card title="Add a role to every column">
      <p className="-mt-3 mb-3 text-sm text-neutral-600">
        For a job every session needs (e.g. Commentary). To add or remove a role in just one column,
        use that column below.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Role for every column"
          list="rota-role-suggestions"
          placeholder="Role (e.g. Commentary)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Spaces
          <input
            aria-label="Spaces for every column"
            type="number"
            min={1}
            max={MAX_ROTA_SLOT_CAPACITY}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value))}
            className={`${INPUT_CLASS} w-20`}
          />
        </label>
        <Button onClick={add} disabled={pending || title.trim() === '' || !isValidCapacity(capacity)}>
          Add to every column
        </Button>
      </div>
      {added === null ? null : (
        <p role="status" className="mt-2 text-sm text-green-700">
          Added to {added} column{added === 1 ? '' : 's'}.
        </p>
      )}
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
  competitionName: string;
  slug: string;
  competitionStatus: CompStatus;
  initialOpen: boolean;
  initialWithdrawalContact: string | null;
  sessionCount: number;
  pendingSessionCount: number;
  availableSessions: RotaAvailableSession[];
  sections: RotaBuilderSection[];
  // Volunteers' open "Request a change" messages.
  changeRequests: RotaChangeRequestSummary[];
  // The comp's rota formatting (the Formatting tab); the default look when not given.
  rotaStyle?: RotaStyle;
};

// The admin staff-rota screen. Three tabs: "Rota" is the everyday view — the spreadsheet-style grid
// (tap a name for contact details / move / remove, "+ Add" to fill a slot) with volunteers' change
// requests above it; "Edit layout" is where the columns, jobs, arrive-by times and number of spaces
// are built and changed; "Formatting" sets the grid's line weights and colours. Above all three: the
// sign-up link, the open/closed switch and the contacts export.
export function RotaBuilder({
  competitionId,
  competitionName,
  slug,
  competitionStatus,
  initialOpen,
  initialWithdrawalContact,
  sessionCount,
  pendingSessionCount,
  availableSessions,
  sections,
  changeRequests,
  rotaStyle = DEFAULT_ROTA_STYLE,
}: RotaBuilderProps) {
  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  // Live updates as volunteers claim slots or send change requests (or another device removes,
  // moves or resolves one). Admin-only in practice — anon has no read on either table, so it never
  // receives these events.
  const scheduleRefresh = useDebouncedRefresh();
  useRotaSignupsSubscription(competitionId, scheduleRefresh);
  useRotaChangeRequestsSubscription(competitionId, scheduleRefresh);

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

  const rotaPanel = (
    <div className="space-y-6">
      <RotaChangeRequests requests={changeRequests} sections={ordered} />
      {ordered.length === 0 ? (
        <EmptyState
          title="No rota yet"
          description="Open the Edit layout tab to build it: generate a column for each session in one click, or add columns and roles yourself."
        />
      ) : (
        <RotaAdminGrid competitionId={competitionId} sections={ordered} look={rotaStyle} />
      )}
    </div>
  );

  const layoutPanel = (
    <div className="space-y-6">
      <GenerateFromSessionsCard
        competitionId={competitionId}
        slug={slug}
        sessionCount={sessionCount}
        pendingSessionCount={pendingSessionCount}
      />

      {/* Datalist of common role names, shared by every role-title input. */}
      <datalist id="rota-role-suggestions">
        {SUGGESTED_ROTA_ROLES.map((roleName) => (
          <option key={roleName} value={roleName} />
        ))}
      </datalist>

      {ordered.length > 0 ? <AddRoleToAllForm competitionId={competitionId} /> : null}

      {ordered.length === 0 ? (
        <EmptyState
          title="No rota columns yet"
          description="Build your rota like the spreadsheet: add a column for each session (e.g. “Sat — AM”, “Set-up”), then add the roles each one needs and how many spaces each role has."
        />
      ) : (
        <div className="space-y-4">
          {ordered.map((section, index) => (
            <SectionBlock
              key={section.id}
              competitionId={competitionId}
              slug={slug}
              section={section}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
              availableSessions={availableSessions}
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

  // The live preview shows the real rota, names and all, as the grid lays it out.
  const formattingPanel = (
    <RotaFormatting
      competitionId={competitionId}
      initialStyle={rotaStyle}
      sections={ordered.map((section) => ({
        ...section,
        roles: section.roles.map((role) => ({
          ...role,
          filled: role.signups.map((signup) => ({ key: signup.id, name: signup.name })),
        })),
      }))}
    />
  );

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

      <Tabs
        tabs={[
          { id: 'rota', label: 'Rota', badge: changeRequests.length },
          { id: 'layout', label: 'Edit layout' },
          { id: 'formatting', label: 'Formatting' },
        ]}
        initialTabId={ordered.length === 0 ? 'layout' : 'rota'}
        panels={{ rota: rotaPanel, layout: layoutPanel, formatting: formattingPanel }}
      />
    </div>
  );
}
