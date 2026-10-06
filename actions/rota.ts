'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { after } from 'next/server';
import { parseEmailList, sendEmail } from '@/lib/email/resend';
import { readOrganiserEmail } from '@/lib/email/organiser';
import { requestOrigin } from '@/lib/email/request-origin';
import { buildChangeRequestEmail, isEmailAddress } from '@/lib/rota/change-request-email';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { toFieldErrors } from '@/lib/validation';
import { MAX_ROTA_SLOT_CAPACITY, type RotaArriveBasis } from '@/lib/constants';
import { planRotaSectionsFromSessions } from '@/lib/rota/generate';
import { mostCommonArriveBy } from '@/lib/rota/grid';
import { syncRotaWithSessions } from '@/lib/rota/sync';
import { arriveByForBasis } from '@/lib/rota/sync-plan';
import {
  ROTA_ROLE_TITLE_MAX,
  moveRotaSignupSchema,
  rotaAdminSignupSchema,
  rotaChangeRequestSchema,
  rotaRoleForAllSchema,
  rotaRoleCreateSchema,
  rotaRoleUpdateSchema,
  rotaSectionCreateSchema,
  rotaSectionUpdateSchema,
  rotaSignupSchema,
  rotaWithdrawalContactSchema,
  setRotaOpenSchema,
  type MoveRotaSignupInput,
  type RotaAdminSignupInput,
  type RotaChangeRequestInput,
  type RotaRoleCreateInput,
  type RotaRoleForAllInput,
  type RotaRoleUpdateInput,
  type RotaSectionCreateInput,
  type RotaSectionUpdateInput,
  type RotaSignupInput,
  type RotaWithdrawalContactInput,
  type SetRotaOpenInput,
} from '@/types/rota';
import { setRotaStyleSchema, type SetRotaStyleInput } from '@/types/rota-style';
import { fail, ok, type ActionResult } from '@/types/action-result';

// Admin actions for the volunteer staff rota builder. All are setup writes — deliberately NOT gated
// on competition status (ARCHITECTURE.md §7): an organiser edits the rota at any point in the comp's
// life. adminGuard() is the gate; what the *public* may do (claim a slot) is gated separately by
// comp_rota_open() in RLS. Clients call router.refresh() after a successful action to re-read.

const GENERIC_ERROR = 'Could not save the rota. Please try again.';

const idSchema = z.object({ id: z.uuid() });
const moveSchema = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) });

export type RotaIdInput = z.infer<typeof idSchema>;
export type RotaMoveInput = z.infer<typeof moveSchema>;

// --- Settings: the open toggle + the withdrawal-contact line --------------------------------------

export async function setRotaOpenAction(input: SetRotaOpenInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('setRotaOpen', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = setRotaOpenSchema.safeParse(input);
    if (!parsed.success) return fail('Could not update the rota. Please try again.');

    const supabase = await createClient();
    const { error } = await supabase
      .from('competitions')
      .update({ rota_open: parsed.data.open })
      .eq('id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not update the rota. Please try again.');
    }
    return ok();
  });
}

export async function setRotaWithdrawalContactAction(
  input: RotaWithdrawalContactInput,
): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('setRotaWithdrawalContact', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaWithdrawalContactSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Could not save that contact line. Please try again.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('competitions')
      .update({ rota_withdrawal_contact: parsed.data.withdrawalContact })
      .eq('id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not save that contact line. Please try again.');
    }
    return ok();
  });
}

// The rota's look (the Formatting tab): line weights and colours. Null restores the default look.
export async function setRotaStyleAction(input: SetRotaStyleInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('setRotaStyle', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = setRotaStyleSchema.safeParse(input);
    if (!parsed.success) return fail('Could not save the formatting. Please try again.');

    const supabase = await createClient();
    const { error } = await supabase
      .from('competitions')
      .update({ rota_style: parsed.data.style })
      .eq('id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not save the formatting. Please try again.');
    }
    return ok();
  });
}

// --- Sections -------------------------------------------------------------------------------------

// New rows append: sort_order is computed server-side from the current count (not trusted from the
// client), so two builders adding at once can't both claim 0.

export async function createRotaSectionAction(
  input: RotaSectionCreateInput,
): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('createRotaSection', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaSectionCreateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { count, error: countError } = await supabase
      .from('rota_sections')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', parsed.data.competitionId);
    if (countError) {
      Sentry.captureException(countError);
      return fail(GENERIC_ERROR);
    }

    const { data, error } = await supabase
      .from('rota_sections')
      .insert({
        competition_id: parsed.data.competitionId,
        day_label: parsed.data.dayLabel,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
        sort_order: count ?? 0,
      })
      .select('id')
      .single();
    if (error || !data) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok({ id: data.id });
  });
}

