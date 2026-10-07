'use server';

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { syncRotaWithSessions } from '@/lib/rota/sync';
import { compDays, flightNames, orderSessionsChronologically } from '@/lib/sessions/schedule';
import { buildScheduleSchema, type BuildScheduleInput } from '@/types/schedule';
import { toFieldErrors } from '@/lib/validation';
import { fail, ok, type ActionResult } from '@/types/action-result';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

const BUILD_FAILED = 'Could not create the schedule. Please try again.';

// Removes what a failed build had already created, so a retry starts clean. Deleting the sessions
// cascades to their flights.
async function undoBuild(supabase: Client, sessionIds: string[], platformIds: string[]): Promise<void> {
  const results = await Promise.all([
    sessionIds.length > 0 ? supabase.from('sessions').delete().in('id', sessionIds) : null,
    platformIds.length > 0 ? supabase.from('platforms').delete().in('id', platformIds) : null,
  ]);
  for (const result of results) {
    if (result?.error) {
      Sentry.captureException(result.error);
    }
  }
}

// The guided schedule builder's create: every platform, session and flight for a comp that has no
// sessions yet, in one go. Platform names that already exist on the comp are reused; a one-platform
// meet on a comp with no platforms keeps the single default platform (no row), as hand-built
// sessions do. Session order follows the clock (lib/sessions/schedule.ts). Afterwards the staff rota
// is told about every new session at once, so a rota already built from sessions gains their columns.
export async function buildScheduleAction(
  input: BuildScheduleInput,
): Promise<ActionResult<{ sessionCount: number; flightCount: number }>> {
  return Sentry.withServerActionInstrumentation('buildSchedule', async () => {
    const guard = await adminGuard();
    if (guard) return guard;

    const parsed = buildScheduleSchema.safeParse(input);
    if (!parsed.success) {
      return fail('Please fix the highlighted fields.', toFieldErrors(parsed.error));
    }
    const { competitionId, platforms, sessions } = parsed.data;

    const supabase = await createClient();

    const [compResult, existingSessionsResult, existingPlatformsResult] = await Promise.all([
      supabase.from('competitions').select('starts_on, ends_on').eq('id', competitionId).maybeSingle(),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId),
      supabase.from('platforms').select('id, name').eq('competition_id', competitionId),
    ]);
    const readError = compResult.error ?? existingSessionsResult.error ?? existingPlatformsResult.error;
    if (readError) {
      Sentry.captureException(readError);
      return fail(BUILD_FAILED);
    }
    if (!compResult.data) {
      return fail('Could not find that competition.');
    }
    if ((existingSessionsResult.count ?? 0) > 0) {
      return fail('This competition already has sessions. Add or change them on the Sessions & flights page.');
    }

    const days = new Set(compDays(compResult.data.starts_on, compResult.data.ends_on));
    if (!sessions.every((session) => days.has(session.date))) {
      return fail("Every session must be on one of the competition's days. Check the comp dates on Setup.");
    }

    // Resolve each platform: reuse one the comp already has by name; otherwise create it. A
    // one-platform meet never adds a platform: it uses the comp's existing one if it has any, else the
    // single default platform (no row), as hand-built sessions do.
    const existingPlatforms = existingPlatformsResult.data ?? [];
    const platformIds: (string | null)[] = [];
    const createdPlatformIds: string[] = [];
    for (const name of platforms) {
      const existing = existingPlatforms.find((platform) => platform.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        platformIds.push(existing.id);
        continue;
      }
      if (platforms.length === 1) {
        platformIds.push(existingPlatforms[0]?.id ?? null);
        continue;
      }
      const { data: created, error } = await supabase
        .from('platforms')
        .insert({ competition_id: competitionId, name })
        .select('id')
        .single();
      if (error || !created) {
        Sentry.captureException(error);
        await undoBuild(supabase, [], createdPlatformIds);
        return fail(BUILD_FAILED);
      }
      createdPlatformIds.push(created.id);
      platformIds.push(created.id);
    }

    // Number the sessions in time order; the index into `sessions` stands in for an id until insert.
    const platformNamesById = new Map(
      platformIds.flatMap((id, index) => (id ? [[id, platforms[index]] as const] : [])),
    );
    const ordered = orderSessionsChronologically(
      sessions.map((session, index) => ({
        id: String(index).padStart(4, '0'),
        index,
        name: session.name,
        session_date: session.date,
        lift_off_time: session.liftOffTime,
        platform_id: platformIds[session.platformIndex] ?? null,
      })),
      platformNamesById,
    );

    const { data: insertedSessions, error: sessionsError } = await supabase
      .from('sessions')
      .insert(
        ordered.map((row, sortOrder) => {
          const session = sessions[row.index];
          return {
            competition_id: competitionId,
            name: session.name,
            session_date: session.date,
            weigh_in_time: session.weighInTime,
            lift_off_time: session.liftOffTime,
            platform_id: row.platform_id,
            sort_order: sortOrder,
          };
        }),
      )
      .select('id, sort_order');
    if (sessionsError || !insertedSessions || insertedSessions.length !== ordered.length) {
      Sentry.captureException(sessionsError ?? new Error('Schedule build inserted an unexpected number of sessions.'));
      await undoBuild(
        supabase,
        (insertedSessions ?? []).map((row) => row.id),
        createdPlatformIds,
      );
      return fail(BUILD_FAILED);
    }

    // sort_order is unique within this build, so it maps each inserted row back to its draft session.
    const sessionIdBySortOrder = new Map(insertedSessions.map((row) => [row.sort_order, row.id]));
    const sessionIds = insertedSessions.map((row) => row.id);
    const flights = ordered.flatMap((row, sortOrder) => {
      const sessionId = sessionIdBySortOrder.get(sortOrder);
      if (!sessionId) {
        return [];
      }
      return flightNames(sessions[row.index].flightCount).map((name, flightOrder) => ({
        competition_id: competitionId,
        session_id: sessionId,
        name,
        sort_order: flightOrder,
      }));
    });

    const { error: flightsError } = await supabase.from('flights').insert(flights);
    if (flightsError) {
      Sentry.captureException(flightsError);
      await undoBuild(supabase, sessionIds, createdPlatformIds);
      return fail(BUILD_FAILED);
    }

    const rota = await syncRotaWithSessions(supabase, competitionId, { addColumnFor: sessionIds });
    if (rota.error) {
      Sentry.captureException(rota.error);
    }

    return ok({ sessionCount: sessionIds.length, flightCount: flights.length });
  });
}
