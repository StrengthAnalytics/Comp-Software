'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addRotaSignupAction, moveRotaSignupAction, removeRotaSignupAction } from '@/actions/rota';
import type { ActionResult, FieldErrors } from '@/types/action-result';
import { Button } from '@/components/ui/button';
import { RotaDialog } from '@/components/rota/rota-dialog';
import { RotaGrid, type RotaGridSection } from '@/components/rota/rota-grid';
import type { RotaStyle } from '@/types/rota-style';
import type { RotaBuilderRole, RotaBuilderSection, RotaSignupSummary } from '@/components/rota/rota-builder';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';
const NETWORK_ERROR = 'Could not reach the server — please try again.';

// "Sat AM · Refs" — how a slot is named in dialogs and the move list.
export function rotaSlotLabel(section: RotaBuilderSection, role: RotaBuilderRole): string {
  const column = [section.day_label, section.title].filter((part) => part && part.trim() !== '').join(' ');
  return `${column} · ${role.title}`;
}

type SlotRef = { section: RotaBuilderSection; role: RotaBuilderRole };

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

// --- A volunteer's details: contact, move, remove -------------------------------------------------

function VolunteerDialog({
  signup,
  slot,
  moveTargets,
  onClose,
}: {
  signup: RotaSignupSummary;
  slot: SlotRef;
  // Every other slot in the comp that still has space.
  moveTargets: SlotRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [targetRoleId, setTargetRoleId] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === 'error') {
          setError(result.message);
          setConfirmingRemove(false);
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  function remove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    run(() => removeRotaSignupAction({ id: signup.id }));
  }

  function move() {
    if (targetRoleId === '') {
      return;
    }
    run(() => moveRotaSignupAction({ id: signup.id, roleId: targetRoleId }));
  }

  return (
    <RotaDialog title={signup.name} description={rotaSlotLabel(slot.section, slot.role)} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Email</dt>
          <dd>
            {signup.email ? (
              <a href={`mailto:${signup.email}`} className="text-brand-700 hover:underline">
                {signup.email}
              </a>
            ) : (
              <span className="text-neutral-500">Not given</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Mobile</dt>
          <dd>
            {signup.phone ? (
              <a href={`tel:${signup.phone}`} className="text-brand-700 hover:underline">
                {signup.phone}
              </a>
            ) : (
              <span className="text-neutral-500">Not given</span>
            )}
          </dd>
        </div>
      </dl>

      {moveTargets.length > 0 ? (
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <label htmlFor="rota-move-target" className={LABEL_CLASS}>
            Move to another slot
          </label>
          <div className="mt-1 flex gap-2">
            <select
              id="rota-move-target"
              value={targetRoleId}
              onChange={(event) => setTargetRoleId(event.target.value)}
              className={`${INPUT_CLASS} mt-0 min-w-0 flex-1`}
            >
              <option value="">Choose a slot…</option>
              {moveTargets.map((target) => (
                <option key={target.role.id} value={target.role.id}>
                  {rotaSlotLabel(target.section, target.role)}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={move} disabled={pending || targetRoleId === ''}>
              Move
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <Button variant="danger" onClick={remove} disabled={pending}>
          {confirmingRemove ? `Yes, remove ${signup.name}` : 'Remove from this slot'}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Close
        </Button>
      </div>
      {confirmingRemove ? (
        <p className="mt-2 text-xs text-amber-700">This frees the slot for someone else. It can&rsquo;t be undone.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </RotaDialog>
  );
}

// --- Put someone in an open slot ------------------------------------------------------------------

function AddVolunteerDialog({
  competitionId,
  slot,
  onClose,
}: {
  competitionId: string;
  slot: SlotRef;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors(undefined);
    startTransition(async () => {
      try {
        const result = await addRotaSignupAction({ competitionId, roleId: slot.role.id, name, email, phone });
        if (result.status === 'error') {
          setError(result.message);
          setFieldErrors(result.fieldErrors);
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <RotaDialog title="Add a helper" description={rotaSlotLabel(slot.section, slot.role)} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rota-add-name" className={LABEL_CLASS}>
            Name
          </label>
          <input
            id="rota-add-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.name} />
        </div>
        <div>
          <label htmlFor="rota-add-email" className={LABEL_CLASS}>
            Email <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            id="rota-add-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.email} />
        </div>
        <div>
          <label htmlFor="rota-add-phone" className={LABEL_CLASS}>
            Mobile <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            id="rota-add-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.phone} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || name.trim() === ''}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </RotaDialog>
  );
}

// --- The admin grid -------------------------------------------------------------------------------

type RotaAdminGridProps = {
  competitionId: string;
  sections: RotaBuilderSection[];
  // The comp's rota formatting, so the admin sees what volunteers see.
  look?: RotaStyle;
};

// The organiser's everyday view of the rota: the same grid volunteers see, but every name opens the
// volunteer's contact details (with move and remove), and every open slot has "+ Add" to put someone
// in directly. Changing the columns, jobs and number of spaces lives in the Edit layout tab.
export function RotaAdminGrid({ competitionId, sections, look }: RotaAdminGridProps) {
  const [openSignupId, setOpenSignupId] = useState<string | null>(null);
  const [addingRoleId, setAddingRoleId] = useState<string | null>(null);

  const ordered = sections.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  const slotByRole = new Map<string, SlotRef>();
  const signupById = new Map<string, { signup: RotaSignupSummary; slot: SlotRef }>();
  for (const section of ordered) {
    for (const role of section.roles) {
      const slot = { section, role };
      slotByRole.set(role.id, slot);
      for (const signup of role.signups) {
        signupById.set(signup.id, { signup, slot });
      }
    }
  }

  const gridSections: RotaGridSection[] = ordered.map((section) => ({
    ...section,
    roles: section.roles.map((role) => ({
      ...role,
      filled: role.signups.map((signup) => ({ key: signup.id, name: signup.name })),
    })),
  }));

  const openSignup = openSignupId ? signupById.get(openSignupId) : undefined;
  const addingSlot = addingRoleId ? slotByRole.get(addingRoleId) : undefined;

  // Slots with space, in grid order, for the volunteer dialog's "Move to" list.
  const moveTargets = (excludeRoleId: string): SlotRef[] =>
    ordered.flatMap((section) =>
      section.roles
        .toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .filter((role) => role.id !== excludeRoleId && role.signups.length < role.capacity)
        .map((role) => ({ section, role })),
    );

  return (
    <>
      <RotaGrid
        sections={gridSections}
        look={look}
        renderFilled={(role, volunteer, classes) => {
          const slot = slotByRole.get(role.id);
          return (
            <button
              type="button"
              onClick={() => setOpenSignupId(volunteer.key)}
              aria-label={`${volunteer.name}, ${slot ? rotaSlotLabel(slot.section, slot.role) : role.title}: contact details`}
              className={`${classes.filledSlot} ${classes.filledSlotHover}`}
            >
              {volunteer.name}
            </button>
          );
        }}
        renderOpen={(role, _slotIndex, classes) => {
          const slot = slotByRole.get(role.id);
          return (
            <button
              type="button"
              onClick={() => setAddingRoleId(role.id)}
              aria-label={`Add a helper to ${slot ? rotaSlotLabel(slot.section, slot.role) : role.title}`}
              className={`${classes.openSlot} hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700`}
            >
              + Add
            </button>
          );
        }}
      />
      <p className="mt-2 text-xs text-neutral-500">
        Tap a name to see their email and mobile, move them or remove them. Tap &ldquo;+ Add&rdquo; to put
        someone in a slot yourself.
      </p>

      {openSignup ? (
        <VolunteerDialog
          signup={openSignup.signup}
          slot={openSignup.slot}
          moveTargets={moveTargets(openSignup.slot.role.id)}
          onClose={() => setOpenSignupId(null)}
        />
      ) : null}

      {addingSlot ? (
        <AddVolunteerDialog competitionId={competitionId} slot={addingSlot} onClose={() => setAddingRoleId(null)} />
      ) : null}
    </>
  );
}
