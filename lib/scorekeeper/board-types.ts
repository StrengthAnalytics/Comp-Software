import type { Database } from '@/types/database.types';
import type { Sex } from '@/lib/scoring/ipf-gl';
import type { BenchSpotting, SquatRackSetting } from '@/lib/constants';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// Flat shapes the live-scorekeeping surfaces (run screen, loading-crew display) consume — mapped from
// the database rows by loadBoardData and reconciled by the realtime board-state hook. Kept in a plain
// (non-'use client') module so server loaders can import the types without pulling in client code.
export type NamedOption = { id: string; name: string };
export type BoardPlatform = { id: string; name: string };
export type BoardSession = { id: string; name: string; sortOrder: number; platformId: string | null };
export type BoardFlight = { id: string; sessionId: string; name: string; sortOrder: number };
export type BoardEntry = {
  id: string;
  lifterName: string;
  sex: Sex;
  flightId: string | null;
  lotNumber: number | null;
  teamLift: LiftType | null;
  teamId: string | null;
  teamName: string | null;
  bodyweightKg: number | null;
  weightClassId: string | null;
  weightClassName: string | null;
  ageCategoryId: string | null;
  ageCategoryName: string | null;
  rackHeightSquat: number | null;
  squatRackSetting: SquatRackSetting | null;
  rackHeightBench: number | null;
  benchSafetyHeight: number | null;
  benchSpotting: BenchSpotting | null;
};
export type BoardAttempt = {
  id: string;
  entryId: string;
  lift: LiftType;
  attemptNumber: number;
  weightKg: number | null;
  result: AttemptResult;
  // When the result was set to a good/no lift, anchoring the next attempt's 60-second countdown.
  decidedAt: string | null;
};
