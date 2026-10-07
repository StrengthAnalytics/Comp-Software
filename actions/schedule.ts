'use server';

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/auth/guard';
import { compDays, flightRowsFor, orderSessionsChronologically } from '@/lib/sessions/schedule';
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
// sessions do. Session order follows the clock (lib/sessions/schedule.ts). The staff rota isn't
// touched: with no sessions before the build, no rota column can be linked to one, so the organiser
// builds the rota's columns from these sessions with "Generate from sessions" on the Rota page.
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
    const platformIdByName = new Map(existingPlatforms.map((platform) => [platform.name.trim().toLowerCase(), platform.id]));
    const missing = platforms.length === 1 ? [] : platforms.filter((name) => !platformIdByName.has(name.toLowerCase()));
    const createdPlatformIds: string[] = [];
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from('platforms')
        .insert(missing.map((name) => ({ competition_id: competitionId, name })))
        .select('id, name');
      if (error || !created) {
        Sentry.captureException(error ?? new Error('Schedule build created no platforms.'));
        return fail(BUILD_FAILED);
      }
      for (const platform of created) {
        createdPlatformIds.push(platform.id);
        platformIdByName.set(platform.name.toLowerCase(), platform.id);
      }
    }
    // Every name now has an id, except a one-platform meet's, which falls back as described above.
    const platformIds = platforms.map((name) => platformIdByName.get(name.toLowerCase()) ?? existingPlatforms[0]?.id ?? null);
    const platformNamesById = new Map(
      platformIds.flatMap((id, index) => (id ? [[id, platforms[index]] as const] : [])),
    );

    // Each session gets its id up front so its flights can reference it, and its sort_order from the
    // clock.
    const ordered = orderSessionsChronologically(
      sessions.map((session) => ({
        ...session,
        id: crypto.randomUUID(),
        session_date: session.date,
        lift_off_time: session.liftOffTime,
        platform_id: platformIds[session.platformIndex] ?? null,
      })),
      platformNamesById,
    );
    const sessionIds = ordered.map((session) => session.id);

    const { error: sessionsError } = await supabase.from('sessions').insert(
      ordered.map((session, sortOrder) => ({
        id: session.id,
        competition_id: competitionId,
        name: session.name,
        session_date: session.date,
        weigh_in_time: session.weighInTime,
        lift_off_time: session.liftOffTime,
        platform_id: session.platform_id,
        sort_order: sortOrder,
      })),
    );
    if (sessionsError) {
      Sentry.captureException(sessionsError);
      await undoBuild(supabase, [], createdPlatformIds);
      return fail(BUILD_FAILED);
    }

    const flights = ordered.flatMap((session) => flightRowsFor(competitionId, session.id, session.flightCount));
    const { error: flightsError } = await supabase.from('flights').insert(flights);
    if (flightsError) {
      Sentry.captureException(flightsError);
      await undoBuild(supabase, sessionIds, createdPlatformIds);
      return fail(BUILD_FAILED);
    }

    return ok({ sessionCount: sessionIds.length, flightCount: flights.length });
  });
}
