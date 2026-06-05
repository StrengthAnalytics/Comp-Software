'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { canRecordMeetResults } from '@/lib/comps/meet-status';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { matchDivisionByName, planAgeCategoryRecalc, resolveAgeCategory } from '@/lib/divisions/age-category';
import { parseBulkImport } from '@/lib/entries/bulk-import';
import { formatLifterName } from '@/lib/lifters/name';
import {
  assignWeightClassSchema,
  createEntrySchema,
  entryUpdateSchema,
  lifterInputSchema,
  rackHeightsSchema,
  rackSettingsSchema,
  weighInSchema,
  type EntryUpdateInput,
  type RackHeightsInput,
  type RackSettingsInput,
  type WeighInInput,
} from '@/types/entry';
import { assignFlightSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;
type LiftType = Database['public']['Enums']['lift_type'];
type EventType = Database['public']['Enums']['event_type'];
type CompStatus = Database['public']['Enums']['comp_status'];

// Mirrors a lifter's openers into their first attempt rows (attempt #1 = the opener). Attempts #2
// and #3 are created later when declared at the platform. Idempotent: re-saving an entry re-syncs
// attempt #1 to the current opener. A platform-side correction to attempt #1 writes back to the
// opener column (see setAttemptWeightAction), so the two stay in step and this re-sync never reverts
// a correction. Only contested lifts are seeded — for a team member, just their assigned lift. A
// failure here is logged but does not fail the caller, whose entry write has already saved. Called
// from both the weigh-in path and the entries-screen update, so an opener edited on either reaches the
// run screen, which reads openers from the attempts it subscribes to rather than the entry row.
//
// Attempt #1 is a meet-time row, so it is never seeded (or re-stamped) for a completed comp, whose
// final record is locked — the same gate the attempt write actions use. The entry write itself stays
// allowed at any status (setup edits, ARCHITECTURE.md §7), so the caller still saves; only this mirror
// is skipped. Gating here keeps both call paths consistent without each repeating the check.
async function seedOpenerAttempts(
  supabase: Client,
  input: { competitionId: string; id: string; openerSquatKg: number | null; openerBenchKg: number | null; openerDeadliftKg: number | null },
  comp: { event_type: EventType; is_team_competition: boolean; status: CompStatus },
  teamLift: LiftType | null,
): Promise<void> {
  if (!canRecordMeetResults(comp.status)) {
    return;
  }

  const openerByLift: Record<LiftType, number | null> = {
    squat: input.openerSquatKg,
    bench: input.openerBenchKg,
    deadlift: input.openerDeadliftKg,
  };

  const contested: LiftType[] =
    comp.is_team_competition && teamLift
      ? [teamLift]
      : (['squat', 'bench', 'deadlift'] as LiftType[]).filter((lift) => LIFTS_FOR_EVENT[comp.event_type][lift]);

  const rows = contested
    .filter((lift) => openerByLift[lift] !== null)
    .map((lift) => ({
      competition_id: input.competitionId,
      entry_id: input.id,
      lift,
      attempt_number: 1,
      weight_kg: openerByLift[lift],
      declared_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('attempts').upsert(rows, { onConflict: 'entry_id,lift,attempt_number' });
  if (error) {
    Sentry.captureException(error);
  }
}

// Cross-entity checks RLS cannot make: a chosen weight class / division must belong to this comp,
// and the weight class gender must match the lifter's. Returns an error result, or null when valid.
async function validateReferences(
  supabase: Client,
  comp: string,
  lifterGender: string,
  input: EntryUpdateInput,
): Promise<ActionResult<never> | null> {
  if (input.weightClassId) {
    const { data: weightClass, error } = await supabase
      .from('weight_classes')
      .select('gender, competition_id')
      .eq('id', input.weightClassId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the entry. Please try again.');
    }
    if (!weightClass || weightClass.competition_id !== comp) {
      return fail('Please fix the highlighted fields.', {
        weightClassId: ['Choose a weight class from this competition.'],
      });
    }
    if (weightClass.gender !== lifterGender) {
      return fail('Please fix the highlighted fields.', {
        weightClassId: ["Weight class gender must match the lifter's."],
      });
    }
  }

  if (input.divisionId) {
    const { data: division, error } = await supabase
      .from('divisions')
      .select('competition_id')
      .eq('id', input.divisionId)
      .maybeSingle();

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the entry. Please try again.');
    }
    if (!division || division.competition_id !== comp) {
      return fail('Please fix the highlighted fields.', {
        divisionId: ['Choose a division from this competition.'],
      });
    }
  }

  return null;
}

function mapEntryWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('Please fix the highlighted fields.', {
      lotNumber: ['That lot number is already taken in this competition.'],
    });
  }
  return fail('Could not save the entry. Please try again.');
}

// Registers a lifter for a comp. Weight class, lot and weigh-in details are added afterwards via
// updateEntryAction; the age division is assigned here from (competition year − birth year), so the
// comp must have a date and the lifter a date of birth. The entries screen also gates on both, so
// these checks are backstops. The operator can still change the division afterwards.
export async function createEntryAction(input: {
  competitionId: string;
  lifterId: string;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('createEntry', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = createEntrySchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not register the lifter. Please try again.');
    }

    const supabase = await createClient();

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('starts_on')
      .eq('id', parsed.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not register the lifter. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (!comp.starts_on) {
      return fail('Set a competition date before adding lifters — the age category is worked out from it.');
    }

    const { data: lifter, error: lifterError } = await supabase
      .from('lifters')
      .select('date_of_birth')
      .eq('id', parsed.data.lifterId)
      .maybeSingle();
    if (lifterError) {
      Sentry.captureException(lifterError);
      return fail('Could not register the lifter. Please try again.');
    }
    if (!lifter) {
      return fail('Could not find that lifter.');
    }
    if (!lifter.date_of_birth) {
      return fail("Add the lifter's date of birth before registering them — the age category needs it.");
    }

    // Auto-select the age division from the comp year and birth year, resolved to one of this comp's
    // division rows by name. A comp missing that division leaves it null for the operator to fill in.
    const categoryName = resolveAgeCategory(comp.starts_on, lifter.date_of_birth);
    let divisionId: string | null = null;
    if (categoryName) {
      const { data: divisions, error: divisionsError } = await supabase
        .from('divisions')
        .select('id, name')
        .eq('competition_id', parsed.data.competitionId);
      if (divisionsError) {
        Sentry.captureException(divisionsError);
        return fail('Could not register the lifter. Please try again.');
      }
      divisionId = matchDivisionByName(divisions ?? [], categoryName)?.id ?? null;
    }

    const { error } = await supabase.from('entries').insert({
      competition_id: parsed.data.competitionId,
      lifter_id: parsed.data.lifterId,
      division_id: divisionId,
    });

    if (error) {
      if (isUniqueViolation(error)) {
        return fail('This lifter is already registered for this competition.');
      }
      Sentry.captureException(error);
      return fail('Could not register the lifter. Please try again.');
    }

    return ok();
  });
}

// Cap on entry ids per bulk update, so a large single-division field stays well under the PostgREST
// query-string length limit (each id is a 36-char UUID). Mirrors the duplicate-comp insert chunking.
const ENTRY_UPDATE_CHUNK_SIZE = 200;

export type AgeCategoryRecalcSummary = {
  updated: number;
  unchanged: number;
  noDateOfBirth: number;
  noMatchingDivision: number;
};

// Re-derives every entry's age division from the comp date and the lifter's current date of birth,
// for when a date of birth is corrected after registration (the division is otherwise only assigned
// at registration time). Sets each lifter to their age-category division by name; an entry with no
// date of birth, or whose computed category isn't a division in this comp, is reported and left as-is
// (never blanked). This overrides any manual division change, which the operator confirms in the UI.
// A setup-side write (no attempts/results touched), so it is not status-gated.
export async function recalculateAgeCategoriesAction(input: {
  competitionId: string;
}): Promise<ActionResult<AgeCategoryRecalcSummary>> {
  return Sentry.withServerActionInstrumentation('recalculateAgeCategories', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not recalculate age categories. Please try again.');
    }

    const supabase = await createClient();

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('starts_on, status')
      .eq('id', parsed.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not recalculate age categories. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (!comp.starts_on) {
      return fail('Set a competition date before recalculating age categories.');
    }
    // A bulk re-home of divisions changes placement groupings, so it is blocked once a comp is
    // completed to protect the final record — matching deleteAllEntriesAction. Single-entry division
    // edits stay allowed at any status (a setup write, ARCHITECTURE.md §7).
    if (comp.status === 'completed') {
      return fail('This competition is completed, so its age categories cannot be recalculated in bulk.');
    }

    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, lifter_id, division_id')
      .eq('competition_id', parsed.data.competitionId);
    if (entriesError) {
      Sentry.captureException(entriesError);
      return fail('Could not recalculate age categories. Please try again.');
    }

    const entryRows = entries ?? [];
    if (entryRows.length === 0) {
      return ok({ updated: 0, unchanged: 0, noDateOfBirth: 0, noMatchingDivision: 0 });
    }

    const lifterIds = [...new Set(entryRows.map((entry) => entry.lifter_id))];
    const [{ data: lifters, error: liftersError }, { data: divisions, error: divisionsError }] = await Promise.all([
      supabase.from('lifters').select('id, date_of_birth').in('id', lifterIds),
      supabase.from('divisions').select('id, name').eq('competition_id', parsed.data.competitionId),
    ]);
    if (liftersError) {
      Sentry.captureException(liftersError);
      return fail('Could not recalculate age categories. Please try again.');
    }
    if (divisionsError) {
      Sentry.captureException(divisionsError);
      return fail('Could not recalculate age categories. Please try again.');
    }

    const dobByLifter = new Map((lifters ?? []).map((lifter) => [lifter.id, lifter.date_of_birth]));
    const plan = planAgeCategoryRecalc(
      comp.starts_on,
      entryRows.map((entry) => ({
        id: entry.id,
        dateOfBirth: dobByLifter.get(entry.lifter_id) ?? null,
        divisionId: entry.division_id,
      })),
      divisions ?? [],
    );

    // Group updates by target division: a few hundred entries become at most one request per division
    // instead of one per lifter. A re-run is idempotent, so a mid-way failure is safe to retry.
    const entryIdsByDivision = new Map<string, string[]>();
    for (const update of plan.updates) {
      const list = entryIdsByDivision.get(update.divisionId) ?? [];
      list.push(update.entryId);
      entryIdsByDivision.set(update.divisionId, list);
    }

    // Chunk each division's ids so a large field (e.g. a hundred-plus Open lifters) can't blow the
    // PostgREST filter past the URL length limit — the same guard the duplicate-comp path applies.
    for (const [divisionId, entryIds] of entryIdsByDivision) {
      for (let index = 0; index < entryIds.length; index += ENTRY_UPDATE_CHUNK_SIZE) {
        const chunk = entryIds.slice(index, index + ENTRY_UPDATE_CHUNK_SIZE);
        const { error } = await supabase.from('entries').update({ division_id: divisionId }).in('id', chunk);
        if (error) {
          Sentry.captureException(error);
          return fail('Could not recalculate age categories. Please try again.');
        }
      }
    }

    return ok({
      updated: plan.updated,
      unchanged: plan.unchanged,
      noDateOfBirth: plan.noDateOfBirth,
      noMatchingDivision: plan.noMatchingDivision,
    });
  });
}

