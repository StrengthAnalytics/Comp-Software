'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { LIFTS_FOR_EVENT } from '@/lib/constants';
import { parseBulkImport } from '@/lib/entries/bulk-import';
import { formatLifterName } from '@/lib/lifters/name';
import {
  createEntrySchema,
  entryUpdateSchema,
  lifterInputSchema,
  weighInSchema,
  type EntryUpdateInput,
  type WeighInInput,
} from '@/types/entry';
import { assignFlightSchema } from '@/types/flight';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

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

// Registers a lifter for a comp. Class, division, lot and weigh-in details are added afterwards
// via updateEntryAction, so this only needs the comp and lifter link.
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
    const { error } = await supabase.from('entries').insert({
      competition_id: parsed.data.competitionId,
      lifter_id: parsed.data.lifterId,
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
      .select('competition_id, lifter_id')
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
      .select('competition_id')
      .eq('id', parsed.data.id)
      .maybeSingle();

    if (entryError) {
      Sentry.captureException(entryError);
      return fail('Could not save the weigh-in. Please try again.');
    }
    if (!entry || entry.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that entry.');
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
      .select('id, event_type')
      .eq('id', parsedInput.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not import. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
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

      let divisionId: string | null = null;
      if (row.divisionName) {
        const division = divisionByName.get(row.divisionName.toLowerCase());
        if (division) {
          divisionId = division.id;
        } else {
          warnings.push(`Division "${row.divisionName}" not found — left blank.`);
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

      const { error: entryError } = await supabase.from('entries').insert({
        competition_id: comp.id,
        lifter_id: lifterId,
        weight_class_id: weightClassId,
        division_id: divisionId,
        lot_number: row.lot,
        bodyweight_kg: row.bodyweight,
        opener_squat_kg: row.openerSquat,
        opener_bench_kg: row.openerBench,
        opener_deadlift_kg: row.openerDeadlift,
      });
      if (entryError) {
        if (isUniqueViolation(entryError)) {
          record(row.line, name, 'error', 'Lot number already taken in this competition.');
        } else {
          Sentry.captureException(entryError);
          record(row.line, name, 'error', 'Could not register the lifter. Please try again.');
        }
        continue;
      }

      registeredLifterIds.add(lifterId);
      record(row.line, name, status, warnings.length > 0 ? warnings.join(' ') : null);
    }

    return ok(summary);
  });
}
