'use server';

import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { seedCompetitionDefaults } from '@/lib/comps/seed-defaults';
import { competitionInputSchema } from '@/types/competition';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

export type CompetitionFormState = ActionResult;

function readCompetitionForm(formData: FormData) {
  return {
    name: formData.get('name'),
    slug: formData.get('slug'),
    kit_type: formData.get('kit_type'),
    event_type: formData.get('event_type'),
    status: formData.get('status'),
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('ends_on'),
    is_team_competition: formData.get('is_team_competition') === 'on',
  };
}

function mapCompetitionWriteError(error: PostgrestError): ActionResult<never> {
  if (isUniqueViolation(error)) {
    return fail('A competition with that slug already exists.', {
      slug: ['That slug is already taken.'],
    });
  }
  return fail('Could not save the competition. Please try again.');
}

export async function createCompetitionAction(
  _previous: CompetitionFormState | null,
  formData: FormData,
): Promise<CompetitionFormState> {
  return Sentry.withServerActionInstrumentation('createCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = competitionInputSchema.safeParse(readCompetitionForm(formData));
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('competitions')
      .insert(parsed.data)
      .select('id')
      .single();

    if (error) {
      Sentry.captureException(error);
      return mapCompetitionWriteError(error);
    }

    // Every comp is created with the canonical IPF age divisions and weight classes, so it is never
    // empty. Best-effort: the comp already exists, so a seed failure is logged and the operator can
    // re-seed from the edit screen (the seed is idempotent) rather than losing the creation.
    const seedError = await seedCompetitionDefaults(supabase, data.id);
    if (seedError) {
      Sentry.captureException(seedError);
    }

    revalidatePath('/comps');
    redirect(`/comps/${data.id}/edit`);
  });
}

export async function updateCompetitionAction(
  _previous: CompetitionFormState | null,
  formData: FormData,
): Promise<CompetitionFormState> {
  return Sentry.withServerActionInstrumentation('updateCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const id = z.uuid().safeParse(formData.get('id'));
    if (!id.success) {
      return fail('Could not save the competition. Please try again.');
    }

    const parsed = competitionInputSchema.safeParse(readCompetitionForm(formData));
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase.from('competitions').update(parsed.data).eq('id', id.data);

    if (error) {
      Sentry.captureException(error);
      return mapCompetitionWriteError(error);
    }

    revalidatePath('/comps');
    revalidatePath(`/comps/${id.data}/edit`);
    return ok();
  });
}

// Rows are inserted in batches so a large clone (a completed meet can carry thousands of attempts and
// referee decisions) never sends one oversized request.
const INSERT_CHUNK_SIZE = 500;
// Upper bound on slug suffixes tried before giving up, so a pathological collision can't loop forever.
const MAX_SLUG_ATTEMPTS = 50;

// Every duplicate failure surfaces the same friendly message; the specifics go to Sentry.
function duplicateFailed(error: PostgrestError): ActionResult<never> {
  Sentry.captureException(error);
  return fail('Could not duplicate the competition. Please try again.');
}

// A child row referenced a parent that was not copied — an invariant breach (we copy every parent
// first), so it should never happen. Logged and surfaced rather than silently writing a bad reference.
function missingMappingFailed(): ActionResult<never> {
  Sentry.captureMessage('duplicateCompetition: a child row referenced a parent that was not copied.');
  return fail('Could not duplicate the competition. Please try again.');
}

// Maps a source row id to its copy's id. Null source (an unset optional reference) stays null; every
// non-null source id is in the map because each parent table is fully copied before its children.
function mappedId(map: Map<string, string>, sourceId: string | null): string | null {
  return sourceId === null ? null : (map.get(sourceId) ?? null);
}

// Inserts rows in INSERT_CHUNK_SIZE batches. Returns an error ActionResult on the first failed batch,
// or null on success (including the empty case).
async function insertInChunks<R>(
  rows: R[],
  insert: (chunk: R[]) => PromiseLike<{ error: PostgrestError | null }>,
): Promise<ActionResult<never> | null> {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const { error } = await insert(rows.slice(index, index + INSERT_CHUNK_SIZE));
    if (error) {
      return duplicateFailed(error);
    }
  }
  return null;
}