export async function updateRotaSectionAction(input: RotaSectionUpdateInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateRotaSection', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaSectionUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('rota_sections')
      .update({
        day_label: parsed.data.dayLabel,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
      })
      .eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok();
  });
}

// Deleting a section cascades to its roles and their sign-ups (FK ON DELETE CASCADE).
export async function deleteRotaSectionAction(input: RotaIdInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteRotaSection', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail(GENERIC_ERROR);

    const supabase = await createClient();
    const { error } = await supabase.from('rota_sections').delete().eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok();
  });
}

// --- Roles ----------------------------------------------------------------------------------------

// A job's stored arrive-by and basis. In a session's column a job can follow the session's clock
// (the time is worked out here, from the session, not trusted from the client); anywhere else — or
// when the admin picks "set a time" — the typed time is kept and the basis is null.
async function resolveArriveBy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string | null,
  basis: RotaArriveBasis | null | undefined,
  typed: string | null,
): Promise<{ arrive_by: string | null; arrive_basis: RotaArriveBasis | null } | { error: unknown }> {
  if (!basis || !sessionId) {
    return { arrive_by: typed, arrive_basis: null };
  }
  const { data: session, error } = await supabase
    .from('sessions')
    .select('weigh_in_time, lift_off_time')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    return { error };
  }
  if (!session) {
    return { arrive_by: typed, arrive_basis: null };
  }
  return { arrive_by: arriveByForBasis(basis, session), arrive_basis: basis };
}

export async function createRotaRoleAction(
  input: RotaRoleCreateInput,
): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('createRotaRole', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaRoleCreateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    // The section must belong to the comp the client named — RLS can't check this cross-table, so
    // verify before denormalising competition_id onto the role (as setAttemptWeight verifies the
    // entry's comp before writing).
    const { data: section, error: sectionError } = await supabase
      .from('rota_sections')
      .select('competition_id, session_id')
      .eq('id', parsed.data.sectionId)
      .maybeSingle();
    if (sectionError) {
      Sentry.captureException(sectionError);
      return fail(GENERIC_ERROR);
    }
    if (!section || section.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that section.');
    }

    const timing = await resolveArriveBy(supabase, section.session_id, parsed.data.arriveBasis, parsed.data.arriveBy);
    if ('error' in timing) {
      Sentry.captureException(timing.error);
      return fail(GENERIC_ERROR);
    }

    const { count, error: countError } = await supabase
      .from('rota_roles')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', parsed.data.sectionId);
    if (countError) {
      Sentry.captureException(countError);
      return fail(GENERIC_ERROR);
    }

    const { data, error } = await supabase
      .from('rota_roles')
      .insert({
        competition_id: parsed.data.competitionId,
        section_id: parsed.data.sectionId,
        title: parsed.data.title,
        ...timing,
        capacity: parsed.data.capacity,
        sort_order: count ?? 0,
      })
      .select('id')
      .single();
    if (error || !data) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok({ id: data.id });
  });
}

export async function updateRotaRoleAction(input: RotaRoleUpdateInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('updateRotaRole', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaRoleUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    // Don't let the slot count drop below the people already in the role — they'd vanish from the
    // grid's slots without anyone being told. The admin removes or moves someone first.
    const { count: taken, error: countError } = await supabase
      .from('rota_signups')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', parsed.data.id);
    if (countError) {
      Sentry.captureException(countError);
      return fail(GENERIC_ERROR);
    }
    if ((taken ?? 0) > parsed.data.capacity) {
      return fail(
        `${taken} people are signed up for this role. Remove or move someone before lowering the spaces to ${parsed.data.capacity}.`,
        { capacity: ['Fewer spaces than people already signed up.'] },
      );
    }

    const { data: role, error: roleError } = await supabase
      .from('rota_roles')
      .select('section_id')
      .eq('id', parsed.data.id)
      .maybeSingle();
    if (roleError) {
      Sentry.captureException(roleError);
      return fail(GENERIC_ERROR);
    }
    if (!role) {
      return fail('Could not find that role.');
    }
    const { data: section, error: sectionError } = await supabase
      .from('rota_sections')
      .select('session_id')
      .eq('id', role.section_id)
      .maybeSingle();
    if (sectionError) {
      Sentry.captureException(sectionError);
      return fail(GENERIC_ERROR);
    }
    const timing = await resolveArriveBy(
      supabase,
      section?.session_id ?? null,
      parsed.data.arriveBasis,
      parsed.data.arriveBy,
    );
    if ('error' in timing) {
      Sentry.captureException(timing.error);
      return fail(GENERIC_ERROR);
    }

    const { error } = await supabase
      .from('rota_roles')
      .update({
        title: parsed.data.title,
        ...timing,
        capacity: parsed.data.capacity,
      })
      .eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok();
  });
}

