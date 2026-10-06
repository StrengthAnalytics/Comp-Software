import type { RotaStyle } from '@/types/rota-style';

// Turns the organiser's rota formatting choices (types/rota-style.ts) into Tailwind classes. Every
// class is written out in full so Tailwind's scanner generates it — never build a class name from
// pieces here.

type LineWeight = RotaStyle['roleLines'];
type DayLineWeight = RotaStyle['dayLines'];

const BOTTOM_LINE: Record<LineWeight, string> = {
  thin: 'border-b',
  medium: 'border-b-2',
  thick: 'border-b-4',
};

const RIGHT_LINE: Record<LineWeight | DayLineWeight, string> = {
  thin: 'border-r',
  medium: 'border-r-2',
  thick: 'border-r-4',
  extra: 'border-r-8',
};

const LINE_COLOUR: Record<RotaStyle['lineColour'], string> = {
  light: 'border-neutral-200',
  medium: 'border-neutral-400',
  dark: 'border-neutral-600',
  black: 'border-neutral-900',
};

const SLOT_SHAPE = 'block w-full rounded px-2 py-1 text-center text-sm';

const FILLED_SLOT: Record<RotaStyle['filledColour'], { base: string; hover: string }> = {
  green: { base: 'bg-emerald-400 text-emerald-950', hover: 'hover:bg-emerald-500' },
  teal: { base: 'bg-teal-400 text-teal-950', hover: 'hover:bg-teal-500' },
  blue: { base: 'bg-sky-400 text-sky-950', hover: 'hover:bg-sky-500' },
  purple: { base: 'bg-violet-300 text-violet-950', hover: 'hover:bg-violet-400' },
  pink: { base: 'bg-pink-300 text-pink-950', hover: 'hover:bg-pink-400' },
  amber: { base: 'bg-amber-300 text-amber-950', hover: 'hover:bg-amber-400' },
};

const OPEN_SLOT: Record<RotaStyle['openColour'], string> = {
  grey: 'border border-dashed border-neutral-300 bg-neutral-100 text-neutral-500',
  white: 'border border-dashed border-neutral-300 bg-white text-neutral-500',
  yellow: 'border border-dashed border-yellow-400 bg-yellow-50 text-yellow-800',
  blue: 'border border-dashed border-sky-300 bg-sky-50 text-sky-800',
};

const BANNER: Record<RotaStyle['bannerColour'], string> = {
  charcoal: 'bg-neutral-800 text-white',
  navy: 'bg-blue-900 text-white',
  green: 'bg-emerald-800 text-white',
  red: 'bg-red-800 text-white',
  purple: 'bg-violet-800 text-white',
  teal: 'bg-teal-800 text-white',
};

const HEADER: Record<RotaStyle['headerColour'], string> = {
  grey: 'bg-neutral-100',
  white: 'bg-white',
  blue: 'bg-sky-50',
  green: 'bg-emerald-50',
  yellow: 'bg-yellow-50',
};

// Every other job row, when striped. The pinned job-name cell keeps the header colour.
const STRIPE = 'bg-neutral-50';

export type RotaGridClasses = {
  // A cell's line colour, used with the line-weight classes below.
  lineColour: string;
  // Under every job row, and under the column headers.
  roleLine: string;
  // To the right of a column whose neighbour is the same day…
  sessionLine: string;
  // …and of the last column of a day (and of the pinned job names).
  dayLine: string;
  banner: string;
  header: string;
  stripe: string;
  filledSlot: string;
  // Extra classes for a filled slot that is a button.
  filledSlotHover: string;
  openSlot: string;
};

export function rotaGridClasses(style: RotaStyle): RotaGridClasses {
  const filled = FILLED_SLOT[style.filledColour];
  return {
    lineColour: LINE_COLOUR[style.lineColour],
    roleLine: BOTTOM_LINE[style.roleLines],
    sessionLine: RIGHT_LINE[style.sessionLines],
    dayLine: RIGHT_LINE[style.dayLines],
    banner: BANNER[style.bannerColour],
    header: HEADER[style.headerColour],
    stripe: style.stripedRows ? STRIPE : '',
    filledSlot: `${SLOT_SHAPE} truncate font-semibold ${filled.base}`,
    filledSlotHover: filled.hover,
    openSlot: `${SLOT_SHAPE} ${OPEN_SLOT[style.openColour]}`,
  };
}

// Swatch classes for the Formatting tab's colour pickers (a small filled square per choice).
export const FILLED_SWATCH: Record<RotaStyle['filledColour'], string> = {
  green: 'bg-emerald-400',
  teal: 'bg-teal-400',
  blue: 'bg-sky-400',
  purple: 'bg-violet-300',
  pink: 'bg-pink-300',
  amber: 'bg-amber-300',
};

export const OPEN_SWATCH: Record<RotaStyle['openColour'], string> = {
  grey: 'bg-neutral-100',
  white: 'bg-white',
  yellow: 'bg-yellow-50',
  blue: 'bg-sky-50',
};

export const BANNER_SWATCH: Record<RotaStyle['bannerColour'], string> = {
  charcoal: 'bg-neutral-800',
  navy: 'bg-blue-900',
  green: 'bg-emerald-800',
  red: 'bg-red-800',
  purple: 'bg-violet-800',
  teal: 'bg-teal-800',
};

export const HEADER_SWATCH: Record<RotaStyle['headerColour'], string> = HEADER;

export const LINE_SWATCH: Record<RotaStyle['lineColour'], string> = {
  light: 'bg-neutral-200',
  medium: 'bg-neutral-400',
  dark: 'bg-neutral-600',
  black: 'bg-neutral-900',
};
