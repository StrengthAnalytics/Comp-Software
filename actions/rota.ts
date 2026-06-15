'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { toFieldErrors } from '@/lib/validation';
import { MAX_ROTA_SLOT_CAPACITY } from '@/lib/constants';
import { planRotaSectionsFromSessions } from '@/lib/rota/generate';
import {
  ROTA_ROLE_TITLE_MAX,
  rotaRoleCreateSchema,
  rotaRoleUpdateSchema,
  rotaSectionCreateSchema,
  rotaSectionUpdateSchema,
  rotaSignupSchema,
  rotaWithdrawalContactSchema,
  setRotaOpenSchema,
  type RotaRoleCreateInput,
  type RotaRoleUpdateInput,
  type RotaSectionCreateInput,
  type RotaSectionUpdateInput,
  type RotaSignupInput,
  type RotaWithdrawalContactInput,
  type SetRotaOpenInput,
} from '@/types/rota';
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
      .select('competition_id')
      .eq('id', parsed.data.sectionId)
      .maybeSingle();
    if (sectionError) {
      Sentry.captureException(sectionError);
      return fail(GENERIC_ERROR);
    }
    if (!section || section.competition_id !== parsed.data.competitionId) {
      return fail('Could not find that section.');
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
        arrive_by: parsed.data.arriveBy,
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
    const { error } = await supabase
      .from('rota_roles')
      .update({
        title: parsed.data.title,
        arrive_by: parsed.data.arriveBy,
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
        .select('id, name, session_date, start_time, platform_id, sort_order')
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
      // Every session already has a column — a no-op, reported so the UI can say "already up to date".
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
    const roleRows = planned.flatMap((section) => {
      const sectionId = sectionIdBySession.get(section.sessionId);
      if (!sectionId) {
        return [];
      }
      return parsed.data.roles.map((role, index) => ({
        competition_id: parsed.data.competitionId,
        section_id: sectionId,
        title: role.title,
        arrive_by: null,
        capacity: role.capacity,
        sort_order: index,
      }));
    });

    if (roleRows.length > 0) {
      const { error: roleError } = await supabase.from('rota_roles').insert(roleRows);
      if (roleError) {
        // The columns landed; be honest that their roles didn't rather than reporting clean success.
        Sentry.captureException(roleError);
        return fail(
          'The columns were added, but their roles could not be created. Add roles to them, or delete the columns and try again.',
        );
      }
    }

    return ok({ created: planned.length });
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
      return fail(SLOT_GONE_MESSAGE);
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