// Deleting a role cascades to its sign-ups. The builder confirms first when the role has volunteers.
export async function deleteRotaRoleAction(input: RotaIdInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('deleteRotaRole', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail(GENERIC_ERROR);

    const supabase = await createClient();
    const { error } = await supabase.from('rota_roles').delete().eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok();
  });
}

// --- Reordering (move a section or a role up/down within its list) ---------------------------------

// Swaps a row's sort_order with its neighbour in the given ordered list. A no-op (returns ok) at the
// list edge. There is no unique constraint on sort_order, so the two updates can't collide.
async function moveWithin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'rota_sections' | 'rota_roles',
  rows: { id: string; sort_order: number }[],
  id: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const ordered = rows.toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const index = ordered.findIndex((row) => row.id === id);
  if (index === -1) return fail(GENERIC_ERROR);

  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  const current = ordered[index];
  const neighbour = ordered[neighbourIndex];
  if (!neighbour) return ok(); // already at the edge

  const [a, b] = await Promise.all([
    supabase.from(table).update({ sort_order: neighbour.sort_order }).eq('id', current.id),
    supabase.from(table).update({ sort_order: current.sort_order }).eq('id', neighbour.id),
  ]);
  if (a.error || b.error) {
    Sentry.captureException(a.error ?? b.error);
    return fail(GENERIC_ERROR);
  }
  return ok();
}

export async function moveRotaSectionAction(
  input: RotaMoveInput & { competitionId: string },
): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('moveRotaSection', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = moveSchema.extend({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail(GENERIC_ERROR);

    const supabase = await createClient();
    const { data: sections, error } = await supabase
      .from('rota_sections')
      .select('id, sort_order')
      .eq('competition_id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return moveWithin(supabase, 'rota_sections', sections ?? [], parsed.data.id, parsed.data.direction);
  });
}

export async function moveRotaRoleAction(
  input: RotaMoveInput & { sectionId: string },
): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('moveRotaRole', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = moveSchema.extend({ sectionId: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail(GENERIC_ERROR);

    const supabase = await createClient();
    const { data: roles, error } = await supabase
      .from('rota_roles')
      .select('id, sort_order')
      .eq('section_id', parsed.data.sectionId);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return moveWithin(supabase, 'rota_roles', roles ?? [], parsed.data.id, parsed.data.direction);
  });
}

// --- Generate the rota from the comp's sessions ---------------------------------------------------

// Re-runs the session sync after Generate or Duplicate, so new columns sit in session order and every
// session column is in step with its session (the columns are already saved, so a hiccup here is
// logged, not reported).
async function settleRotaOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<void> {
  const { error } = await syncRotaWithSessions(supabase, competitionId);
  if (error) {
    Sentry.captureException(error);
  }
}

const generateRotaSchema = z.object({
  competitionId: z.uuid(),
  // The ticked default roles (title + position count), chosen in the builder before generating.
  roles: z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, 'A role needs a title.')
          .max(ROTA_ROLE_TITLE_MAX, 'That role title is too long.'),
        capacity: z
          .number()
          .int('Use a whole number.')
          .min(1, 'A role needs at least one slot.')
          .max(MAX_ROTA_SLOT_CAPACITY, `A role can have at most ${MAX_ROTA_SLOT_CAPACITY} slots.`),
        // Which session time this role's arrive-by is set from (30 min before it).
        arriveBasis: z.enum(['lift_off', 'weigh_in']),
      }),
    )
    .min(1, 'Tick at least one role to generate.')
    .max(50),
});

export type GenerateRotaInput = z.infer<typeof generateRotaSchema>;

