import { z } from 'zod';

// How the rota grid looks — chosen by the organiser on the staff rota's Formatting tab and stored on
// the comp row (competitions.rota_style, jsonb). Every option is a fixed choice rather than a free
// colour or pixel value: the app styles with Tailwind classes only (no inline styles), so each
// choice maps to a known set of classes in lib/rota/style.ts.

export const ROTA_LINE_WEIGHTS = ['thin', 'medium', 'thick'] as const;
export const ROTA_DAY_LINE_WEIGHTS = ['medium', 'thick', 'extra'] as const;
export const ROTA_LINE_COLOURS = ['light', 'medium', 'dark', 'black'] as const;
export const ROTA_FILLED_COLOURS = ['green', 'teal', 'blue', 'purple', 'pink', 'amber'] as const;
export const ROTA_OPEN_COLOURS = ['grey', 'white', 'yellow', 'blue'] as const;
export const ROTA_BANNER_COLOURS = ['charcoal', 'navy', 'green', 'red', 'purple', 'teal'] as const;
export const ROTA_HEADER_COLOURS = ['grey', 'white', 'blue', 'green', 'yellow'] as const;

export const rotaStyleSchema = z.object({
  // The lines between jobs (rows), between sessions (columns), and between days.
  roleLines: z.enum(ROTA_LINE_WEIGHTS),
  sessionLines: z.enum(ROTA_LINE_WEIGHTS),
  dayLines: z.enum(ROTA_DAY_LINE_WEIGHTS),
  lineColour: z.enum(ROTA_LINE_COLOURS),
  filledColour: z.enum(ROTA_FILLED_COLOURS),
  openColour: z.enum(ROTA_OPEN_COLOURS),
  // The Sat / Sun banner over each day's columns.
  bannerColour: z.enum(ROTA_BANNER_COLOURS),
  // The column headers and the pinned job names down the side.
  headerColour: z.enum(ROTA_HEADER_COLOURS),
  // Shade every other job row, to help the eye follow a row across.
  stripedRows: z.boolean(),
});

export type RotaStyle = z.infer<typeof rotaStyleSchema>;

// The look a comp gets until the organiser changes it: clear row lines, stronger session lines and
// the strongest lines between days, in the original green-and-grey colours.
export const DEFAULT_ROTA_STYLE: RotaStyle = {
  roleLines: 'thin',
  sessionLines: 'medium',
  dayLines: 'thick',
  lineColour: 'medium',
  filledColour: 'green',
  openColour: 'grey',
  bannerColour: 'charcoal',
  headerColour: 'grey',
  stripedRows: false,
};

// Reads a stored style leniently: any option that's missing or no longer valid falls back to its
// default, so an old or hand-edited value never breaks the board.
export function parseRotaStyle(value: unknown): RotaStyle {
  if (value === null || typeof value !== 'object') {
    return DEFAULT_ROTA_STYLE;
  }
  const stored: Record<string, unknown> = { ...value };
  const style: RotaStyle = { ...DEFAULT_ROTA_STYLE };
  for (const [key, field] of Object.entries(rotaStyleSchema.shape)) {
    const parsed = field.safeParse(stored[key]);
    if (parsed.success) {
      Object.assign(style, { [key]: parsed.data });
    }
  }
  return style;
}

export const setRotaStyleSchema = z.object({
  competitionId: z.uuid(),
  // Null puts the comp back on the default look.
  style: rotaStyleSchema.nullable(),
});

export type SetRotaStyleInput = z.infer<typeof setRotaStyleSchema>;
