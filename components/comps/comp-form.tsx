'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createCompetitionAction,
  updateCompetitionAction,
  type CompetitionFormState,
} from '@/actions/competitions';
import { slugify } from '@/types/competition';
import {
  COMP_STATUS_LABELS,
  COMP_STATUSES,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  FEDERATION_LABELS,
  FEDERATIONS,
  federationLabel,
  KIT_TYPE_LABELS,
  KIT_TYPES,
  type Federation,
} from '@/lib/constants';
import type { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';

type CompRow = Database['public']['Tables']['competitions']['Row'];

export type CompFormInitial = {
  id: string;
  name: string;
  slug: string;
  federation: string;
  kit_type: CompRow['kit_type'];
  event_type: CompRow['event_type'];
  status: CompRow['status'];
  starts_on: string;
  ends_on: string;
  is_team_competition: boolean;
};

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';

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

function SaveButton({
  label,
  pendingLabel,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CompForm({ initial }: { initial?: CompFormInitial }) {
  const mode = initial ? 'edit' : 'create';
  const action = initial ? updateCompetitionAction : createCompetitionAction;
  const [state, formAction] = useActionState<CompetitionFormState | null, FormData>(action, null);

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  // In create mode the slug tracks the name until the operator types their own.
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');
  // Controlled so the team-competition toggle can show only for full-power comps.
  const [eventType, setEventType] = useState<CompRow['event_type']>(initial?.event_type ?? 'full_power');
  // Federation is an explicit creation-time choice: the select starts on a disabled placeholder and
  // Create stays disabled until one is picked (with the server-side schema as the real gate). It is
  // fixed after creation, so edit mode shows it read-only.
  const [federation, setFederation] = useState<Federation | ''>('');
  // Controlled so setting the start date can default the end date (see the start onChange below).
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? '');

  const fieldErrors = state?.status === 'error' ? state.fieldErrors : undefined;
  const createBlocked = mode === 'create' && (name.trim() === '' || federation === '');

  return (
    <form action={formAction} className="space-y-5">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div>
        <label htmlFor="name" className={LABEL_CLASS}>
          Name of Competition
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) {
              setSlug(slugify(event.target.value));
            }
          }}
          className={INPUT_CLASS}
        />
        <FieldError messages={fieldErrors?.name} />
      </div>

      <div>
        <label htmlFor="slug" className={LABEL_CLASS}>
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugEdited(true);
          }}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-neutral-500">Used in URLs. Lowercase letters, numbers and hyphens.</p>
        <FieldError messages={fieldErrors?.slug} />
      </div>

      {initial ? (
        <div>
          <span className={LABEL_CLASS}>Federation</span>
          <p className="mt-1 text-sm text-neutral-900">{federationLabel(initial.federation)}</p>
          <p className="mt-1 text-xs text-neutral-500">Chosen when the competition was created.</p>
        </div>
      ) : (
        <div>
          <label htmlFor="federation" className={LABEL_CLASS}>
            Federation
          </label>
          <select
            id="federation"
            name="federation"
            required
            value={federation}
            // The select only renders FEDERATIONS values plus the placeholder, so this narrowing is exact.
            onChange={(event) => setFederation(event.target.value as Federation | '')}
            className={INPUT_CLASS}
          >
            <option value="" disabled>
              Select a federation…
            </option>
            {FEDERATIONS.map((value) => (
              <option key={value} value={value}>
                {FEDERATION_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            IPF applies the standard IPF age categories and weight classes automatically (they can&rsquo;t be
            edited). Custom starts empty so you can build your own. This can&rsquo;t be changed later.
          </p>
          <FieldError messages={fieldErrors?.federation} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="kit_type" className={LABEL_CLASS}>
            Kit
          </label>
          <select id="kit_type" name="kit_type" defaultValue={initial?.kit_type ?? 'classic'} className={INPUT_CLASS}>
            {KIT_TYPES.map((value) => (
              <option key={value} value={value}>
                {KIT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.kit_type} />
        </div>

        <div>
          <label htmlFor="event_type" className={LABEL_CLASS}>
            Event
          </label>
          <select
            id="event_type"
            name="event_type"
            value={eventType}
            // The select only renders EVENT_TYPES values, so this narrowing is exact.
            onChange={(event) => setEventType(event.target.value as CompRow['event_type'])}
            className={INPUT_CLASS}
          >
            {EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.event_type} />
        </div>

        <div>
          <label htmlFor="status" className={LABEL_CLASS}>
            Status
          </label>
          <select id="status" name="status" defaultValue={initial?.status ?? 'draft'} className={INPUT_CLASS}>
            {COMP_STATUSES.map((value) => (
              <option key={value} value={value}>
                {COMP_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.status} />
        </div>
      </div>

      {eventType === 'full_power' ? (
        <div>
          <label htmlFor="is_team_competition" className="flex items-center gap-2">
            <input
              id="is_team_competition"
              name="is_team_competition"
              type="checkbox"
              value="on"
              defaultChecked={initial?.is_team_competition ?? false}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className={LABEL_CLASS}>Team competition</span>
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Teams of three lifters — one each on squat, bench and deadlift. The team score is the sum of the three
            members&rsquo; IPF GL points, each from their best lift.
          </p>
          <FieldError messages={fieldErrors?.is_team_competition} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_on" className={LABEL_CLASS}>
            Start date
          </label>
          <input
            id="starts_on"
            name="starts_on"
            type="date"
            value={startsOn}
            onChange={(event) => {
              const next = event.target.value;
              setStartsOn(next);
              // The native date picker opens on the field's value, so an empty end date would open
              // on today's month. Defaulting it to the start date opens the picker on the comp's
              // month — and is the right value for a one-day meet. An end already at or after the
              // new start is the operator's own choice and is left alone; ISO dates compare as
              // strings.
              if (next !== '' && (endsOn === '' || endsOn < next)) {
                setEndsOn(next);
              }
            }}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.starts_on} />
        </div>

        <div>
          <label htmlFor="ends_on" className={LABEL_CLASS}>
            End date
          </label>
          <input
            id="ends_on"
            name="ends_on"
            type="date"
            value={endsOn}
            min={startsOn === '' ? undefined : startsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.ends_on} />
        </div>
      </div>

      {state?.status === 'error' ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
      {state?.status === 'ok' ? (
        <p role="status" className="text-sm text-green-700">
          Saved.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SaveButton
          label={mode === 'create' ? 'Create competition' : 'Save changes'}
          pendingLabel="Saving…"
          disabled={createBlocked}
        />
        {createBlocked ? (
          <p className="text-xs text-neutral-500">Enter a name and choose a federation to create the comp.</p>
        ) : null}
      </div>
    </form>
  );
}