// Inserts the cloned competition with a slug derived from the source ("<slug>-copy", then "-copy-2",
// "-copy-3", … if taken). Always a draft named "<name> (copy)", even when cloning a completed meet —
// the duplicate is a fresh setup, not the original's record.
async function insertDuplicateCompetition(
  supabase: Client,
  newCompId: string,
  source: {
    slug: string;
    name: string;
    federation: string;
    kit_type: Database['public']['Enums']['kit_type'];
    event_type: Database['public']['Enums']['event_type'];
    starts_on: string | null;
    ends_on: string | null;
    is_team_competition: boolean;
  },
): Promise<ActionResult> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 1 ? `${source.slug}-copy` : `${source.slug}-copy-${attempt}`;
    const { error } = await supabase.from('competitions').insert({
      id: newCompId,
      slug,
      name: `${source.name} (copy)`,
      federation: source.federation,
      kit_type: source.kit_type,
      event_type: source.event_type,
      status: 'draft',
      starts_on: source.starts_on,
      ends_on: source.ends_on,
      is_team_competition: source.is_team_competition,
    });
    if (!error) {
      return ok();
    }
    if (!isUniqueViolation(error)) {
      Sentry.captureException(error);
      return fail('Could not duplicate the competition. Please try again.');
    }
    // Slug already taken — try the next suffix.
  }
  return fail('Could not find a free slug for the duplicate. Rename the original and try again.');
}