export async function updateEntryAction(input: EntryUpdateInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateEntry', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = entryUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id, lifter_id, team_lift')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not save the entry. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    const { data: lifter, error: lifterError } = await supabase
      .from('lifters')
      .select('gender')
      .eq('id', entry.lifter_id)
      .maybeSingle();

    if (lifterError) {
      Sentry.captureException(lifterError);
      return fail('Could not save the entry. Please try again.');
    }
    if (!lifter) {
      return fail('Could not find that entry.');
    }

    const invalid = await validateReferences(supabase, entry.competition_id, lifter.gender, parsed.data);
    if (invalid) return invalid;

    const { error } = await supabase
      .from('entries')
      .update({
        weight_class_id: parsed.data.weightClassId,
        division_id: parsed.data.divisionId,
        lot_number: parsed.data.lotNumber,
        bodyweight_kg: parsed.data.bodyweightKg,
        opener_squat_kg: parsed.data.openerSquatKg,
        opener_bench_kg: parsed.data.openerBenchKg,
        opener_deadlift_kg: parsed.data.openerDeadliftKg,
        rack_height_squat: parsed.data.rackHeightSquat,
        squat_rack_setting: parsed.data.squatRackSetting,
        rack_height_bench: parsed.data.rackHeightBench,
        bench_safety_height: parsed.data.benchSafetyHeight,
        bench_spotting: parsed.data.benchSpotting,
        status: parsed.data.status,
      })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return mapEntryWriteError(error);
    }

    // Mirror the openers into attempt #1, the same as the weigh-in path: the run screen reads openers
    // from the attempts it subscribes to, so an opener edited here would otherwise never reach it.
    // Only worth the comp lookup + upsert when an opener is actually set — a lot/class/division-only
    // edit has nothing to seed (seedOpenerAttempts only upserts non-null contested openers). Best-effort
    // — the entry has already saved; a seeding (or comp lookup) failure is logged, not surfaced.
    const hasOpener =
      parsed.data.openerSquatKg !== null ||
      parsed.data.openerBenchKg !== null ||
      parsed.data.openerDeadliftKg !== null;
    if (hasOpener) {
      const { data: comp, error: compError } = await supabase
        .from('competitions')
        .select('event_type, is_team_competition, status')
        .eq('id', entry.competition_id)
        .maybeSingle();
      if (compError) {
        Sentry.captureException(compError);
      } else if (comp) {
        await seedOpenerAttempts(supabase, parsed.data, comp, entry.team_lift);
      }
    }

    return ok();
  });
}

