import { BENCH_SPOTTING_LABELS, SQUAT_RACK_SETTING_LABELS } from '@/lib/constants';
import type { BoardAttempt, BoardEntry } from '@/lib/scorekeeper/board-types';
import type { Database } from '@/types/database.types';

type LiftType = Database['public']['Enums']['lift_type'];

// Only squat and bench have rack settings; deadlift has none. A type guard so a rack cell narrows the
// lift to the two rack disciplines. Shared by the run screen and the warm-up board so both agree.
export function liftHasRack(lift: LiftType): lift is 'squat' | 'bench' {
  return lift === 'squat' || lift === 'bench';
}

// The display string for a lifter's rack settings on one lift: rack height + setting (squat), or
// rack/safety heights + spotting (bench), falling back to an em dash. Deadlift has no racks. Shared by
// the run screen and the warm-up board so the two never format the same settings differently.
export function rackText(entry: BoardEntry, lift: LiftType): string {
  if (lift === 'squat') {
    const parts: string[] = [];
    if (entry.rackHeightSquat !== null) {
      parts.push(String(entry.rackHeightSquat));
    }
    if (entry.squatRackSetting) {
      parts.push(SQUAT_RACK_SETTING_LABELS[entry.squatRackSetting]);
    }
    return parts.length > 0 ? parts.join(' ') : '—';
  }
  if (lift === 'bench') {
    const parts: string[] = [];
    if (entry.rackHeightBench !== null) {
      parts.push(`R${entry.rackHeightBench}`);
    }
    if (entry.benchSafetyHeight !== null) {
      parts.push(`S${entry.benchSafetyHeight}`);
    }
    if (entry.benchSpotting) {
      parts.push(BENCH_SPOTTING_LABELS[entry.benchSpotting]);
    }
    return parts.length > 0 ? parts.join(' ') : '—';
  }
  return '—';
}

// Background tint for an attempt cell: green for a good lift, red for a no lift, neutral for another
// terminal result, amber for the lifter currently on the platform, untinted while simply pending.
// Shared by the run screen and the warm-up board so a cell reads the same colour on every screen.
export function cellTint(attempt: BoardAttempt | undefined, isCurrent: boolean): string {
  if (attempt && attempt.weightKg !== null) {
    if (attempt.result === 'good_lift') {
      return 'bg-green-200';
    }
    if (attempt.result === 'no_lift') {
      return 'bg-red-200';
    }
    if (attempt.result !== 'pending') {
      return 'bg-neutral-200';
    }
  }
  return isCurrent ? 'bg-amber-100' : '';
}