// Deep-copies every row belonging to a competition into the new one, remapping all internal references
// (session→platform, flight→session, entry→class/division/flight/team, attempt→entry, decision→attempt)
// onto the fresh copies. Lifters are a shared table, so entries keep their original lifter_id. Copies in
// dependency order; new ids are generated up front so each level is remapped before the next is inserted.
// Returns an error ActionResult on the first failure, or null on success.
async function copyCompetitionChildren(
  supabase: Client,
  sourceId: string,
  newCompId: string,
): Promise<ActionResult<never> | null> {
  // divisions
  const divisions = await supabase.from('divisions').select('id, name, sort_order').eq('competition_id', sourceId);
  if (divisions.error) return duplicateFailed(divisions.error);
  const divisionIds = new Map<string, string>();
  const divisionRows = (divisions.data ?? []).map((row) => {
    const id = randomUUID();
    divisionIds.set(row.id, id);
    return { id, competition_id: newCompId, name: row.name, sort_order: row.sort_order };
  });
  const divisionError = await insertInChunks(divisionRows, (chunk) => supabase.from('divisions').insert(chunk));
  if (divisionError) return divisionError;

  // weight_classes
  const weightClasses = await supabase
    .from('weight_classes')
    .select('id, name, gender, lower_kg, upper_kg, sort_order')
    .eq('competition_id', sourceId);
  if (weightClasses.error) return duplicateFailed(weightClasses.error);
  const weightClassIds = new Map<string, string>();
  const weightClassRows = (weightClasses.data ?? []).map((row) => {
    const id = randomUUID();
    weightClassIds.set(row.id, id);
    return {
      id,
      competition_id: newCompId,
      name: row.name,
      gender: row.gender,
      lower_kg: row.lower_kg,
      upper_kg: row.upper_kg,
      sort_order: row.sort_order,
    };
  });
  const weightClassError = await insertInChunks(weightClassRows, (chunk) =>
    supabase.from('weight_classes').insert(chunk),
  );
  if (weightClassError) return weightClassError;

  // platforms
  const platforms = await supabase.from('platforms').select('id, name').eq('competition_id', sourceId);
  if (platforms.error) return duplicateFailed(platforms.error);
  const platformIds = new Map<string, string>();
  const platformRows = (platforms.data ?? []).map((row) => {
    const id = randomUUID();
    platformIds.set(row.id, id);
    return { id, competition_id: newCompId, name: row.name };
  });
  const platformError = await insertInChunks(platformRows, (chunk) => supabase.from('platforms').insert(chunk));
  if (platformError) return platformError;

  // teams
  const teams = await supabase.from('teams').select('id, name, sort_order').eq('competition_id', sourceId);
  if (teams.error) return duplicateFailed(teams.error);
  const teamIds = new Map<string, string>();
  const teamRows = (teams.data ?? []).map((row) => {
    const id = randomUUID();
    teamIds.set(row.id, id);
    return { id, competition_id: newCompId, name: row.name, sort_order: row.sort_order };
  });
  const teamError = await insertInChunks(teamRows, (chunk) => supabase.from('teams').insert(chunk));
  if (teamError) return teamError;

  // sessions (platform_id → copied platform)
  const sessions = await supabase
    .from('sessions')
    .select('id, platform_id, name, session_date, start_time, sort_order')
    .eq('competition_id', sourceId);
  if (sessions.error) return duplicateFailed(sessions.error);
  const sessionIds = new Map<string, string>();
  const sessionRows = (sessions.data ?? []).map((row) => {
    const id = randomUUID();
    sessionIds.set(row.id, id);
    return {
      id,
      competition_id: newCompId,
      platform_id: mappedId(platformIds, row.platform_id),
      name: row.name,
      session_date: row.session_date,
      start_time: row.start_time,
      sort_order: row.sort_order,
    };
  });
  const sessionError = await insertInChunks(sessionRows, (chunk) => supabase.from('sessions').insert(chunk));
  if (sessionError) return sessionError;

  // flights (session_id → copied session; NOT NULL, so a missing mapping is an error)
  const flights = await supabase
    .from('flights')
    .select('id, session_id, name, sort_order')
    .eq('competition_id', sourceId);
  if (flights.error) return duplicateFailed(flights.error);
  const flightIds = new Map<string, string>();
  const flightRows: Database['public']['Tables']['flights']['Insert'][] = [];
  for (const row of flights.data ?? []) {
    const sessionId = sessionIds.get(row.session_id);
    if (!sessionId) return missingMappingFailed();
    const id = randomUUID();
    flightIds.set(row.id, id);
    flightRows.push({ id, competition_id: newCompId, session_id: sessionId, name: row.name, sort_order: row.sort_order });
  }
  const flightError = await insertInChunks(flightRows, (chunk) => supabase.from('flights').insert(chunk));
  if (flightError) return flightError;

  // entries (weight_class_id / division_id / flight_id / team_id → copies; lifter_id is shared)
  const entries = await supabase
    .from('entries')
    .select(
      'id, lifter_id, weight_class_id, division_id, flight_id, team_id, team_lift, lot_number, bodyweight_kg, opener_squat_kg, opener_bench_kg, opener_deadlift_kg, rack_height_squat, squat_rack_setting, rack_height_bench, bench_safety_height, bench_spotting, racks_set, status',
    )
    .eq('competition_id', sourceId);
  if (entries.error) return duplicateFailed(entries.error);
  const entryIds = new Map<string, string>();
  const entryRows = (entries.data ?? []).map((row) => {
    const id = randomUUID();
    entryIds.set(row.id, id);
    return {
      id,
      competition_id: newCompId,
      lifter_id: row.lifter_id,
      weight_class_id: mappedId(weightClassIds, row.weight_class_id),
      division_id: mappedId(divisionIds, row.division_id),
      flight_id: mappedId(flightIds, row.flight_id),
      team_id: mappedId(teamIds, row.team_id),
      team_lift: row.team_lift,
      lot_number: row.lot_number,
      bodyweight_kg: row.bodyweight_kg,
      opener_squat_kg: row.opener_squat_kg,
      opener_bench_kg: row.opener_bench_kg,
      opener_deadlift_kg: row.opener_deadlift_kg,
      rack_height_squat: row.rack_height_squat,
      squat_rack_setting: row.squat_rack_setting,
      rack_height_bench: row.rack_height_bench,
      bench_safety_height: row.bench_safety_height,
      bench_spotting: row.bench_spotting,
      racks_set: row.racks_set,
      status: row.status,
    };
  });
  const entryError = await insertInChunks(entryRows, (chunk) => supabase.from('entries').insert(chunk));
  if (entryError) return entryError;

  // attempts (entry_id → copied entry; NOT NULL)
  const attempts = await supabase
    .from('attempts')
    .select('id, entry_id, lift, attempt_number, weight_kg, declared_at, result, is_record_attempt, weight_changes')
    .eq('competition_id', sourceId);
  if (attempts.error) return duplicateFailed(attempts.error);
  const attemptIds = new Map<string, string>();
  const attemptRows: Database['public']['Tables']['attempts']['Insert'][] = [];
  for (const row of attempts.data ?? []) {
    const entryId = entryIds.get(row.entry_id);
    if (!entryId) return missingMappingFailed();
    const id = randomUUID();
    attemptIds.set(row.id, id);
    attemptRows.push({
      id,
      competition_id: newCompId,
      entry_id: entryId,
      lift: row.lift,
      attempt_number: row.attempt_number,
      weight_kg: row.weight_kg,
      declared_at: row.declared_at,
      result: row.result,
      is_record_attempt: row.is_record_attempt,
      weight_changes: row.weight_changes,
    });
  }
  const attemptError = await insertInChunks(attemptRows, (chunk) => supabase.from('attempts').insert(chunk));
  if (attemptError) return attemptError;

  // referee_decisions (attempt_id → copied attempt; NOT NULL)
  const decisions = await supabase
    .from('referee_decisions')
    .select('id, attempt_id, position, decision, reasons, referee_user_id, decided_at')
    .eq('competition_id', sourceId);
  if (decisions.error) return duplicateFailed(decisions.error);
  const decisionRows: Database['public']['Tables']['referee_decisions']['Insert'][] = [];
  for (const row of decisions.data ?? []) {
    const attemptId = attemptIds.get(row.attempt_id);
    if (!attemptId) return missingMappingFailed();
    decisionRows.push({
      id: randomUUID(),
      competition_id: newCompId,
      attempt_id: attemptId,
      position: row.position,
      decision: row.decision,
      reasons: row.reasons,
      referee_user_id: row.referee_user_id,
      decided_at: row.decided_at,
    });
  }
  const decisionError = await insertInChunks(decisionRows, (chunk) =>
    supabase.from('referee_decisions').insert(chunk),
  );
  if (decisionError) return decisionError;

  return null;
}

