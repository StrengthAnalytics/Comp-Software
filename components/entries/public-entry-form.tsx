'use client';

import { useState } from 'react';
import { submitEntryFormAction, type SubmitEntryFormInput } from '@/actions/entry-form';
import {
  BP_DIVISIONS,
  ENTRY_FORM_EVENT_CHOICES,
  ENTRY_FORM_EVENT_LABELS,
  ENTRY_FORM_KIT_CHOICES,
  ENTRY_FORM_KIT_LABELS,
} from '@/lib/constants';
import type { EntryFormConfig } from '@/types/entry-form';
import type { FieldErrors } from '@/types/action-result';
import { Button } from '@/components/ui/button';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';

export type PublicWeightClass = { name: string; gender: string };

type PublicEntryFormProps = {
  competitionId: string;
  competitionName: string;
  config: EntryFormConfig;
  // The comp's weight classes (name + gender), for the class dropdown; empty when the field is off.
  weightClasses: PublicWeightClass[];
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

// A required question is marked visually; the server (buildSubmissionSchema against the comp's own
// design) is the real gate, the `required` attributes are just first-line UX.
function RequiredMark({ required }: { required: boolean }) {
  if (!required) {
    return null;
  }
  return (
    <span aria-hidden="true" className="text-red-500">
      {' '}
      *
    </span>
  );
}

// The lifter-facing entry form, rendered from the comp's form design: a switched-off question never
// renders, a required one is marked and enforced. Submits through the app's one anonymous server
// action; on success the form is replaced by a confirmation.
export function PublicEntryForm({
  competitionId,
  competitionName,
  config,
  weightClasses,
}: PublicEntryFormProps) {
  const f = config.fields;

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [club, setClub] = useState('');
  const [ipfMemberId, setIpfMemberId] = useState('');
  const [division, setDivision] = useState('');
  const [weightClass, setWeightClass] = useState('');
  const [predictedTotal, setPredictedTotal] = useState('');
  const [recentBestTotal, setRecentBestTotal] = useState('');
  const [kitChoice, setKitChoice] = useState('');
  const [eventChoice, setEventChoice] = useState('');
  const [instagram, setInstagram] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [website, setWebsite] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>();

  // Classes for the chosen sex only — an IPF weight class is per-sex.
  const classOptions = weightClasses.filter((option) => option.gender === gender);

  let weightClassPlaceholder = 'Choose your sex first…';
  if (gender !== '') {
    weightClassPlaceholder = f.weight_class === 'required' ? 'Select…' : 'Select (optional)…';
  }

  function chooseGender(next: string) {
    setGender(next);
    // A class chosen under the other sex is not valid any more; make the lifter re-pick.
    if (weightClass !== '' && !weightClasses.some((o) => o.gender === next && o.name === weightClass)) {
      setWeightClass('');
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors(undefined);

    const predicted = predictedTotal.trim() === '' ? null : Number(predictedTotal);
    const recentBest = recentBestTotal.trim() === '' ? null : Number(recentBestTotal);
    const input: SubmitEntryFormInput = {
      competitionId,
      website,
      firstName,
      surname,
      gender,
      dateOfBirth,
      club,
      ipfMemberId,
      division,
      weightClass,
      predictedTotalKg: predicted !== null && Number.isNaN(predicted) ? null : predicted,
      recentBestTotalKg: recentBest !== null && Number.isNaN(recentBest) ? null : recentBest,
      kitChoice,
      eventChoice,
      instagram,
      email,
      phone,
      disclaimerAccepted,
    };

    const result = await submitEntryFormAction(input);
    setSubmitting(false);
    if (result.status === 'error') {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">Entry submitted</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Thanks{firstName.trim() === '' ? '' : `, ${firstName.trim()}`} — your entry for{' '}
          {competitionName} has been sent to the organisers. It will appear in the competition once
          they approve it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Honeypot: hidden from people (and from focus order), tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="entry-website">Website</label>
        <input
          id="entry-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="entry-first-name" className={LABEL_CLASS}>
            First name
            <RequiredMark required />
          </label>
          <input
            id="entry-first-name"
            required
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.firstName} />
        </div>
        <div>
          <label htmlFor="entry-surname" className={LABEL_CLASS}>
            Surname
          </label>
          <input
            id="entry-surname"
            autoComplete="family-name"
            value={surname}
            onChange={(event) => setSurname(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.surname} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="entry-sex" className={LABEL_CLASS}>
            Sex
            <RequiredMark required />
          </label>
          <select
            id="entry-sex"
            required
            value={gender}
            onChange={(event) => chooseGender(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <FieldError messages={fieldErrors?.gender} />
        </div>
        <div>
          <label htmlFor="entry-dob" className={LABEL_CLASS}>
            Date of birth
            <RequiredMark required />
          </label>
          <input
            id="entry-dob"
            type="date"
            required
            autoComplete="bday"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.dateOfBirth} />
        </div>
      </div>

      {f.club === 'off' ? null : (
        <div>
          <label htmlFor="entry-club" className={LABEL_CLASS}>
            Club
            <RequiredMark required={f.club === 'required'} />
          </label>
          <input
            id="entry-club"
            required={f.club === 'required'}
            value={club}
            onChange={(event) => setClub(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.club} />
        </div>
      )}

      {f.ipf_member_id === 'off' ? null : (
        <div>
          <label htmlFor="entry-member-id" className={LABEL_CLASS}>
            Membership number
            <RequiredMark required={f.ipf_member_id === 'required'} />
          </label>
          <input
            id="entry-member-id"
            required={f.ipf_member_id === 'required'}
            value={ipfMemberId}
            onChange={(event) => setIpfMemberId(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.ipfMemberId} />
        </div>
      )}

      {f.division === 'off' ? null : (
        <div>
          <label htmlFor="entry-division" className={LABEL_CLASS}>
            Division
            <RequiredMark required={f.division === 'required'} />
          </label>
          <select
            id="entry-division"
            required={f.division === 'required'}
            value={division}
            onChange={(event) => setDivision(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{f.division === 'required' ? 'Select…' : 'Select (optional)…'}</option>
            {BP_DIVISIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">The region or home nation you compete for.</p>
          <FieldError messages={fieldErrors?.division} />
        </div>
      )}

      {f.weight_class === 'off' ? null : (
        <div>
          <label htmlFor="entry-weight-class" className={LABEL_CLASS}>
            Weight class
            <RequiredMark required={f.weight_class === 'required'} />
          </label>
          <select
            id="entry-weight-class"
            required={f.weight_class === 'required'}
            value={weightClass}
            disabled={gender === ''}
            onChange={(event) => setWeightClass(event.target.value)}
            className={`${INPUT_CLASS} disabled:bg-neutral-100 disabled:text-neutral-400`}
          >
            <option value="">{weightClassPlaceholder}</option>
            {classOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.weightClass} />
        </div>
      )}

      {f.kit === 'off' ? null : (
        <fieldset>
          <legend className={LABEL_CLASS}>
            Raw or Equipped?
            <RequiredMark required={f.kit === 'required'} />
          </legend>
          <div className="mt-1 flex gap-4">
            {ENTRY_FORM_KIT_CHOICES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="radio"
                  name="entry-kit"
                  required={f.kit === 'required'}
                  value={value}
                  checked={kitChoice === value}
                  onChange={() => setKitChoice(value)}
                  className="h-4 w-4 border-neutral-300"
                />
                {ENTRY_FORM_KIT_LABELS[value]}
              </label>
            ))}
          </div>
          <FieldError messages={fieldErrors?.kitChoice} />
        </fieldset>
      )}

      {f.event === 'off' ? null : (
        <fieldset>
          <legend className={LABEL_CLASS}>
            Event
            <RequiredMark required={f.event === 'required'} />
          </legend>
          <div className="mt-1 flex gap-4">
            {ENTRY_FORM_EVENT_CHOICES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="radio"
                  name="entry-event"
                  required={f.event === 'required'}
                  value={value}
                  checked={eventChoice === value}
                  onChange={() => setEventChoice(value)}
                  className="h-4 w-4 border-neutral-300"
                />
                {ENTRY_FORM_EVENT_LABELS[value]}
              </label>
            ))}
          </div>
          <FieldError messages={fieldErrors?.eventChoice} />
        </fieldset>
      )}

      {f.predicted_total === 'off' ? null : (
        <div>
          <label htmlFor="entry-predicted-total" className={LABEL_CLASS}>
            Predicted total (kg)
            <RequiredMark required={f.predicted_total === 'required'} />
          </label>
          <input
            id="entry-predicted-total"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            required={f.predicted_total === 'required'}
            value={predictedTotal}
            onChange={(event) => setPredictedTotal(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.predictedTotalKg} />
        </div>
      )}

      {f.recent_best_total === 'off' ? null : (
        <div>
          <label htmlFor="entry-recent-best-total" className={LABEL_CLASS}>
            Best comp total from the last 12 months (kg)
            <RequiredMark required={f.recent_best_total === 'required'} />
          </label>
          <input
            id="entry-recent-best-total"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            required={f.recent_best_total === 'required'}
            value={recentBestTotal}
            onChange={(event) => setRecentBestTotal(event.target.value)}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Your best total from a competition in the last 12 months
            {f.recent_best_total === 'required'
              ? '.'
              : ' — leave blank if you haven’t competed in that time.'}
          </p>
          <FieldError messages={fieldErrors?.recentBestTotalKg} />
        </div>
      )}

      {f.instagram === 'off' ? null : (
        <div>
          <label htmlFor="entry-instagram" className={LABEL_CLASS}>
            Instagram handle
            <RequiredMark required={f.instagram === 'required'} />
          </label>
          <input
            id="entry-instagram"
            placeholder="@yourhandle"
            required={f.instagram === 'required'}
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors?.instagram} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {f.email === 'off' ? null : (
          <div>
            <label htmlFor="entry-email" className={LABEL_CLASS}>
              Email address
              <RequiredMark required={f.email === 'required'} />
            </label>
            <input
              id="entry-email"
              type="email"
              autoComplete="email"
              required={f.email === 'required'}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT_CLASS}
            />
            <FieldError messages={fieldErrors?.email} />
          </div>
        )}
        {f.phone === 'off' ? null : (
          <div>
            <label htmlFor="entry-phone" className={LABEL_CLASS}>
              Phone number
              <RequiredMark required={f.phone === 'required'} />
            </label>
            <input
              id="entry-phone"
              type="tel"
              autoComplete="tel"
              required={f.phone === 'required'}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={INPUT_CLASS}
            />
            <FieldError messages={fieldErrors?.phone} />
          </div>
        )}
      </div>

      {config.disclaimer === null ? null : (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{config.disclaimer}</p>
          <label className="mt-3 flex items-start gap-2 text-sm font-medium text-neutral-800">
            <input
              type="checkbox"
              required
              checked={disclaimerAccepted}
              onChange={(event) => setDisclaimerAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            />
            <span>
              I accept the above
              <RequiredMark required />
            </span>
          </label>
          <FieldError messages={fieldErrors?.disclaimerAccepted} />
        </div>
      )}

      {formError === null ? null : (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? 'Submitting…' : 'Submit entry'}
      </Button>
    </form>
  );
}
