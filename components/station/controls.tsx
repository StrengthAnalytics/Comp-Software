'use client';

import {
  CELL_INPUT,
  CELL_INPUT_REQUIRED,
  FIELD_CLASS,
  INPUT_CLASS,
  INPUT_REQUIRED_CLASS,
  LABEL_CLASS,
  TAB_BASE,
} from '@/components/station/styles';

// Shared form controls for the station capture screens (weigh-in, rack heights): a segmented pill for
// mutually-exclusive view options, a number input used by both the labelled card field and the dense
// table cell, and the labelled card field / bare table cell wrappers around it. One implementation
// each so their markup and a11y wiring stay consistent.

// A pill of mutually-exclusive options (the Cards/Table toolbar, etc.). The markup, active styling and
// `role=group`/`aria-pressed` wiring live here so every screen's toggles match.
export function SegmentedToggle<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-neutral-300 p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            title={option.title}
            className={`${TAB_BASE} ${active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Number `<input>` for both the card field (labelled wrapper) and the dense table cell (bare,
// aria-labelled), so the type/step/blur/aria-invalid handling lives in one place. The caller supplies
// the className so the compact-cell and card-field styles stay at the call site.
export function NumberInput({
  value,
  onChange,
  onBlur,
  step,
  invalid = false,
  className,
  ariaLabel,
  ariaRequired = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  step: string;
  invalid?: boolean;
  className: string;
  ariaLabel?: string;
  ariaRequired?: boolean;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      aria-label={ariaLabel}
      aria-required={ariaRequired || undefined}
      aria-invalid={invalid || undefined}
      className={className}
    />
  );
}

// Labelled number field for the card layout. `required` adds the asterisk and aria-required; `invalid`
// switches to the empty-required styling. Screens that have no required fields (e.g. rack heights) omit
// both.
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  step,
  invalid = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  step: string;
  invalid?: boolean;
  required?: boolean;
}) {
  return (
    <label className={FIELD_CLASS}>
      <span className={LABEL_CLASS}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <NumberInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        step={step}
        invalid={invalid}
        ariaRequired={required}
        className={`${invalid ? INPUT_REQUIRED_CLASS : INPUT_CLASS} text-center`}
      />
    </label>
  );
}

// Bare number cell for the dense table layout (the column header carries the label, so it's supplied as
// the aria-label). `invalid` switches to the empty-required cell styling.
export function CellNumber({
  label,
  value,
  onChange,
  onBlur,
  step,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  step: string;
  invalid?: boolean;
}) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      step={step}
      invalid={invalid}
      ariaLabel={label}
      className={invalid ? CELL_INPUT_REQUIRED : CELL_INPUT}
    />
  );
}