// Creates one rota section per comp session that doesn't already have one (the section_id link makes
// this idempotent — re-running only adds columns for new sessions, never duplicating or overwriting
// the admin's edits), each pre-filled with the ticked roles. Returns how many columns were created.
export async function generateRotaFromSessionsAction(
  input: GenerateRotaInput,
): Promise<ActionResult<{ created: number }>> {
  return Sentry.withServerActionInstrumentation('generateRotaFromSessions', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = generateRotaSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Tick at least one role to generate.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    const [sessionsResult, sectionsResult, platformsResult] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, name, session_date, weigh_in_time, lift_off_time, platform_id, sort_order')
        .eq('competition_id', parsed.data.competitionId),
      supabase.from('rota_sections').select('id, session_id').eq('competition_id', parsed.data.competitionId),
      supabase.from('platforms').select('id, name').eq('competition_id', parsed.data.competitionId),
    ]);
    if (sessionsResult.error || sectionsResult.error || platformsResult.error) {
      Sentry.captureException(sessionsResult.error ?? sectionsResult.error ?? platformsResult.error);
      return fail(GENERIC_ERROR);
    }

    const sessions = sessionsResult.data ?? [];
    if (sessions.length === 0) {
      return fail('Add sessions on the Sessions & flights screen before generating the rota.');
    }

    const existing = sectionsResult.data ?? [];
    const linkedSessionIds = new Set(
      existing.map((section) => section.session_id).filter((id): id is string => id !== null),
    );
    const platformNamesById = new Map((platformsResult.data ?? []).map((platform) => [platform.id, platform.name]));

    const planned = planRotaSectionsFromSessions(sessions, linkedSessionIds, platformNamesById);
    if (planned.length === 0) {
      // Every session already has a column — reported so the UI can say "already up to date". Still
      // bring the existing columns in step with the sessions, in case they've drifted.
      await settleRotaOrder(supabase, parsed.data.competitionId);
      return ok({ created: 0 });
    }

    // New columns append after any existing ones.
    const baseSortOrder = existing.length;
    const sectionRows = planned.map((section, index) => ({
      competition_id: parsed.data.competitionId,
      session_id: section.sessionId,
      day_label: section.dayLabel,
      title: section.title,
      subtitle: section.subtitle,
      sort_order: baseSortOrder + index,
    }));

    const { data: createdSections, error: sectionError } = await supabase
      .from('rota_sections')
      .insert(sectionRows)
      .select('id, session_id');
    if (sectionError || !createdSections) {
      Sentry.captureException(sectionError);
      return fail(GENERIC_ERROR);
    }

    const sectionIdBySession = new Map(createdSections.map((section) => [section.session_id, section.id]));
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const roleRows = planned.flatMap((section) => {
      const sectionId = sectionIdBySession.get(section.sessionId);
      if (!sectionId) {
        return [];
      }
      const session = sessionById.get(section.sessionId);
      return parsed.data.roles.map((role, index) => ({
        competition_id: parsed.data.competitionId,
        section_id: sectionId,
        title: role.title,
        // 30 min before lift-off for the platform crew, 10 min before weigh-ins open for the weigh-in
        // team — and kept in step with the session from then on (lib/rota/sync.ts).
        arrive_by: session ? arriveByForBasis(role.arriveBasis, session) : null,
        arrive_basis: role.arriveBasis,
        capacity: role.capacity,
        sort_order: index,
      }));
    });

    if (roleRows.length > 0) {
      const { error: roleError } = await supabase.from('rota_roles').insert(roleRows);
      if (roleError) {
        Sentry.captureException(roleError);
        // Roll back the just-created columns so a retry starts clean — otherwise the session_id link
        // makes Generate skip these sessions forever as empty columns the admin can't repopulate.
        const { error: rollbackError } = await supabase
          .from('rota_sections')
          .delete()
          .in(
            'id',
            createdSections.map((section) => section.id),
          );
        if (rollbackError) {
          Sentry.captureException(rollbackError);
        }
        return fail('Could not generate the rota. Please try again.');
      }
    }

    // Slot the new columns into session order among any already there.
    await settleRotaOrder(supabase, parsed.data.competitionId);

    return ok({ created: planned.length });
  });
}

// --- Duplicate a column's roles onto another session ----------------------------------------------

const duplicateRotaSectionSchema = z.object({
  competitionId: z.uuid(),
  sourceSectionId: z.uuid(),
  targetSessionId: z.uuid(),
});

