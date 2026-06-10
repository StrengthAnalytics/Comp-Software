// Shared Tailwind class strings for the station capture screens (weigh-in, rack heights), so their
// inputs, buttons, dense table cells and printed backup sheets stay visually identical. The `*_BASE`
// strings are composition building blocks for the variants below them.

import { buttonClasses } from '@/components/ui/button';

const INPUT_BASE = 'rounded-md border px-3 py-2 text-sm text-neutral-900 focus:outline-none';
export const INPUT_CLASS = `${INPUT_BASE} border-neutral-300 focus:border-neutral-500`;
// Empty fields that must be filled before a lifter can be confirmed (e.g. weigh-in bodyweight/openers).
export const INPUT_REQUIRED_CLASS = `${INPUT_BASE} border-red-400 bg-red-50 focus:border-red-500`;
export const LABEL_CLASS = 'text-xs font-medium text-neutral-500';
// Fields hold short values (weights, hole numbers, a short setting), so each box is a fixed compact
// width and the row wraps.
export const FIELD_CLASS = 'flex w-32 flex-col gap-1';
export const PRIMARY_BUTTON = buttonClasses('primary');
export const GHOST_BUTTON = buttonClasses('secondary');
export const TAB_BASE = 'rounded-md px-3 py-2 text-sm font-medium';

// Compact controls for the dense table view (the column header carries the label, so cells are bare).
// Values are centred in their box and the box is centred in the cell, so the numbers line up down a
// column.
const CELL_INPUT_BASE = 'mx-auto block w-24 rounded border px-2 py-1 text-center text-sm text-neutral-900 focus:outline-none';
export const CELL_INPUT = `${CELL_INPUT_BASE} border-neutral-300 focus:border-neutral-500`;
export const CELL_INPUT_REQUIRED = `${CELL_INPUT_BASE} border-red-400 bg-red-50 focus:border-red-500`;
export const CELL_SELECT =
  'w-full rounded border border-neutral-300 px-2 py-1 text-center text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
// The dense table cells keep their own compact button geometry (the buttonClasses sizes are too
// roomy for a cell), but the colour follows the shared primary so the vocabulary stays one brand.
export const CELL_PRIMARY =
  'rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50';

// Two-row sticky header: the group-label bar pins at the top, the column headers pin just below it.
// TABLE_TH's `top-9` must equal the label bar's `h-9` so the headers tuck directly under the label
// rather than overlapping it. z-order: label (30) over column headers (20) over the frozen lifter
// column (10), so each layer covers the scrolling cells beneath it.
export const TABLE_LABEL =
  'sticky top-0 z-30 flex h-9 items-center bg-neutral-100 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500';
const TABLE_TH_BASE =
  'sticky top-9 z-20 border-b border-neutral-300 bg-neutral-100 px-2 py-2 text-xs font-medium text-neutral-600 whitespace-nowrap';
// The lifter column stays left-aligned over the names; the data columns centre to sit over their
// centred values.
export const TABLE_TH = `${TABLE_TH_BASE} text-left`;
export const TABLE_TH_CENTER = `${TABLE_TH_BASE} text-center`;
export const TABLE_TD = 'border-b border-neutral-200 px-2 py-1.5 align-top';

// Printable backup sheet: plain ruled cells; the blank cells get extra height to write into by hand.
export const PRINT_TH = 'border border-neutral-500 px-2 py-1 text-center text-[11px] font-semibold uppercase';
export const PRINT_TD = 'border border-neutral-400 px-2 py-1 text-center';
export const PRINT_BLANK = 'border border-neutral-400 px-2 py-3';
