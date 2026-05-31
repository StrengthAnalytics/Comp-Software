import { describe, expect, it } from 'vitest';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Sex } from '@/lib/scoring/ipf-gl';
import { applyTeamMemberChange, type StandingMemberSeed } from '@/lib/realtime/use-team-standings';

type EntryRow = Database['public']['Tables']['entries']['Row'];

// applyTeamMemberChange only reads id, team_id, team_lift and bodyweight_kg off the row, so each test
// builds just those fields and asserts the cast covers the rest of the wide entries row it never touches.
function payload(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Partial<EntryRow>,
): RealtimePostgresChangesPayload<EntryRow> {
  const body = eventType === 'DELETE' ? { old: row, new: {} } : { new: row, old: {} };
  // Minimal fixture: the reducer reads only the four columns set above; the cast stands in for the
  // unused remainder of the entries row and Supabase's envelope metadata.
  return { eventType, schema: 'public', table: 'entries', ...body } as RealtimePostgresChangesPayload<EntryRow>;
}

const nameById = new Map<string, string>([['e1', 'Jane Doe']]);
const sexById = new Map<string, Sex>([['e1', 'female']]);

describe('applyTeamMemberChange', () => {
  it('updates bodyweight and team assignment from the entry row, preserving name/sex from load', () => {
    const before = new Map<string, StandingMemberSeed>([
      ['e1', { entryId: 'e1', teamId: 't1', lift: 'squat', lifterName: 'Jane Doe', sex: 'female', bodyweightKg: 0 }],
    ]);
    const after = applyTeamMemberChange(before, payload('UPDATE', { id: 'e1', team_id: 't1', team_lift: 'squat', bodyweight_kg: 71.5 }), nameById, sexById);
    expect(after.get('e1')).toEqual({ entryId: 'e1', teamId: 't1', lift: 'squat', lifterName: 'Jane Doe', sex: 'female', bodyweightKg: 71.5 });
    expect(before.get('e1')?.bodyweightKg).toBe(0); // input map not mutated
  });

  it('seeds name/sex from the load-time maps for a member not yet known', () => {
    const after = applyTeamMemberChange(new Map(), payload('INSERT', { id: 'e1', team_id: 't1', team_lift: 'bench', bodyweight_kg: null }), nameById, sexById);
    expect(after.get('e1')).toEqual({ entryId: 'e1', teamId: 't1', lift: 'bench', lifterName: 'Jane Doe', sex: 'female', bodyweightKg: 0 });
  });

  it('falls back to Unknown lifter / male when no name or sex is known', () => {
    const after = applyTeamMemberChange(new Map(), payload('INSERT', { id: 'e9', team_id: 't1', team_lift: 'deadlift', bodyweight_kg: 90 }), nameById, sexById);
    expect(after.get('e9')).toEqual({ entryId: 'e9', teamId: 't1', lift: 'deadlift', lifterName: 'Unknown lifter', sex: 'male', bodyweightKg: 90 });
  });

  it('reflects a member being unassigned from a team (team columns cleared together)', () => {
    const before = new Map<string, StandingMemberSeed>([
      ['e1', { entryId: 'e1', teamId: 't1', lift: 'squat', lifterName: 'Jane Doe', sex: 'female', bodyweightKg: 71.5 }],
    ]);
    const after = applyTeamMemberChange(before, payload('UPDATE', { id: 'e1', team_id: null, team_lift: null, bodyweight_kg: 71.5 }), nameById, sexById);
    expect(after.get('e1')?.teamId).toBeNull();
    expect(after.get('e1')?.lift).toBeNull();
  });

  it('removes a member on delete', () => {
    const before = new Map<string, StandingMemberSeed>([
      ['e1', { entryId: 'e1', teamId: 't1', lift: 'squat', lifterName: 'Jane Doe', sex: 'female', bodyweightKg: 71.5 }],
    ]);
    const after = applyTeamMemberChange(before, payload('DELETE', { id: 'e1' }), nameById, sexById);
    expect(after.has('e1')).toBe(false);
  });
});
