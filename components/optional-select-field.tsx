'use client';

// A labelled <select> for an optional enum value, with a blank "—" choice mapping to no selection.
// The class names default to the registration/weigh-in form style; callers in denser layouts (e.g. the
// run-screen rack cell) override them. Shared so the blank-option convention and the value narrowing
// live in one place rather than being re-implemented per form.
export function OptionalSelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  labels,
  wrapperClassName = 'flex flex-col gap-1',
  labelClassName = 'text-xs font-medium text-neutral-500',
  selectClassName = 'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none',
}: {
  label: string;
  value: T | '';
  onChange: (value: T | '') => void;
  options: readonly T[];
  labels: Record<T, string>;
  wrapperClassName?: string;
  labelClassName?: string;
  selectClassName?: string;
}) {
  return (
    <label className={wrapperClassName}>
      <span className={labelClassName}>{label}</span>
      <select
        value={value}
        // The select only renders the given options plus the blank value, so this narrowing is exact.
        onChange={(event) => onChange(event.target.value as T | '')}
        className={selectClassName}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