// Copies an existing column's roles (titles, capacities and arrive-by — a job that follows its
// session's clock follows the target session's; sign-ups are NOT copied) into a new column linked to a session that doesn't have one yet. The new column's header
// (day / title / subtitle) comes from the TARGET session, like Generate, so it represents the new
// session — only the role layout is duplicated. For reusing a customised column on a session added
// after the rota was built.
export async function duplicateRotaSectionToSessionAction(input: {
  competitionId: string;
  sourceSectionId: string;
  targetSessionId: string;
}): Promise<ActionResult<{ id: string }>> {
  return Sentry.withServerActionInstrumentation('duplicateRotaSectionToSession', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = duplicateRotaSectionSchema.safeParse(input);
    if (!parsed.success) return fail(GENERIC_ERROR);

    const supabase = await createClient();

    // The source column must belong to this comp.
    const { data: source, error: sourceError } = await supabase
      .from('rota_sections')
      .select('competition_id')
      .eq('id', parsed.data.sourceSectionId)
      .maybeSingle();
    if (sourceError) {
      Sentry.captureException(sourceError);
      return fail(GENERIC_ERROR);
    }
    if (!source || source.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that column to duplicate.');
    }

    // The target session must belong to this comp and not already have a column.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, competition_id, name, session_date, weigh_in_time, lift_off_time, platform_id, sort_order')
      .eq('id', parsed.data.targetSessionId)
      .maybeSingle();
    if (sessionError) {
      Sentry.captureException(sessionError);
      return fail(GENERIC_ERROR);
    }
    if (!session || session.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that session.');
    }

    const { data: existing, error: existingError } = await supabase
      .from('rota_sections')
      .select('id')
      .eq('session_id', parsed.data.targetSessionId)
      .maybeSingle();
    if (existingError) {
      Sentry.captureException(existingError);
      return fail(GENERIC_ERROR);
    }
    if (existing) {
      return fail('That session already has a column.');
    }

    const [rolesResult, platformsResult, countResult] = await Promise.all([
      supabase
        .from('rota_roles')
        .select('title, arrive_by, arrive_basis, capacity, sort_order')
        .eq('section_id', parsed.data.sourceSectionId)
        .order('sort_order', { ascending: true }),
      supabase.from('platforms').select('id, name').eq('competition_id', parsed.data.competitionId),
      supabase
        .from('rota_sections')
        .select('id', { count: 'exact', head: true })
        .eq('competition_id', parsed.data.competitionId),
    ]);
    if (rolesResult.error || platformsResult.error || countResult.error) {
      Sentry.captureException(rolesResult.error ?? platformsResult.error ?? countResult.error);
      return fail(GENERIC_ERROR);
    }

    const platformNamesById = new Map((platformsResult.data ?? []).map((platform) => [platform.id, platform.name]));
    // The header comes from the target session, via the same mapping Generate uses.
    const [planned] = planRotaSectionsFromSessions([session], new Set(), platformNamesById);
    if (!planned) {
      return fail(GENERIC_ERROR);
    }

    const { data: newSection, error: insertError } = await supabase
      .from('rota_sections')
      .insert({
        competition_id: parsed.data.competitionId,
        session_id: parsed.data.targetSessionId,
        day_label: planned.dayLabel,
        title: planned.title,
        subtitle: planned.subtitle,
        sort_order: countResult.count ?? 0,
      })
      .select('id')
      .single();
    if (insertError || !newSection) {
      Sentry.captureException(insertError);
      return fail(GENERIC_ERROR);
    }

    const roleRows = (rolesResult.data ?? []).map((role, index) => ({
      competition_id: parsed.data.competitionId,
      section_id: newSection.id,
      title: role.title,
      // A job that follows its session's clock follows the new session's; a typed time is copied.
      arrive_by: role.arrive_basis === null ? role.arrive_by : arriveByForBasis(role.arrive_basis, session),
      arrive_basis: role.arrive_basis,
      capacity: role.capacity,
      sort_order: index,
    }));
    if (roleRows.length > 0) {
      const { error: roleError } = await supabase.from('rota_roles').insert(roleRows);
      if (roleError) {
        Sentry.captureException(roleError);
        // Roll back the empty column so a retry starts clean, and the session stays available to
        // Generate / Duplicate rather than being skipped as already-linked.
        const { error: rollbackError } = await supabase.from('rota_sections').delete().eq('id', newSection.id);
        if (rollbackError) {
          Sentry.captureException(rollbackError);
        }
        return fail('Could not duplicate the column. Please try again.');
      }
    }

    await settleRotaOrder(supabase, parsed.data.competitionId);

    return ok({ id: newSection.id });
  });
}

// --- The public sign-up (the app's SECOND server action without adminGuard) -----------------------

const ROTA_CLOSED_MESSAGE = 'This rota is not open for sign-ups right now.';
const SLOT_FULL_MESSAGE = 'Sorry — that slot was just filled. Please pick another.';
const SLOT_GONE_MESSAGE = 'That slot is no longer available. Please refresh the page and try again.';
const ALREADY_SIGNED_MESSAGE = 'You have already signed up for this slot with that email address.';

