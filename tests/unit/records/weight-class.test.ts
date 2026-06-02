import { describe, expect, it } from 'vitest';
import { normalizeRecordWeightClass } from '@/lib/records/weight-class';

describe('normalizeRecordWeightClass', () => {
  it.each([
    ['83kg', '-83 kg'],
    ['83 kg', '-83 kg'],
    ['-83kg', '-83 kg'],
    ['-83 kg', '-83 kg'],
    ['  83KG  ', '-83 kg'],
    ['47', '-47 kg'],
  ])('maps an upper-bound class %s → %s', (input, expected) => {
    expect(normalizeRecordWeightClass(input)).toBe(expected);
  });

  it.each([
    ['120+kg', '120 kg+'],
    ['120kg+', '120 kg+'],
    ['120+', '120 kg+'],
    ['120 kg+', '120 kg+'],
    ['84+ kg', '84 kg+'],
  ])('maps the unlimited top class %s → %s', (input, expected) => {
    expect(normalizeRecordWeightClass(input)).toBe(expected);
  });

  it('returns a blank value unchanged', () => {
    expect(normalizeRecordWeightClass('   ')).toBe('');
  });

  it('leaves a value with no number unchanged (it will surface as a warning)', () => {
    expect(normalizeRecordWeightClass('Youth')).toBe('Youth');
  });
});
