import { describe, expect, it } from 'vitest';
import { reconcileForm, sameForm, type EntryFormValues } from '@/lib/entries/form-sync';

function form(overrides: Partial<EntryFormValues> = {}): EntryFormValues {
  return {
    weightClassId: 'wc-1',
    divisionId: 'div-1',
    lotNumber: '12',
    bodyweight: '82.5',
    openerSquat: '200',
    openerBench: '120',
    openerDeadlift: '240',
    rackSquat: '14',
    squatSetting: 'in',
    rackBench: '8',
    benchSafety: '4',
    benchSpotting: 'self',
    status: 'weighed_in',
    ...overrides,
  };
}

describe('sameForm', () => {
  it('is true for identical snapshots and false when any field differs', () => {
    expect(sameForm(form(), form())).toBe(true);
    expect(sameForm(form(), form({ openerSquat: '202.5' }))).toBe(false);
    expect(sameForm(form(), form({ status: 'lifting' }))).toBe(false);
    expect(sameForm(form(), form({ squatSetting: '' }))).toBe(false);
    expect(sameForm(form(), form({ weightClassId: '' }))).toBe(false);
  });
});

describe('reconcileForm', () => {
  it('ignores a snapshot that matches the baseline (no server change since seeding)', () => {
    const baseline = form();
    // Even if the operator has edited the boxes, an unchanged server snapshot is a no-op.
    const action = reconcileForm(form(), form({ openerSquat: '205' }), baseline);
    expect(action).toEqual({ type: 'ignore' });
  });

  it('rebases when the incoming snapshot matches what is in the boxes (own save coming back)', () => {
    const baseline = form();
    const saved = form({ openerSquat: '205' });
    // The operator changed the opener, saved, and the same values arrive back from the server.
    const action = reconcileForm(saved, saved, baseline);
    expect(action).toEqual({ type: 'rebase', snapshot: saved });
  });

  it('applies an external change when the card has no unsaved edits', () => {
    const baseline = form();
    const incoming = form({ openerSquat: '210' });
    // current === baseline → nothing unsaved here → adopt the run-screen / weigh-in change.
    const action = reconcileForm(incoming, baseline, baseline);
    expect(action).toEqual({ type: 'apply', snapshot: incoming });
  });

  it('flags an external change that differs from the operator unsaved edits', () => {
    const baseline = form();
    const edited = form({ openerBench: '125' });
    const incoming = form({ openerSquat: '210' });
    // Unsaved edits here AND a different change landed elsewhere → keep edits, surface the incoming one.
    const action = reconcileForm(incoming, edited, baseline);
    expect(action).toEqual({ type: 'flag', snapshot: incoming });
  });
});
