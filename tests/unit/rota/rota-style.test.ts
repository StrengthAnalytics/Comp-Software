import { describe, expect, it } from 'vitest';
import { rotaGridClasses } from '@/lib/rota/style';
import { DEFAULT_ROTA_STYLE, parseRotaStyle, setRotaStyleSchema } from '@/types/rota-style';

describe('parseRotaStyle', () => {
  it('gives the default look for nothing stored', () => {
    expect(parseRotaStyle(null)).toEqual(DEFAULT_ROTA_STYLE);
    expect(parseRotaStyle('blue')).toEqual(DEFAULT_ROTA_STYLE);
  });

  it('keeps valid choices and falls back to the default for missing or unknown ones', () => {
    expect(parseRotaStyle({ filledColour: 'blue', dayLines: 'enormous', stripedRows: true, extra: 1 })).toEqual({
      ...DEFAULT_ROTA_STYLE,
      filledColour: 'blue',
      stripedRows: true,
    });
  });
});

describe('setRotaStyleSchema', () => {
  const competitionId = '7b5036f4-43c5-4b1c-8c1a-9d59a2f3b111';

  it('accepts a full style, or null for the default look', () => {
    expect(setRotaStyleSchema.safeParse({ competitionId, style: DEFAULT_ROTA_STYLE }).success).toBe(true);
    expect(setRotaStyleSchema.safeParse({ competitionId, style: null }).success).toBe(true);
  });

  it('rejects an option that is not one of the choices', () => {
    const style = { ...DEFAULT_ROTA_STYLE, lineColour: 'hotpink' };
    expect(setRotaStyleSchema.safeParse({ competitionId, style }).success).toBe(false);
  });
});

describe('rotaGridClasses', () => {
  it('turns the default look into clear, graded lines', () => {
    const classes = rotaGridClasses(DEFAULT_ROTA_STYLE);
    expect(classes.roleLine).toBe('border-b');
    expect(classes.sessionLine).toBe('border-r-2');
    expect(classes.dayLine).toBe('border-r-4');
    expect(classes.lineColour).toBe('border-neutral-400');
    expect(classes.filledSlot).toContain('bg-emerald-400');
    expect(classes.stripe).toBe('');
  });

  it('follows the organiser’s choices', () => {
    const classes = rotaGridClasses({
      ...DEFAULT_ROTA_STYLE,
      roleLines: 'thick',
      dayLines: 'extra',
      lineColour: 'black',
      filledColour: 'blue',
      openColour: 'yellow',
      bannerColour: 'navy',
      headerColour: 'green',
      stripedRows: true,
    });
    expect(classes.roleLine).toBe('border-b-4');
    expect(classes.dayLine).toBe('border-r-8');
    expect(classes.lineColour).toBe('border-neutral-900');
    expect(classes.filledSlot).toContain('bg-sky-400');
    expect(classes.filledSlotHover).toBe('hover:bg-sky-500');
    expect(classes.openSlot).toContain('bg-yellow-50');
    expect(classes.banner).toContain('bg-blue-900');
    expect(classes.header).toBe('bg-emerald-50');
    expect(classes.stripe).toBe('bg-neutral-50');
  });

  it('cuts a long name off on a wide screen and lets it wrap on a small one', () => {
    const classes = rotaGridClasses(DEFAULT_ROTA_STYLE);
    expect(classes.filledSlot).toContain('lg:truncate');
    expect(classes.filledSlot).toContain('wrap-anywhere');
    expect(classes.filledSlot.split(' ')).not.toContain('truncate');
  });

  it('tightens the slots of a squeezed grid on a phone only', () => {
    const usual = rotaGridClasses(DEFAULT_ROTA_STYLE);
    const squeezed = rotaGridClasses(DEFAULT_ROTA_STYLE, { squeezed: true });
    for (const slot of [squeezed.filledSlot, squeezed.openSlot]) {
      expect(slot.split(' ')).toEqual(expect.arrayContaining(['px-px', 'sm:px-1', 'sm:text-sm', 'lg:px-2']));
    }
    expect(usual.filledSlot.split(' ')).not.toContain('px-px');
    // Colours and name wrapping are the same either way.
    expect(squeezed.filledSlot).toContain('bg-emerald-400');
    expect(squeezed.filledSlot).toContain('wrap-anywhere');
  });
});
