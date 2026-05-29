import { describe, expect, it } from 'vitest';
import { computeSaveIndicator, type ReportedSaveState } from '@/components/station/save-state';

function indicator(online: boolean, states: ReportedSaveState[]) {
  return computeSaveIndicator(online, new Set(states));
}

describe('computeSaveIndicator', () => {
  it('reports all-clear when online with no pending row states', () => {
    const result = indicator(true, []);
    expect(result.text).toBe('Online — all changes saved');
    expect(result.dot).toBe('bg-green-500');
    expect(result.pulse).toBe(false);
  });

  it('reports saving when a row is mid-save', () => {
    const result = indicator(true, ['saving']);
    expect(result.text).toBe('Saving…');
    expect(result.dot).toBe('bg-blue-500');
    expect(result.pulse).toBe(true);
  });

  it('surfaces a wire failure ahead of an in-flight save', () => {
    expect(indicator(true, ['saving', 'failed']).text).toBe(
      'Some changes didn’t save — they’ll retry when you edit or reconnect',
    );
    expect(indicator(true, ['error']).dot).toBe('bg-red-500');
  });

  it('shows offline-with-held-changes when offline and a row is holding an edit', () => {
    const result = indicator(false, ['offline']);
    expect(result.text).toBe('Offline — changes held, will save when reconnected');
    expect(result.pulse).toBe(true);
  });

  it('shows the bare offline message when offline with nothing held', () => {
    expect(indicator(false, []).text).toBe('Offline — changes won’t save');
  });

  it('treats offline as the top priority over an in-flight save', () => {
    // A row can report 'saving' from a transition that started before the line dropped; offline wins.
    expect(indicator(false, ['saving']).text).toBe('Offline — changes won’t save');
  });
});