// Records a weigh-in. Kept separate from updateEntryAction because the weigh-in screen owns only the
// fields captured at the scale; touching the weight class / division / lot here would risk clearing
// them. Not gated on comp status, matching the other setup writes.
export async function weighInAction(input: WeighInInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('weighIn', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = weighInSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    // A lifter can only be marked weighed-in once their bodyweight is recorded; the rest of the card
    // (openers, rack details) can follow. The UI also gates this, so this is a backstop.
    if (parsed.data.status === 'weighed_in' && parsed.data.bodyweightKg === null) {
      return fail('Please fix the highlighted fields.', {
        bodyweightKg: ['Record a bodyweight before marking the lifter weighed in.'],
      });
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id, team_lift')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not save the weigh-in. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('event_type, is_team_competition, status')
      .eq('id', entry.competition_id)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not save the weigh-in. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }

    const { error } = await supabase
      .from('entries')
      .update({
        bodyweight_kg: parsed.data.bodyweightKg,
        opener_squat_kg: parsed.data.openerSquatKg,
        opener_bench_kg: parsed.data.openerBenchKg,
        opener_deadlift_kg: parsed.data.openerDeadliftKg,
        rack_height_squat: parsed.data.rackHeightSquat,
        squat_rack_setting: parsed.data.squatRackSetting,
        rack_height_bench: parsed.data.rackHeightBench,
        bench_safety_height: parsed.data.benchSafetyHeight,
        bench_spotting: parsed.data.benchSpotting,
        status: parsed.data.status,
      })
      .eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the weigh-in. Please try again.');
    }

    // Mirror the openers into attempt #1 once the entry has saved. Best-effort: a seeding failure is
    // logged inside the helper and does not fail the weigh-in.
    await seedOpenerAttempts(supabase, parsed.data, comp, entry.team_lift);

    return ok();
  });
}