// A volunteer claiming a rota slot. Like submitEntryFormAction (ARCHITECTURE.md §3/§7) it runs on the
// visitor's own anon session with NO adminGuard, so RLS is the real gate — the INSERT is only allowed
// while comp_rota_open() holds — and the database capacity trigger is the true ceiling. Validated by
// Zod; never .select()s the insert back (anon has no read on rota_signups, by design).
export async function submitRotaSignupAction(input: RotaSignupInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('submitRotaSignup', async () => {
    // Bot tripped the honeypot: claim success, store nothing.
    if (typeof input.website === 'string' && input.website.trim() !== '') {
      return ok();
    }

    const parsed = rotaSignupSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();

    // The role must belong to the comp the form named — anon can read rota_roles only while the rota
    // is open, so a not-found row also covers a closed rota. Guards against a forged role_id from
    // another comp being inserted under this competition_id.
    const { data: role, error: roleError } = await supabase
      .from('rota_roles')
      .select('competition_id')
      .eq('id', parsed.data.roleId)
      .maybeSingle();
    if (roleError) {
      Sentry.captureException(roleError);
      return fail('Could not sign you up. Please try again.');
    }
    if (!role || role.competition_id !== parsed.data.competitionId) {
      // A null role can mean the rota closed (anon lost its read on rota_roles) or the slot was
      // deleted. public_rota_comps is readable only while the rota is open, so use it to tell the two
      // apart and show the volunteer the right message.
      const { data: openComp } = await supabase
        .from('public_rota_comps')
        .select('id')
        .eq('id', parsed.data.competitionId)
        .maybeSingle();
      return fail(openComp ? SLOT_GONE_MESSAGE : ROTA_CLOSED_MESSAGE);
    }

    // No .select(): anon has no read on rota_signups.
    const { error } = await supabase.from('rota_signups').insert({
      competition_id: parsed.data.competitionId,
      role_id: parsed.data.roleId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    });

    if (error) {
      // P0001 = our capacity / role-missing triggers (see migration 20260615000001).
      if (error.code === 'P0001' && error.message.includes('rota_slot_full')) {
        return fail(SLOT_FULL_MESSAGE);
      }
      if (error.code === 'P0001' && error.message.includes('rota_role_missing')) {
        return fail(SLOT_GONE_MESSAGE);
      }
      // 23505 = the (role_id, lower(email)) unique index: same person, same slot, twice.
      if (isUniqueViolation(error)) {
        return fail(ALREADY_SIGNED_MESSAGE);
      }
      // 42501 = RLS denied: the rota closed between page load and submit.
      if (error.code === '42501') {
        return fail(ROTA_CLOSED_MESSAGE);
      }
      Sentry.captureException(error);
      return fail('Could not sign you up. Please try again.');
    }

    return ok();
  });
}

// --- Admin sign-up management (the rota screen's contact view) -------------------------------------

// Removes a volunteer from a slot (admin-only — there is no self-service cancel; this is how a
// withdrawal request is actioned). Frees the slot for someone else.
export async function removeRotaSignupAction(input: RotaIdInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('removeRotaSignup', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail('Could not remove that volunteer. Please try again.');

    const supabase = await createClient();
    const { error } = await supabase.from('rota_signups').delete().eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not remove that volunteer. Please try again.');
    }
    return ok();
  });
}

// Adds a volunteer to a slot on the admin's behalf (e.g. a regular helper, or someone who asked by
// phone). A name is enough — email and mobile are optional here, unlike the public form. The same
// capacity ceiling applies (the BEFORE INSERT trigger fires for this insert too — raise the role's
// slot count to add beyond it).
export async function addRotaSignupAction(input: RotaAdminSignupInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('addRotaSignup', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaAdminSignupSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { data: role, error: roleError } = await supabase
      .from('rota_roles')
      .select('competition_id')
      .eq('id', parsed.data.roleId)
      .maybeSingle();
    if (roleError) {
      Sentry.captureException(roleError);
      return fail('Could not add that volunteer. Please try again.');
    }
    if (!role || role.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that slot.');
    }

    const { error } = await supabase.from('rota_signups').insert({
      competition_id: parsed.data.competitionId,
      role_id: parsed.data.roleId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    });
    if (error) {
      if (error.code === 'P0001' && error.message.includes('rota_slot_full')) {
        return fail('That slot is full — raise its position count to add more.');
      }
      if (isUniqueViolation(error)) {
        return fail('That email is already signed up for this slot.');
      }
      Sentry.captureException(error);
      return fail('Could not add that volunteer. Please try again.');
    }
    return ok();
  });
}

// Wipes a comp's entire rota — every column and role, and (the careful bit) every volunteer sign-up
// with their contact details. The FK cascades do the rest: deleting the sections cascades to roles,
// and roles to sign-ups. Destructive and unrecoverable, so the UI gates it behind a type-the-comp-name
// confirm and an export-contacts-first prompt. A setup write — not status-gated. The rota's open/closed
// setting and withdrawal-contact line are left untouched (they're comp settings, not rota content).
export async function resetRotaAction(input: { competitionId: string }): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('resetRota', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail('Could not reset the rota. Please try again.');

    const supabase = await createClient();
    const { error } = await supabase
      .from('rota_sections')
      .delete()
      .eq('competition_id', parsed.data.competitionId);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not reset the rota. Please try again.');
    }
    return ok();
  });
}

