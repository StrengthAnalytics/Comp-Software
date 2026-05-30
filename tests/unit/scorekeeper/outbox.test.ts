import { beforeEach, describe, expect, it } from 'vitest';
import { loadOutbox, outboxStorageKey, saveOutbox, type PendingOp } from '@/lib/scorekeeper/outbox';

const COMP = 'comp-1';

function ops(...entries: [string, PendingOp][]): Map<string, PendingOp> {
  return new Map(entries);
}

beforeEach(() => {
  localStorage.clear();
});

describe('outbox storage', () => {
  it('round-trips queued ops preserving insertion order', () => {
    const original = ops(
      ['w:entry-1:squat:1', { kind: 'weight', entryId: 'entry-1', lift: 'squat', attemptNumber: 1, weightKg: 100 }],
      ['r:entry-1:squat:1', { kind: 'result', entryId: 'entry-1', lift: 'squat', attemptNumber: 1, result: 'good_lift' }],
      [
        'k:entry-1:bench',
        { kind: 'rack', entryId: 'entry-1', patch: { lift: 'bench', rackHeightBench: 5, benchSafetyHeight: 3, benchSpotting: 'self' } },
      ],
    );
    saveOutbox(COMP, original);
    expect([...loadOutbox(COMP).entries()]).toEqual([...original.entries()]);
  });

  it('removes the stored key once the outbox is emptied', () => {
    saveOutbox(COMP, ops(['w:e:squat:1', { kind: 'weight', entryId: 'e', lift: 'squat', attemptNumber: 1, weightKg: 60 }]));
    expect(localStorage.getItem(outboxStorageKey(COMP))).not.toBeNull();
    saveOutbox(COMP, new Map());
    expect(localStorage.getItem(outboxStorageKey(COMP))).toBeNull();
  });

  it('scopes storage per competition', () => {
    saveOutbox('comp-a', ops(['w:e:squat:1', { kind: 'weight', entryId: 'e', lift: 'squat', attemptNumber: 1, weightKg: 60 }]));
    expect(loadOutbox('comp-b').size).toBe(0);
    expect(loadOutbox('comp-a').size).toBe(1);
  });

  it('drops corrupt JSON and clears it', () => {
    localStorage.setItem(outboxStorageKey(COMP), '{not json');
    expect(loadOutbox(COMP).size).toBe(0);
    expect(localStorage.getItem(outboxStorageKey(COMP))).toBeNull();
  });

  it('drops a structurally invalid entry and clears it', () => {
    localStorage.setItem(
      outboxStorageKey(COMP),
      JSON.stringify([['bad', { kind: 'weight', entryId: 'e', lift: 'flying', attemptNumber: 1, weightKg: 60 }]]),
    );
    expect(loadOutbox(COMP).size).toBe(0);
    expect(localStorage.getItem(outboxStorageKey(COMP))).toBeNull();
  });
});