// Reassigns an entry's weight class (or clears it when weightClassId is null). The weigh-in screen
// fires this when an operator moves a lifter up or down a class after recording their bodyweight.
// Verifies the class belongs to the comp and matches the lifter's gender — checks RLS cannot make.
export async function assignEntryWeightClassAction(input: {
  entryId: string;
  competitionId: string;
  weightClassId: string | null;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('assignEntryWeightClass', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = assignWeightClassSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not change the weight class. Please try again.');
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id, lifter_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not change the weight class. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    if (parsed.data.weightClassId) {
      const { data: lifter, error: lifterError } = await supabase
        .from('lifters')
        .select('gender')
        .eq('id', entry.lifter_id)
        .maybeSingle();
      if (lifterError) {
        Sentry.captureException(lifterError);
        return fail('Could not change the weight class. Please try again.');
      }
      if (!lifter) {
        return fail('Could not find that entry.');
      }

      const { data: weightClass, error: classError } = await supabase
        .from('weight_classes')
        .select('gender, competition_id')
        .eq('id', parsed.data.weightClassId)
        .maybeSingle();
      if (classError) {
        Sentry.captureException(classError);
        return fail('Could not change the weight class. Please try again.');
      }
      if (!weightClass || weightClass.competition_id !== parsed.data.competitionId) {
        return fail('Choose a weight class from this competition.');
      }
      if (weightClass.gender !== lifter.gender) {
        return fail("Weight class gender must match the lifter's.");
      }
    }

    const { error } = await supabase
      .from('entries')
      .update({ weight_class_id: parsed.data.weightClassId })
      .eq('id', parsed.data.entryId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not change the weight class. Please try again.');
    }

    return ok();
  });
}

