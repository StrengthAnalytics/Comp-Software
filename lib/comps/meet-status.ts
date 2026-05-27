import type { Database } from '@/types/database.types';

type CompStatus = Database['public']['Enums']['comp_status'];

// Meet-time data (attempts, referee decisions, derived results) is locked once a competition is
// completed: the final record must not change. Setup data (comp details, divisions, weight classes,
// registration / weigh-in) stays editable at any status — see ARCHITECTURE.md ADR §7. The
// attempt/result server actions call this before writing.
export function canRecordMeetResults(status: CompStatus): boolean {
  return status !== 'completed';
}

export const MEET_LOCKED_MESSAGE =
  'This competition is completed; attempts and results can no longer be changed.';
