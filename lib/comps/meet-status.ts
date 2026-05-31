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

// A competition is publicly visible — anon can read its data, and the public/overlay/display surfaces
// show it — once it is published, active or completed (i.e. anything past draft). This mirrors the
// database's is_comp_public() RLS predicate, so the app and the row-level gate agree on what "public"
// means. Single-sourced here so every public-facing page (results, public warm-up board, overlays)
// applies the same rule and a status change only has to be made in one place.
export function isCompPubliclyVisible(status: CompStatus): boolean {
  return status === 'published' || status === 'active' || status === 'completed';
}