// Updates one lift's rack settings on an entry (squat: rack height + setting; bench: rack height +
// safety height + spotting). The run screen fires this so the head table can correct rack details
// live without leaving the scoresheet. Narrow by design — like assignEntryWeightClassAction — so it
// writes only the chosen lift's rack columns and cannot clobber weigh-in or registration data. Not
// gated on comp status: rack settings are setup-side data, matching the other setup writes
// (ARCHITECTURE.md §7).
export async function updateEntryRackSettingsAction(input: RackSettingsInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateEntryRackSettings', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rackSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not save the rack settings. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    const update =
      parsed.data.lift === 'squat'
        ? { rack_height_squat: parsed.data.rackHeightSquat, squat_rack_setting: parsed.data.squatRackSetting }
        : {
            rack_height_bench: parsed.data.rackHeightBench,
            bench_safety_height: parsed.data.benchSafetyHeight,
            bench_spotting: parsed.data.benchSpotting,
          };

    const { error } = await supabase.from('entries').update(update).eq('id', parsed.data.entryId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the rack settings. Please try again.');
    }

    return ok();
  });
}

// Records a lifter's rack heights from the dedicated rack-heights screen, and flips the `racks_set`
// completion marker. Writes only the five squat/bench rack columns plus racks_set — narrow by design,
// like weighInAction, so the warm-up-room screen can't touch the weight class, division, lot or
// weigh-in data. Not gated on comp status: rack settings are setup-side data (ARCHITECTURE.md §7).
export async function updateRackHeightsAction(input: RackHeightsInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateRackHeights', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rackHeightsSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not save the rack heights. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    const { error } = await supabase
      .from('entries')
      .update({
        rack_height_squat: parsed.data.rackHeightSquat,
        squat_rack_setting: parsed.data.squatRackSetting,
        rack_height_bench: parsed.data.rackHeightBench,
        bench_safety_height: parsed.data.benchSafetyHeight,
        bench_spotting: parsed.data.benchSpotting,
        racks_set: parsed.data.racksSet,
      })
      .eq('id', parsed.data.entryId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the rack heights. Please try again.');
    }

    return ok();
  });
}

// Assigns an entry to a flight, or back to Unassigned when flightId is null. Kept separate from
// updateEntryAction because the flights screen owns flight assignment (the entries screen does not),
// and the board fires this on every drag-free "move" with optimistic local state.
export async function assignEntryFlightAction(input: {
  entryId: string;
  competitionId: string;
  flightId: string | null;
}): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('assignEntryFlight', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = assignFlightSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not move the lifter. Please try again.');
    }

    const supabase = await createClient();

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('competition_id')
      .eq('id', parsed.data.entryId)
      .maybeSingle();
    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not move the lifter. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
    }

    // RLS cannot check that the target flight belongs to this comp; verify before assigning.
    if (parsed.data.flightId) {
      const { data: flight, error: flightError } = await supabase
        .from('flights')
        .select('competition_id')
        .eq('id', parsed.data.flightId)
        .maybeSingle();
      if (flightError) {
        Sentry.captureException(flightError);
        return fail('Could not move the lifter. Please try again.');
      }
      if (!flight || flight.competition_id !== parsed.data.competitionId) {
        return fail('Choose a flight from this competition.');
      }
    }

    const { error } = await supabase
      .from('entries')
      .update({ flight_id: parsed.data.flightId })
      .eq('id', parsed.data.entryId);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not move the lifter. Please try again.');
    }

    return ok();
  });
}

export async function deleteEntryAction(input: { id: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteEntry', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the entry. Please try again.');
    }

    const supabase = await createClient();
    const { error } = await supabase.from('entries').delete().eq('id', parsed.data.id);

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the entry. Please try again.');
    }

    return ok();
  });
}