// Moves a volunteer to another slot in the same comp (admin-only — e.g. actioning a swap request).
// The capacity trigger also fires on a role_id update (migration 20261005000001), so a move can't
// overfill the target.
export async function moveRotaSignupAction(input: MoveRotaSignupInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('moveRotaSignup', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = moveRotaSignupSchema.safeParse(input);
    if (!parsed.success) return fail('Could not move that volunteer. Please try again.');

    const supabase = await createClient();
    const [signupResult, roleResult] = await Promise.all([
      supabase.from('rota_signups').select('competition_id, role_id').eq('id', parsed.data.id).maybeSingle(),
      supabase.from('rota_roles').select('competition_id').eq('id', parsed.data.roleId).maybeSingle(),
    ]);
    if (signupResult.error || roleResult.error) {
      Sentry.captureException(signupResult.error ?? roleResult.error);
      return fail('Could not move that volunteer. Please try again.');
    }
    const signup = signupResult.data;
    const role = roleResult.data;
    if (!signup || !role || signup.competition_id !== role.competition_id) {
      return fail('Could not find that slot.');
    }
    if (signup.role_id === parsed.data.roleId) {
      return ok(); // already there
    }

    const { error } = await supabase
      .from('rota_signups')
      .update({ role_id: parsed.data.roleId })
      .eq('id', parsed.data.id);
    if (error) {
      if (error.code === 'P0001' && error.message.includes('rota_slot_full')) {
        return fail('That slot is full — raise its spaces in Edit layout, or pick another.');
      }
      if (isUniqueViolation(error)) {
        return fail('That person is already in that slot.');
      }
      Sentry.captureException(error);
      return fail('Could not move that volunteer. Please try again.');
    }
    return ok();
  });
}

// Adds one job to every column at once (e.g. "Commentary" for every session), appended to the end of
// each column. Each new role's arrive-by is that column's usual crew time. Returns how many columns
// it was added to.
export async function addRotaRoleToAllSectionsAction(
  input: RotaRoleForAllInput,
): Promise<ActionResult<{ added: number }>> {
  return Sentry.withServerActionInstrumentation('addRotaRoleToAllSections', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = rotaRoleForAllSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const [sectionsResult, rolesResult, sessionsResult] = await Promise.all([
      supabase.from('rota_sections').select('id, session_id').eq('competition_id', parsed.data.competitionId),
      supabase
        .from('rota_roles')
        .select('id, section_id, title, arrive_by, sort_order')
        .eq('competition_id', parsed.data.competitionId),
      supabase.from('sessions').select('id, weigh_in_time, lift_off_time').eq('competition_id', parsed.data.competitionId),
    ]);
    if (sectionsResult.error || rolesResult.error || sessionsResult.error) {
      Sentry.captureException(sectionsResult.error ?? rolesResult.error ?? sessionsResult.error);
      return fail(GENERIC_ERROR);
    }
    const sessionById = new Map((sessionsResult.data ?? []).map((session) => [session.id, session]));

    const sections = sectionsResult.data ?? [];
    if (sections.length === 0) {
      return fail('Add a column first.');
    }

    const rolesBySection = new Map<string, { id: string; title: string; arrive_by: string | null; sort_order: number }[]>();
    for (const role of rolesResult.data ?? []) {
      const list = rolesBySection.get(role.section_id) ?? [];
      list.push(role);
      rolesBySection.set(role.section_id, list);
    }

    const rows = sections.map((section) => {
      const roles = rolesBySection.get(section.id) ?? [];
      let nextSort = 0;
      for (const role of roles) {
        nextSort = Math.max(nextSort, role.sort_order + 1);
      }
      // In a session's column the new job arrives with the crew (30 minutes before lift-off) and
      // follows the session from then on; elsewhere it takes the column's usual time.
      const session = section.session_id ? sessionById.get(section.session_id) : undefined;
      const arriveBasis: RotaArriveBasis | null = session ? 'lift_off' : null;
      return {
        competition_id: parsed.data.competitionId,
        section_id: section.id,
        title: parsed.data.title,
        arrive_by: session ? arriveByForBasis('lift_off', session) : mostCommonArriveBy(roles),
        arrive_basis: arriveBasis,
        capacity: parsed.data.capacity,
        sort_order: nextSort,
      };
    });

    const { error } = await supabase.from('rota_roles').insert(rows);
    if (error) {
      Sentry.captureException(error);
      return fail(GENERIC_ERROR);
    }
    return ok({ added: rows.length });
  });
}

// --- Change requests (the app's THIRD server action without adminGuard) ---------------------------

const CHANGE_REQUEST_ERROR = 'Could not send your request. Please try again.';
const CHANGE_REQUEST_FULL_MESSAGE =
  'The organisers have a lot of requests waiting. Please contact them directly using the details on this page.';

