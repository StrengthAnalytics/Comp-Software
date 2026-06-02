'use client';

import { useState, useTransition } from 'react';
import { createRecordAction, updateRecordAction } from '@/actions/records';
import { numberToInput, parseOptionalNumber } from '@/lib/number-input';
import {
  RECORD_AGE_CATEGORIES,
  RECORD_EQUIPMENT_LABELS,
  RECORD_EQUIPMENTS,
  RECORD_GENDER_LABELS,
  RECORD_GENDERS,
  RECORD_LIFT_LABELS,
  RECORD_LIFTS,
  RECORD_WEIGHT_CLASSES,
  SUGGESTED_RECORD_REGIONS,
  type RecordEquipment,
  type RecordGender,
  type RecordLift,
} from '@/lib/constants';
import type { RecordView } from '@/lib/records/record-view';
import type { FieldErrors } from '@/types/action-result';

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
const LABEL_CLASS = 'text-sm font-medium text-neutral-700';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';

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

export function RecordForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: RecordView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const saveLabel = isEdit ? 'Save changes' : 'Add record';

  const [region, setRegion] = useState(initial?.region ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<RecordGender>(initial?.gender ?? 'M');
  const [weightClass, setWeightClass] = useState(initial?.weightClass ?? '');
  const [ageCategory, setAgeCategory] = useState(initial?.ageCategory ?? 'Open');
  const [lift, setLift] = useState<RecordLift>(initial?.lift ?? 'squat');
  const [equipment, setEquipment] = useState<RecordEquipment>(initial?.equipment ?? 'unequipped');
  const [weight, setWeight] = useState(numberToInput(initial?.weightKg ?? null));
  const [dateSet, setDateSet] = useState(initial?.dateSet ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setFieldErrors({});

    const weightKg = parseOptionalNumber(weight);
    if (weightKg === null) {
      setFieldErrors({ weightKg: ['Enter the record weight in kg.'] });
      return;
    }

    const input = {
      region,
      name,
      gender,
      weightClass,
      ageCategory,
      lift,
      equipment,
      weightKg,
      dateSet,
      notes,
    };

    startTransition(async () => {
      const outcome = isEdit
        ? await updateRecordAction({ ...input, id: initial!.id })
        : await createRecordAction(input);
      if (outcome.status === 'error') {
        setError(outcome.message);
        setFieldErrors(outcome.fieldErrors ?? {});
        return;
      }
      onSaved();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{isEdit ? 'Edit record' : 'Add record'}</h2>
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          Cancel
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={LABEL_CLASS} htmlFor="record-region">
            Region
          </label>
          <input
            id="record-region"
            list="record-region-options"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className={INPUT_CLASS}
            placeholder="e.g. British, England, London"
          />
          <datalist id="record-region-options">
            {SUGGESTED_RECORD_REGIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <FieldError messages={fieldErrors.region} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-name">
            Record holder
          </label>
          <input
            id="record-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors.name} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-gender">
            Gender
          </label>
          <select
            id="record-gender"
            value={gender}
            onChange={(event) => setGender(event.target.value as RecordGender)}
            className={INPUT_CLASS}
          >
            {RECORD_GENDERS.map((option) => (
              <option key={option} value={option}>
                {RECORD_GENDER_LABELS[option]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.gender} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-weight-class">
            Weight class
          </label>
          <input
            id="record-weight-class"
            list="record-weight-class-options"
            value={weightClass}
            onChange={(event) => setWeightClass(event.target.value)}
            className={INPUT_CLASS}
            placeholder="e.g. -83 kg (or 83kg)"
          />
          <datalist id="record-weight-class-options">
            {RECORD_WEIGHT_CLASSES[gender].map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <FieldError messages={fieldErrors.weightClass} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-age">
            Age category
          </label>
          <input
            id="record-age"
            list="record-age-options"
            value={ageCategory}
            onChange={(event) => setAgeCategory(event.target.value)}
            className={INPUT_CLASS}
          />
          <datalist id="record-age-options">
            {RECORD_AGE_CATEGORIES.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <FieldError messages={fieldErrors.ageCategory} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-lift">
            Lift
          </label>
          <select
            id="record-lift"
            value={lift}
            onChange={(event) => setLift(event.target.value as RecordLift)}
            className={INPUT_CLASS}
          >
            {RECORD_LIFTS.map((option) => (
              <option key={option} value={option}>
                {RECORD_LIFT_LABELS[option]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.lift} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-equipment">
            Equipment
          </label>
          <select
            id="record-equipment"
            value={equipment}
            onChange={(event) => setEquipment(event.target.value as RecordEquipment)}
            className={INPUT_CLASS}
          >
            {RECORD_EQUIPMENTS.map((option) => (
              <option key={option} value={option}>
                {RECORD_EQUIPMENT_LABELS[option]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors.equipment} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-weight">
            Record (kg)
          </label>
          <input
            id="record-weight"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors.weightKg} />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="record-date">
            Date set
          </label>
          <input
            id="record-date"
            type="date"
            value={dateSet}
            onChange={(event) => setDateSet(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors.dateSet} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className={LABEL_CLASS} htmlFor="record-notes">
            Notes (optional)
          </label>
          <input
            id="record-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError messages={fieldErrors.notes} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : saveLabel}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
