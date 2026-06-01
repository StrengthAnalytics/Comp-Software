import type { BenchSpotting, SquatRackSetting } from '@/lib/constants';
import type { Database } from '@/types/database.types';

type EntryStatus = Database['public']['Enums']['entry_status'];

// The editable fields of an entry card, as their controlled-input (string) representations. Kept as a
// single snapshot so the entries screen can tell three states apart with one structural comparison:
// the operator's unsaved edits, the values last loaded from the server, and a change that arrived from
// another screen (a run-screen opener correction, a weigh-in save) via real-time. Numeric fields are
// the raw input strings (numberToInput), so a snapshot mirrors exactly what sits in the boxes.
export type EntryFormValues = {
  weightClassId: string;
  divisionId: string;
  lotNumber: string;
  bodyweight: string;
  openerSquat: string;
  openerBench: string;
  openerDeadlift: string;
  rackSquat: string;
  squatSetting: SquatRackSetting | '';
  rackBench: string;
  benchSafety: string;
  benchSpotting: BenchSpotting | '';
  status: EntryStatus;
};

// Structural equality over the snapshot. Every field is a primitive string, so a field-by-field compare
// is exact and avoids the key-order fragility of comparing serialised JSON.
export function sameForm(a: EntryFormValues, b: EntryFormValues): boolean {
  return (
    a.weightClassId === b.weightClassId &&
    a.divisionId === b.divisionId &&
    a.lotNumber === b.lotNumber &&
    a.bodyweight === b.bodyweight &&
    a.openerSquat === b.openerSquat &&
    a.openerBench === b.openerBench &&
    a.openerDeadlift === b.openerDeadlift &&
    a.rackSquat === b.rackSquat &&
    a.squatSetting === b.squatSetting &&
    a.rackBench === b.rackBench &&
    a.benchSafety === b.benchSafety &&
    a.benchSpotting === b.benchSpotting &&
    a.status === b.status
  );
}

// What an entry card should do when a fresh server snapshot arrives (re-pulled by router.refresh after a
// real-time entry change). `incoming` is the new server snapshot, `current` is what's in the boxes now,
// and `baseline` is the snapshot the boxes were last seeded from.
//
// - 'ignore': the server hasn't changed since we last seeded — nothing to do (the common case, since
//   router.refresh hands every card a new object even when its row is untouched).
// - 'rebase': the incoming snapshot equals what's in the boxes (our own just-saved edit coming back, or
//   an identical change elsewhere) — adopt it as the new baseline so the card reads clean again.
// - 'apply': the card has no unsaved edits (current === baseline), so adopt the external change into the
//   boxes. This is how a run-screen opener correction or a weigh-in save shows up live.
// - 'flag': the card has unsaved edits AND the external change differs from them — keep the operator's
//   edits and surface the incoming snapshot, so a save can't silently overwrite the other screen's change.
export type FormSyncAction =
  | { type: 'ignore' }
  | { type: 'rebase'; snapshot: EntryFormValues }
  | { type: 'apply'; snapshot: EntryFormValues }
  | { type: 'flag'; snapshot: EntryFormValues };

export function reconcileForm(
  incoming: EntryFormValues,
  current: EntryFormValues,
  baseline: EntryFormValues,
): FormSyncAction {
  if (sameForm(incoming, baseline)) {
    return { type: 'ignore' };
  }
  if (sameForm(incoming, current)) {
    return { type: 'rebase', snapshot: incoming };
  }
  if (sameForm(current, baseline)) {
    return { type: 'apply', snapshot: incoming };
  }
  return { type: 'flag', snapshot: incoming };
}