// A volunteer asking the organiser to drop out of, swap or change a slot. Like submitRotaSignupAction
// it runs on the visitor's anon session with NO adminGuard: RLS allows the INSERT only while
// comp_rota_open() holds, and the database trigger caps open requests and rejects a slot from another
// comp. Never .select()s the insert back (anon has no read on rota_change_requests).
export async function submitRotaChangeRequestAction(input: RotaChangeRequestInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('submitRotaChangeRequest', async () => {
    // Bot tripped the honeypot: claim success, store nothing.
    if (typeof input.website === 'string' && input.website.trim() !== '') {
      return ok();
    }

    const parsed = rotaChangeRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }

    const supabase = await createClient();
    const { error } = await supabase.from('rota_change_requests').insert({
      competition_id: parsed.data.competitionId,
      role_id: parsed.data.roleId,
      name: parsed.data.name,
      contact: parsed.data.contact,
      kind: parsed.data.kind,
      message: parsed.data.message,
    });

    if (error) {
      // P0001 = our rules trigger (see migration 20261005000001).
      if (error.code === 'P0001' && error.message.includes('rota_change_requests_cap')) {
        return fail(CHANGE_REQUEST_FULL_MESSAGE);
      }
      if (error.code === 'P0001' && error.message.includes('rota_change_request_role_mismatch')) {
        return fail(SLOT_GONE_MESSAGE);
      }
      // 42501 = RLS denied: the rota closed between page load and submit.
      if (error.code === '42501') {
        return fail(ROTA_CLOSED_MESSAGE);
      }
      Sentry.captureException(error);
      return fail(CHANGE_REQUEST_ERROR);
    }

    // The request is saved; an email problem is logged, never shown to the volunteer as a failure.
    try {
      await emailOrganisersAboutChangeRequest(supabase, parsed.data);
    } catch (emailError) {
      Sentry.captureException(emailError);
    }
    return ok();
  });
}

// Emails the organisers about a change request that has just been saved. Who gets it: the comp's
// organiser email (set on its edit screen), else ROTA_NOTIFY_EMAILS, else every admin in
// ADMIN_EMAILS. The details are read on the volunteer's own anon session (the rota is open, so the
// comp header, slot and organiser email are readable), and the email itself is sent after the
// response, so the volunteer isn't kept waiting and a mail hiccup never fails a request that is
// already saved. Nothing happens until Resend is set up.
async function emailOrganisersAboutChangeRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: RotaChangeRequestInput,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    return;
  }
  const organiserEmail = await readOrganiserEmail(supabase, request.competitionId, 'public');
  const to = organiserEmail
    ? [organiserEmail]
    : parseEmailList(process.env.ROTA_NOTIFY_EMAILS || process.env.ADMIN_EMAILS);
  if (to.length === 0) {
    return;
  }

  const [compResult, roleResult, origin] = await Promise.all([
    supabase.from('public_rota_comps').select('slug, name').eq('id', request.competitionId).maybeSingle(),
    request.roleId
      ? supabase.from('rota_roles').select('title, section_id').eq('id', request.roleId).maybeSingle()
      : Promise.resolve(null),
    requestOrigin(),
  ]);
  const role = roleResult?.data ?? null;
  const { data: section } = role
    ? await supabase.from('rota_sections').select('day_label, title').eq('id', role.section_id).maybeSingle()
    : { data: null };

  const slug = compResult.data?.slug;
  const sectionLabel = section ? [section.day_label, section.title].filter(Boolean).join(' ') : null;

  const email = buildChangeRequestEmail({
    competitionName: compResult.data?.name ?? 'Your competition',
    name: request.name,
    contact: request.contact,
    kind: request.kind,
    slotLabel: role ? [sectionLabel, role.title].filter(Boolean).join(' · ') : null,
    message: request.message,
    rotaUrl: slug && origin ? `${origin}/${slug}/rota` : null,
  });

  after(async () => {
    const result = await sendEmail({
      to,
      subject: email.subject,
      text: email.text,
      replyTo: isEmailAddress(request.contact) ? request.contact.trim() : undefined,
    });
    if (result.status === 'failed') {
      // A generic error only — never the volunteer's details.
      Sentry.captureException(result.error);
    }
  });
}

// Marks a change request done (admin-only). Done requests drop off the rota screen's list.
export async function resolveRotaChangeRequestAction(input: RotaIdInput): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation('resolveRotaChangeRequest', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return fail('Could not update that request. Please try again.');

    const supabase = await createClient();
    const { error } = await supabase
      .from('rota_change_requests')
      .update({ status: 'done', resolved_at: new Date().toISOString() })
      .eq('id', parsed.data.id);
    if (error) {
      Sentry.captureException(error);
      return fail('Could not update that request. Please try again.');
    }
    return ok();
  });
}
