'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveEntryFormDesignAction, setEntryFormOpenAction } from '@/actions/entry-form';
import {
  ENTRY_FORM_FIELD_LABELS,
  ENTRY_FORM_FIELD_STATES,
  ENTRY_FORM_FIELDS,
  type EntryFormField,
  type EntryFormFieldState,
} from '@/lib/constants';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { DISCLAIMER_MAX_LENGTH, type EntryFormConfig } from '@/types/entry-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Database } from '@/types/database.types';

type CompStatus = Database['public']['Enums']['comp_status'];

// How long the "Copied" confirmation shows before reverting, matching the overlay-links control.
const COPY_RESET_MS = 2000;

const STATE_LABELS: Record<EntryFormFieldState, string> = {
  off: 'Not asked',
  optional: 'Optional',
  required: 'Required',
};

// One short line under the field name where the label alone doesn't say what the lifter sees.
const FIELD_HINTS: Partial<Record<EntryFormField, string>> = {
  division: 'The BP region / home nation they compete for.',
  weight_class: 'Lifters choose from this comp’s weight classes.',
  predicted_total: 'Their predicted total, in kg.',
  recent_best_total: 'Their best competition total from the last 12 months, in kg — helps seed prime-time flights.',
  kit: 'Asked as “Raw or Equipped” (their preference — kit is still set per comp).',
  event: 'Asked as “Full power (SBD) or Bench only” (their preference — the event is still set per comp).',
  email: 'So you can reach them about their entry.',
};

type EntryFormDesignerProps = {
  competitionId: string;
  slug: string;
  competitionStatus: CompStatus;
  initialConfig: EntryFormConfig;
  initialOpen: boolean;
};

// "Design entry form" on the entries screen: the admin decides which questions the comp's public
// entry form asks (off / optional / required per field), writes the optional disclaimer, opens or
// closes the form, and copies the shareable link. Name, sex and date of birth are always asked —
// the minimum the registration path needs — so they are shown as fixed rather than toggleable.
export function EntryFormDesigner({
  competitionId,
  slug,
  competitionStatus,
  initialConfig,
  initialOpen,
}: EntryFormDesignerProps) {
  const router = useRouter();

  const [fields, setFields] = useState(initialConfig.fields);
  const [disclaimer, setDisclaimer] = useState(initialConfig.disclaimer ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [open, setOpen] = useState(initialOpen);
  const [openPending, setOpenPending] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const formPath = `/${slug}/enter`;
  const isPublic = isCompPubliclyVisible(competitionStatus);

  function setFieldState(field: EntryFormField, state: EntryFormFieldState) {
    setSaved(false);
    setFields((current) => ({ ...current, [field]: state }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const result = await saveEntryFormDesignAction({
      competitionId,
      config: { fields, disclaimer: disclaimer.trim() === '' ? null : disclaimer },
    });
    setSaving(false);
    if (result.status === 'error') {
      setSaveError(result.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function toggleOpen() {
    const next = !open;
    setOpenError(null);
    setOpenPending(true);
    setOpen(next);
    const result = await setEntryFormOpenAction({ competitionId, open: next });
    setOpenPending(false);
    if (result.status === 'error') {
      setOpen(!next);
      setOpenError(result.message);
      return;
    }
    router.refresh();
  }

  async function copyLink() {
    setCopyError(null);
    // Build the absolute URL against the current origin so the copied link targets this deployment.
    const url = `${globalThis.location.origin}${formPath}`;
    try {
      await globalThis.navigator.clipboard.writeText(url);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopyError('Could not copy automatically — open the link and copy the URL from the address bar.');
    }
  }

  return (
    <Card title="Public entry form">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Share this comp&rsquo;s entry form and lifters register themselves. Submissions wait on this
        screen for your approval — nothing joins the comp until you approve it.
      </p>

      {/* Share link + open/close — the operational controls, above the design detail. */}
      <div className="space-y-3 rounded-md border border-neutral-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">Form link</p>
            <p className="truncate text-xs text-neutral-500">{formPath}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={copyLink}>
              {copied ? 'Copied ✓' : 'Copy URL'}
            </Button>
            <a
              href={formPath}
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
              Accepting entries
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              The entry form is only live while this is switched on — lifters who open the link see
              &ldquo;Entries are closed&rdquo; otherwise. Switch it off when entries close.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={open}
            aria-label="Accepting entries"
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

        {isPublic ? null : (
          <p className="text-xs text-amber-700">
            This competition is still a draft — the form only works once the comp is published, even
            with the form open.
          </p>
        )}
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

      {/* The design: which questions the form asks. */}
      <h3 className="mt-5 text-sm font-semibold text-neutral-900">Questions</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Name, sex and date of birth are always asked — registration needs them. Choose what else the
        form collects.
      </p>

      <ul className="mt-3 divide-y divide-neutral-100">
        {ENTRY_FORM_FIELDS.map((field) => (
          <li key={field} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{ENTRY_FORM_FIELD_LABELS[field]}</p>
              {FIELD_HINTS[field] ? (
                <p className="text-xs text-neutral-500">{FIELD_HINTS[field]}</p>
              ) : null}
            </div>
            <div
              role="radiogroup"
              aria-label={`${ENTRY_FORM_FIELD_LABELS[field]} on the entry form`}
              className="flex shrink-0 rounded-md border border-neutral-300 p-0.5"
            >
              {ENTRY_FORM_FIELD_STATES.map((state) => (
                <label
                  key={state}
                  className="cursor-pointer rounded px-2.5 py-1 text-xs font-medium text-neutral-600 has-checked:bg-brand-600 has-checked:text-white"
                >
                  <input
                    type="radio"
                    name={`entry-form-${field}`}
                    value={state}
                    checked={fields[field] === state}
                    onChange={() => setFieldState(field, state)}
                    className="sr-only"
                  />
                  {STATE_LABELS[state]}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <label htmlFor="entry-form-disclaimer" className="text-sm font-medium text-neutral-700">
          Disclaimer
        </label>
        <textarea
          id="entry-form-disclaimer"
          value={disclaimer}
          maxLength={DISCLAIMER_MAX_LENGTH}
          rows={3}
          onChange={(event) => {
            setSaved(false);
            setDisclaimer(event.target.value);
          }}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Shown at the bottom of the form with a tick-box lifters must accept before submitting.
          Leave blank for no disclaimer.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save form design'}
        </Button>
        {saved ? (
          <p role="status" className="text-sm text-green-700">
            Saved.
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" className="text-sm text-red-600">
            {saveError}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