// Duplicates a competition in full: its settings plus every division, weight class, platform, team,
// session, flight, entry, attempt and referee decision, with all internal references remapped onto the
// copies. Works at any status (the source is only read). The duplicate is created as a draft named
// "<name> (copy)" with a fresh slug. On success the operator lands on the new comp's edit screen; on a
// mid-copy failure the partial duplicate is deleted (cascade) so nothing half-built is left behind.
export async function duplicateCompetitionAction(input: { competitionId: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('duplicateCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not duplicate the competition. Please try again.');
    }

    const supabase = await createClient();
    const sourceId = parsed.data.competitionId;

    const { data: source, error: sourceError } = await supabase
      .from('competitions')
      .select('slug, name, federation, kit_type, event_type, starts_on, ends_on, is_team_competition')
      .eq('id', sourceId)
      .maybeSingle();
    if (sourceError) {
      Sentry.captureException(sourceError);
      return fail('Could not duplicate the competition. Please try again.');
    }
    if (!source) {
      return fail('Could not find that competition.');
    }

    const newCompId = randomUUID();
    const created = await insertDuplicateCompetition(supabase, newCompId, source);
    if (created.status === 'error') {
      return created;
    }

    const copyError = await copyCompetitionChildren(supabase, sourceId, newCompId);
    if (copyError) {
      // Roll back: deleting the new comp cascades to anything already copied, so a failed duplicate
      // leaves nothing half-built behind. If the cleanup itself fails, capture it — otherwise an
      // orphan partial comp would sit in the list with no trace of why.
      const { error: cleanupError } = await supabase.from('competitions').delete().eq('id', newCompId);
      if (cleanupError) {
        Sentry.captureException(cleanupError);
      }
      return copyError;
    }

    revalidatePath('/comps');
    redirect(`/comps/${newCompId}/edit`);
  });
}

// Permanently deletes a competition and everything that hangs off it — divisions, weight classes,
// platforms, teams, sessions, flights, entries, attempts and referee decisions all cascade away.
// Lifters are a shared table and are kept. Blocked once a comp is `completed`: that cascade would
// destroy the meet's final record, the one deliberate status guard on the setup side (ARCHITECTURE.md
// §7, matching deleteAllEntriesAction). For draft/published/active comps the robust type-to-confirm in
// the UI (type the comp name) is the safeguard against accidents. adminGuard()-gated and Sentry-wrapped.
// On success the operator is returned to the comps list, since the edit page they came from is now gone.
export async function deleteCompetitionAction(input: { competitionId: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteCompetition', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) {
      return fail('Could not delete the competition. Please try again.');
    }

    const supabase = await createClient();

    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('status')
      .eq('id', parsed.data.competitionId)
      .maybeSingle();
    if (compError) {
      Sentry.captureException(compError);
      return fail('Could not delete the competition. Please try again.');
    }
    if (!comp) {
      return fail('Could not find that competition.');
    }
    if (comp.status === 'completed') {
      return fail(
        'This competition is completed, so it cannot be deleted — that would destroy its final record. Change the status back to active or draft first if you genuinely need to remove it.',
      );
    }

    const { error } = await supabase.from('competitions').delete().eq('id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not delete the competition. Please try again.');
    }

    revalidatePath('/comps');
    redirect('/comps');
  });
}
