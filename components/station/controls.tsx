'use client';

// Shared form controls for the station capture screens (weigh-in, rack heights): a segmented pill for
// mutually-exclusive view options and a number input used by both the labelled card field and the
// dense table cell. One implementation each so their markup and a11y wiring stay consistent.

const TAB_BASE = 'rounded-md px-3 py-2 text-sm font-medium';

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
