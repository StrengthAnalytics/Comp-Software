import { z } from 'zod';
import { BENCH_SPOTTINGS, SQUAT_RACK_SETTINGS, type BenchSpotting, type SquatRackSetting } from '@/lib/constants';
import type { Database } from '@/types/database.types';

type LiftType = Database['public']['Enums']['lift_type'];
type AttemptResult = Database['public']['Enums']['attempt_result'];

// A single lift's rack edit, applied optimistically to the entry and sent to updateEntryRackSettingsAction.
export type RackPatch =
  | { lift: 'squat'; rackHeightSquat: number | null; squatRackSetting: SquatRackSetting | null }
  | {
      lift: 'bench';
      rackHeightBench: number | null;
      benchSafetyHeight: number | null;
      benchSpotting: BenchSpotting | null;
    };

// One mutation held in the run-screen offline outbox. The optimistic local state already reflects it;
// this is the instruction to persist it. Keyed (by the caller) by cell+field so a re-edit of the same
// thing supersedes the older queued value (last-write-wins). All three are addressable by natural key
// (no server id), so an edit made offline — including a result on an attempt created offline — survives
// to be replayed when the connection returns.
export type PendingOp =
  | { kind: 'weight'; entryId: string; lift: LiftType; attemptNumber: number; weightKg: number }
  | { kind: 'result'; entryId: string; lift: LiftType; attemptNumber: number; result: AttemptResult; decidedAt: string | null }
  | { kind: 'rack'; entryId: string; patch: RackPatch };

// localStorage is an untrusted boundary (a stale build, a tampered value, a corrupt write): validate
// what we read so a bad entry is dropped rather than crashing the board on hydration.
const liftSchema = z.enum(['squat', 'bench', 'deadlift']);
const resultSchema = z.enum(['pending', 'good_lift', 'no_lift', 'not_taken', 'withdrawn']);
const rackPatchSchema = z.discriminatedUnion('lift', [
  z.object({
    lift: z.literal('squat'),
    rackHeightSquat: z.number().nullable(),
    squatRackSetting: z.enum([...SQUAT_RACK_SETTINGS]).nullable(),
  }),
  z.object({
    lift: z.literal('bench'),
    rackHeightBench: z.number().nullable(),
    benchSafetyHeight: z.number().nullable(),
    benchSpotting: z.enum([...BENCH_SPOTTINGS]).nullable(),
  }),
]);
const pendingOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('weight'), entryId: z.string(), lift: liftSchema, attemptNumber: z.number().int(), weightKg: z.number() }),
  z.object({
    kind: z.literal('result'),
    entryId: z.string(),
    lift: liftSchema,
    attemptNumber: z.number().int(),
    result: resultSchema,
    decidedAt: z.string().nullable(),
  }),
  z.object({ kind: z.literal('rack'), entryId: z.string(), patch: rackPatchSchema }),
]);
// One stored Map entry: [key, op]. The whole outbox is persisted as an array of these so the Map's
// insertion order — which the flush relies on — round-trips.
const storedEntrySchema = z.tuple([z.string(), pendingOpSchema]);

const STORAGE_PREFIX = 'scoresheet:outbox:';

// Per-competition key so two comps open in two tabs never share an outbox.
export function outboxStorageKey(competitionId: string): string {
  return `${STORAGE_PREFIX}${competitionId}`;
}

// localStorage access can throw (private-mode quirks) or be absent (SSR); fall back to no persistence.
function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Restores the persisted outbox for a competition. Each stored entry is validated independently and
// only the valid ones are kept, so a single malformed op — most realistically an op shape from an
// older build after a schema change — can't discard the whole queue of un-synced edits. Unparseable or
// non-array data is dropped wholesale; a partially-bad array is cleaned and rewritten.
export function loadOutbox(competitionId: string): Map<string, PendingOp> {
  const storage = getStorage();
  if (!storage) {
    return new Map();
  }
  const key = outboxStorageKey(competitionId);
  const raw = storage.getItem(key);
  if (!raw) {
    return new Map();
  }
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return new Map();
  }
  if (!Array.isArray(items)) {
    storage.removeItem(key);
    return new Map();
  }
  const valid: [string, PendingOp][] = [];
  let droppedAny = false;
  for (const item of items) {
    const entry = storedEntrySchema.safeParse(item);
    if (entry.success) {
      valid.push(entry.data);
    } else {
      droppedAny = true;
    }
  }
  const ops = new Map(valid);
  // Rewrite the cleaned set (removing the key if nothing valid remained) so a bad entry isn't re-read.
  if (droppedAny) {
    saveOutbox(competitionId, ops);
  }
  return ops;
}

// Persists the outbox, removing the key entirely once it is empty so a synced session leaves nothing
// behind. Best-effort: a quota/serialization failure is swallowed (the in-memory outbox still works).
export function saveOutbox(competitionId: string, ops: Map<string, PendingOp>): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const key = outboxStorageKey(competitionId);
  if (ops.size === 0) {
    storage.removeItem(key);
    return;
  }
  try {
    storage.setItem(key, JSON.stringify([...ops.entries()]));
  } catch {
    // Best effort only.
  }
}
