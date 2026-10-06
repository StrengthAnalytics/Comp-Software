'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRotaStyleAction } from '@/actions/rota';
import {
  BANNER_SWATCH,
  FILLED_SWATCH,
  HEADER_SWATCH,
  LINE_SWATCH,
  OPEN_SWATCH,
} from '@/lib/rota/style';
import {
  DEFAULT_ROTA_STYLE,
  ROTA_BANNER_COLOURS,
  ROTA_DAY_LINE_WEIGHTS,
  ROTA_FILLED_COLOURS,
  ROTA_HEADER_COLOURS,
  ROTA_LINE_COLOURS,
  ROTA_LINE_WEIGHTS,
  ROTA_OPEN_COLOURS,
  rotaStyleSchema,
  type RotaStyle,
} from '@/types/rota-style';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotaGrid, type RotaGridSection } from '@/components/rota/rota-grid';

// The staff rota's Formatting tab: the organiser picks line weights and colours and sees the grid
// change as they go; Save applies the look to the admin grid and the public sign-up board.

const WEIGHT_LABELS: Record<string, string> = {
  thin: 'Thin',
  medium: 'Medium',
  thick: 'Thick',
  extra: 'Extra thick',
};

const COLOUR_LABELS: Record<string, string> = {
  light: 'Light grey',
  medium: 'Mid grey',
  dark: 'Dark grey',
  black: 'Black',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  amber: 'Amber',
  grey: 'Grey',
  white: 'White',
  yellow: 'Yellow',
  charcoal: 'Charcoal',
  navy: 'Navy',
  red: 'Red',
};

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  swatches,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  // A colour square per option, for the colour pickers.
  swatches?: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="w-48 text-sm font-medium text-neutral-700">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const name = swatches ? (COLOUR_LABELS[option] ?? option) : (WEIGHT_LABELS[option] ?? option);
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${
                selected
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              {swatches ? (
                <span aria-hidden="true" className={`h-4 w-4 rounded border border-neutral-300 ${swatches[option]}`} />
              ) : null}
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A small stand-in rota for the preview when the real one has no columns yet.
const SAMPLE_SECTIONS: RotaGridSection[] = [
  { day: 'Sat', title: 'AM', crew: '8:30am', names: ['Beth', 'Sam'] },
  { day: 'Sat', title: 'PM', crew: '12:30pm', names: ['Oli'] },
  { day: 'Sun', title: 'AM', crew: '9:30am', names: [] },
].map((column, index) => ({
  id: `sample-${index}`,
  day_label: column.day,
  title: column.title,
  subtitle: null,
  sort_order: index,
  roles: [
    {
      id: `sample-${index}-mc`,
      title: 'MC',
      arrive_by: column.crew,
      sort_order: 0,
      capacity: 1,
      filled: column.names.slice(0, 1).map((name) => ({ key: `${index}-${name}`, name })),
    },
    {
      id: `sample-${index}-refs`,
      title: 'Refs',
      arrive_by: column.crew,
      sort_order: 1,
      capacity: 2,
      filled: column.names.slice(1).map((name) => ({ key: `${index}-${name}`, name })),
    },
  ],
}));

function sameStyle(a: RotaStyle, b: RotaStyle): boolean {
  return rotaStyleSchema.keyof().options.every((key) => a[key] === b[key]);
}

export function RotaFormatting({
  competitionId,
  sections,
  initialStyle,
}: {
  competitionId: string;
  // The rota as the grid shows it, for the live preview.
  sections: RotaGridSection[];
  initialStyle: RotaStyle;
}) {
  const router = useRouter();
  const [style, setStyle] = useState<RotaStyle>(initialStyle);
  const [saved, setSaved] = useState<RotaStyle>(initialStyle);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof RotaStyle>(key: K, value: RotaStyle[K]) {
    setMessage(null);
    setStyle((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setError(null);
    setMessage(null);
    const next = style;
    startTransition(async () => {
      try {
        // The default look is stored as null, so a comp on the defaults picks up future default tweaks.
        const result = await setRotaStyleAction({
          competitionId,
          style: sameStyle(next, DEFAULT_ROTA_STYLE) ? null : next,
        });
        if (result.status === 'error') {
          setError(result.message);
          return;
        }
        setSaved(next);
        setMessage('Saved. Volunteers see the new look on the sign-up page.');
        router.refresh();
      } catch {
        setError('Could not reach the server — please try again.');
      }
    });
  }

  const dirty = !sameStyle(style, saved);

  return (
    <div className="space-y-6">
      <Card title="Lines">
        <p className="-mt-3 mb-2 text-sm text-neutral-600">
          Make the grid easier to read across a busy rota: heavier lines between days than between
          sessions, and between sessions than between jobs.
        </p>
        <ChoiceGroup
          label="Between jobs (rows)"
          options={ROTA_LINE_WEIGHTS}
          value={style.roleLines}
          onChange={(value) => update('roleLines', value)}
        />
        <ChoiceGroup
          label="Between sessions (columns)"
          options={ROTA_LINE_WEIGHTS}
          value={style.sessionLines}
          onChange={(value) => update('sessionLines', value)}
        />
        <ChoiceGroup
          label="Between days"
          options={ROTA_DAY_LINE_WEIGHTS}
          value={style.dayLines}
          onChange={(value) => update('dayLines', value)}
        />
        <ChoiceGroup
          label="Line colour"
          options={ROTA_LINE_COLOURS}
          value={style.lineColour}
          onChange={(value) => update('lineColour', value)}
          swatches={LINE_SWATCH}
        />
      </Card>

      <Card title="Colours">
        <ChoiceGroup
          label="Filled slots"
          options={ROTA_FILLED_COLOURS}
          value={style.filledColour}
          onChange={(value) => update('filledColour', value)}
          swatches={FILLED_SWATCH}
        />
        <ChoiceGroup
          label="Open slots"
          options={ROTA_OPEN_COLOURS}
          value={style.openColour}
          onChange={(value) => update('openColour', value)}
          swatches={OPEN_SWATCH}
        />
        <ChoiceGroup
          label="Day banners"
          options={ROTA_BANNER_COLOURS}
          value={style.bannerColour}
          onChange={(value) => update('bannerColour', value)}
          swatches={BANNER_SWATCH}
        />
        <ChoiceGroup
          label="Headers and job names"
          options={ROTA_HEADER_COLOURS}
          value={style.headerColour}
          onChange={(value) => update('headerColour', value)}
          swatches={HEADER_SWATCH}
        />
        <label className="flex items-center gap-2 py-2 text-sm font-medium text-neutral-700">
          <input
            type="checkbox"
            checked={style.stripedRows}
            onChange={(event) => update('stripedRows', event.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Shade every other row
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty}>
          Save formatting
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setMessage(null);
            setStyle(DEFAULT_ROTA_STYLE);
          }}
          disabled={pending || sameStyle(style, DEFAULT_ROTA_STYLE)}
        >
          Back to the default look
        </Button>
        {dirty ? <span className="text-sm text-amber-700">Unsaved changes</span> : null}
        {message ? (
          <span role="status" className="text-sm text-emerald-700">
            {message}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <section aria-label="Preview">
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">
          Preview{sections.length === 0 ? ' (sample rota)' : ''}
        </h3>
        <RotaGrid sections={sections.length > 0 ? sections : SAMPLE_SECTIONS} look={style} />
      </section>
    </div>
  );
}
