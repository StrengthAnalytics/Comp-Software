import type { SupabaseClient } from '@supabase/supabase-js';
import { isUniqueViolation } from '@/lib/supabase/errors';
import { planRotaSync } from '@/lib/rota/sync-plan';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

// Brings a comp's rota back in step with its sessions (see lib/rota/sync-plan.ts for the rules). Run
// by the session and platform actions after every change, so the stored rota is always current and
// the public board — which can't read a draft comp's sessions — needs no join.
//
// Returns the first error rather than throwing: the callers' own write has already succeeded, so they
// log the error and still report success (the next session save, or Generate, catches the rota up).
export async function syncRotaWithSessions(
  supabase: Client,
  competitionId: string,
  options: { addColumnFor?: readonly string[] } = {},
): Promise<{ error: unknown }> {
  const [sessionsResult, sectionsResult, rolesResult, platformsResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, session_date, weigh_in_time, lift_off_time, platform_id, sort_order')
      .eq('competition_id', competitionId),
    supabase
      .from('rota_sections')
      .select('id, session_id, day_label, title, subtitle, sort_order')
      .eq('competition_id', competitionId),
    supabase
      .from('rota_roles')
      .select('id, section_id, title, arrive_by, arrive_basis, capacity, sort_order')
      .eq('competition_id', competitionId),
    supabase.from('platforms').select('id, name').eq('competition_id', competitionId),
  ]);
  const readError = sessionsResult.error ?? sectionsResult.error ?? rolesResult.error ?? platformsResult.error;
  if (readError) {
    return { error: readError };
  }

  const sections = sectionsResult.data ?? [];
  if (sections.length === 0) {
    // No rota yet — nothing to follow.
    return { error: null };
  }

  const plan = planRotaSync(
    sessionsResult.data ?? [],
    sections,
    rolesResult.data ?? [],
    new Map((platformsResult.data ?? []).map((platform) => [platform.id, platform.name])),
    options.addColumnFor,
  );

  const updates = await Promise.all([
    ...plan.sectionUpdates.map(({ id, ...fields }) => supabase.from('rota_sections').update(fields).eq('id', id)),
    ...plan.roleUpdates.map(({ id, arrive_by }) => supabase.from('rota_roles').update({ arrive_by }).eq('id', id)),
  ]);
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) {
    return { error: updateError };
  }

  for (const column of plan.newColumns) {
    const { data: section, error: sectionError } = await supabase
      .from('rota_sections')
      .insert({
        competition_id: competitionId,
        session_id: column.sessionId,
        day_label: column.dayLabel,
        title: column.title,
        subtitle: column.subtitle,
        sort_order: column.sortOrder,
      })
      .select('id')
      .single();
    if (sectionError || !section) {
      // Another save added this session's column at the same moment (the session_id unique index).
      if (sectionError && isUniqueViolation(sectionError)) {
        continue;
      }
      return { error: sectionError };
    }
    if (column.roles.length > 0) {
      const { error: roleError } = await supabase.from('rota_roles').insert(
        column.roles.map((role) => ({
          ...role,
          competition_id: competitionId,
          section_id: section.id,
        })),
      );
      if (roleError) {
        // Drop the empty column so the session can still be given one by Generate.
        await supabase.from('rota_sections').delete().eq('id', section.id);
        return { error: roleError };
      }
    }
  }

  return { error: null };
}

export type RotaColumnForSession = { sectionId: string; hasSignups: boolean };

// The rota column linked to a session, and whether anyone has signed up in it — read before the
// session is deleted (the delete unlinks the column, ON DELETE SET NULL).
export async function findRotaColumnForSession(
  supabase: Client,
  sessionId: string,
): Promise<{ column: RotaColumnForSession | null; error: unknown }> {
  const { data: section, error } = await supabase
    .from('rota_sections')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error || !section) {
    return { column: null, error };
  }
  const { data: roles, error: rolesError } = await supabase
    .from('rota_roles')
    .select('id')
    .eq('section_id', section.id);
  if (rolesError) {
    return { column: null, error: rolesError };
  }
  const roleIds = (roles ?? []).map((role) => role.id);
  if (roleIds.length === 0) {
    return {
      column: { sectionId: section.id, hasSignups: false },
      error: null,
    };
  }
  const { count, error: countError } = await supabase
    .from('rota_signups')
    .select('id', { count: 'exact', head: true })
    .in('role_id', roleIds);
  if (countError) {
    return { column: null, error: countError };
  }
  return {
    column: { sectionId: section.id, hasSignups: (count ?? 0) > 0 },
    error: null,
  };
}

// After its session is deleted: an empty column goes with it. One with volunteers in it stays (an
// organiser deletes it deliberately, after contacting them), as an ordinary column whose times no
// longer follow anything.
export async function retireRotaColumn(supabase: Client, column: RotaColumnForSession): Promise<{ error: unknown }> {
  if (!column.hasSignups) {
    const { error } = await supabase.from('rota_sections').delete().eq('id', column.sectionId);
    return { error };
  }
  const { error } = await supabase.from('rota_roles').update({ arrive_basis: null }).eq('section_id', column.sectionId);
  return { error };
}