// Removes every entrant from a competition at once. Attempts and referee decisions cascade away with
// the entries; the persistent lifter (person) records are kept — only this comp's registrations go.
// Gated behind a type-to-confirm step in the UI. Returns how many entries were removed.
export async function deleteAllEntriesAction(input: {
  competitionId: string;
}): Promise<ActionResult<{ deleted: number }>> {
  return Sentry.withServerActionInstrumentation('deleteAllEntries', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the entrants. Please try again.');
    }

    const supabase = await createClient();

    // Bulk deletion cascades to attempts and referee decisions, so it is blocked once a comp is
    // completed to protect the final record. (Individual setup edits stay allowed at any status.)
    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('status')
      .eq('id', parsed.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not delete the entrants. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (comp.status === 'completed') {
      return fail('This competition is completed, so its entrants cannot be deleted in bulk.');
    }

    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('competition_id', parsed.data.competitionId)
      .select('id');

    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the entrants. Please try again.');
    }

    return ok({ deleted: (data ?? []).length });
  });
}

export type BulkImportOutcome = {
  line: number;
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string | null;
};

export type BulkImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  outcomes: BulkImportOutcome[];
};

const MAX_IMPORT_CHARS = 200_000;

// Bulk registration from pasted spreadsheet text. Matches existing lifters by surname + first name
// (case-insensitive), overwriting their details and reusing the record; creates new lifters
// otherwise; skips anyone already registered in this comp. Division and weight class are resolved
// by name — an unmatched name is a warning, not a failure, so the lifter still imports.
export async function bulkImportEntriesAction(input: {
  competitionId: string;
  text: string;
}): Promise<ActionResult<BulkImportSummary>> {
  return Sentry.withServerActionInstrumentation('bulkImportEntries', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsedInput = z
      .object({ competitionId: z.uuid(), text: z.string().min(1).max(MAX_IMPORT_CHARS) })
      .safeParse(input);
    if (!parsedInput.success) {
      return fail('Nothing to import. Paste your rows first.');
    }

    const supabase = await createClient();

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('id, event_type, is_team_competition, status, starts_on')
      .eq('id', parsedInput.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not import. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (!comp.starts_on) {
      return fail('Set a competition date before importing lifters — the age category is worked out from it.');
    }

    const rows = parseBulkImport(parsedInput.data.text, LIFTS_FOR_EVENT[comp.event_type]);
    if (rows.length === 0) {
      return fail('No rows found. Copy the headers, fill in your lifters, and paste the rows back.');
    }

    const [{ data: divisions }, { data: weightClasses }, { data: existingEntries }] = await Promise.all([
      supabase.from('divisions').select('id, name').eq('competition_id', comp.id),
      supabase.from('weight_classes').select('id, name, gender').eq('competition_id', comp.id),
      supabase.from('entries').select('lifter_id').eq('competition_id', comp.id),
    ]);

    const divisionByName = new Map((divisions ?? []).map((division) => [division.name.trim().toLowerCase(), division]));
    const weightClassByName = new Map(
      (weightClasses ?? []).map((weightClass) => [weightClass.name.trim().toLowerCase(), weightClass]),
    );
    const registeredLifterIds = new Set((existingEntries ?? []).map((entry) => entry.lifter_id));
    const lifterIdByName = new Map<string, string>();

    const summary: BulkImportSummary = { created: 0, updated: 0, skipped: 0, errors: 0, outcomes: [] };
    const record = (line: number, name: string, status: BulkImportOutcome['status'], message: string | null) => {
      summary.outcomes.push({ line, name, status, message });
      summary[status === 'error' ? 'errors' : status]++;
    };

    for (const row of rows) {
      const name = formatLifterName(row.surname, row.firstName);

      if (row.errors.length > 0) {
        record(row.line, name, 'error', row.errors.join(' '));
        continue;
      }

      const lifterFields = lifterInputSchema.safeParse({
        first_name: row.firstName,
        surname: row.surname,
        gender: row.gender,
        date_of_birth: row.dateOfBirth,
        ipf_member_id: row.membership,
        club: row.club,
        country: row.country,
      });
      if (!lifterFields.success) {
        const fieldError = Object.values(toFieldErrors(lifterFields.error))[0];
        record(row.line, name, 'error', fieldError?.[0] ?? 'Invalid lifter details.');
        continue;
      }

      const warnings: string[] = [];

      // A matched division named in the sheet wins. Otherwise — no name given, or a name the comp
      // doesn't have — fall back to the age category derived from the comp year and the lifter's birth
      // year (the row is guaranteed a date of birth; the parser errors any row without one first), so a
      // mistyped Division still gets the right category rather than being left blank.
      let divisionId: string | null = null;
      if (row.divisionName) {
        const named = divisionByName.get(row.divisionName.toLowerCase());
        if (named) {
          divisionId = named.id;
        } else {
          warnings.push(`Division "${row.divisionName}" not found — using the age category instead.`);
        }
      }
      if (divisionId === null) {
        const categoryName = resolveAgeCategory(comp.starts_on, row.dateOfBirth);
        if (categoryName) {
          const derived = divisionByName.get(categoryName.toLowerCase());
          if (derived) {
            divisionId = derived.id;
          } else {
            warnings.push(`Age category "${categoryName}" has no matching division — left blank.`);
          }
        }
      }

      let weightClassId: string | null = null;
      if (row.weightClassName) {
        const weightClass = weightClassByName.get(row.weightClassName.toLowerCase());
        if (weightClass && weightClass.gender === row.gender) {
          weightClassId = weightClass.id;
        } else if (weightClass) {
          warnings.push(`Weight class "${row.weightClassName}" is not for this lifter's gender — left blank.`);
        } else {
          warnings.push(`Weight class "${row.weightClassName}" not found — left blank.`);
        }
      }

      const nameKey = `${row.surname.toLowerCase()}|${row.firstName.toLowerCase()}`;

      // Resolve the lifter: from this run's cache, then the database, otherwise create.
      let lifterId = lifterIdByName.get(nameKey) ?? null;
      let status: 'created' | 'updated' = 'updated';

      if (lifterId === null) {
        const { data: found, error: lookupError } = await supabase
          .from('lifters')
          .select('id')
          .ilike('surname', row.surname)
          .ilike('first_name', row.firstName)
          .limit(1)
          .maybeSingle();
        if (lookupError) {
          Sentry.captureException(lookupError);
          record(row.line, name, 'error', 'Could not look up the lifter. Please try again.');
          continue;
        }

        if (found) {
          if (registeredLifterIds.has(found.id)) {
            lifterIdByName.set(nameKey, found.id);
            record(row.line, name, 'skipped', 'Already registered in this competition.');
            continue;
          }
          const { error: updateError } = await supabase
            .from('lifters')
            .update(lifterFields.data)
            .eq('id', found.id);
          if (updateError) {
            Sentry.captureException(updateError);
            record(row.line, name, 'error', 'Could not update the lifter. Please try again.');
            continue;
          }
          lifterId = found.id;
          status = 'updated';
        } else {
          const { data: created, error: insertError } = await supabase
            .from('lifters')
            .insert(lifterFields.data)
            .select('id')
            .single();
          if (insertError) {
            Sentry.captureException(insertError);
            record(row.line, name, 'error', 'Could not create the lifter. Please try again.');
            continue;
          }
          lifterId = created.id;
          status = 'created';
        }
      } else if (registeredLifterIds.has(lifterId)) {
        record(row.line, name, 'skipped', 'Duplicate of an earlier row in this paste.');
        continue;
      }

      lifterIdByName.set(nameKey, lifterId);

      const { data: created, error: entryError } = await supabase
        .from('entries')
        .insert({
          competition_id: comp.id,
          lifter_id: lifterId,
          weight_class_id: weightClassId,
          division_id: divisionId,
          lot_number: row.lot,
          bodyweight_kg: row.bodyweight,
          opener_squat_kg: row.openerSquat,
          opener_bench_kg: row.openerBench,
          opener_deadlift_kg: row.openerDeadlift,
        })
        .select('id')
        .single();
      if (entryError || !created) {
        if (entryError && isUniqueViolation(entryError)) {
          record(row.line, name, 'error', 'Lot number already taken in this competition.');
        } else {
          Sentry.captureException(entryError);
          record(row.line, name, 'error', 'Could not register the lifter. Please try again.');
        }
        continue;
      }

      // Mirror the imported openers into attempt #1, the same as the weigh-in and entries-screen paths,
      // so an imported lifter shows their opener on the run screen without waiting for a weigh-in save.
      // Best-effort and gated on comp status inside the helper; team assignment isn't known at import,
      // so teamLift is null and every contested lift seeds (a weigh-in later narrows a team member to
      // their assigned lift).
      await seedOpenerAttempts(
        supabase,
        {
          competitionId: comp.id,
          id: created.id,
          openerSquatKg: row.openerSquat,
          openerBenchKg: row.openerBench,
          openerDeadliftKg: row.openerDeadlift,
        },
        comp,
        null,
      );

      registeredLifterIds.add(lifterId);
      record(row.line, name, status, warnings.length > 0 ? warnings.join(' ') : null);
    }

    return ok(summary);
  });
}
