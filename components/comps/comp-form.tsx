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
  KIT_TYPE_LABELS,
  KIT_TYPES,
} from '@/lib/constants';
import type { Database } from '@/types/database.types';

type CompRow = Database['public']['Tables']['competitions']['Row'];

export type CompFormInitial = {
  id: string;
  name: string;
  slug: string;
  kit_type: CompRow['kit_type'];
  event_type: CompRow['event_type'];
  status: CompRow['status'];
  starts_on: string;
  ends_on: string;
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

function SaveButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
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

  const fieldErrors = state?.status === 'error' ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-5">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div>
        <label htmlFor="name" className={LABEL_CLASS}>
          Name
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
            defaultValue={initial?.event_type ?? 'full_power'}
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_on" className={LABEL_CLASS}>
            Start date
          </label>
          <input
            id="starts_on"
            name="starts_on"
            type="date"
            defaultValue={initial?.starts_on ?? ''}
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
            defaultValue={initial?.ends_on ?? ''}
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
        />
      </div>
    </form>
  );
}
