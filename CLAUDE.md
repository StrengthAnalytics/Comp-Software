# Comp-Software — CLAUDE.md

This file is read by AI coding assistants at the start of every session. Read it fully before writing or modifying code.

## Project overview

Comp-Software is a web app for organising and running IPF-affiliated powerlifting competitions. It replaces tools like LiftingCast with a system built around our specific operational needs and bespoke livestream overlays.

The platform supports:
- Competition setup (divisions, weight classes, platforms, sessions, flights)
- Lifter registration and weigh-in
- Live scorekeeping (attempts, referee decisions, real-time scoreboard)
- Admin-operated live scorekeeping during a meet (attempts, referee decisions, flight management)
- OBS-ready broadcast overlays consuming the same real-time data
- Public live scoreboard and final results

We host and run 4-6 comps per year. The system must run reliably across multiple devices at the same venue with sub-second update latency.

## Tech stack

- Next.js 16.2.6+ (App Router, Turbopack default bundler)
- TypeScript (strict mode)
- Supabase (Postgres, auth, real-time)
- Supabase Auth: email + password sign-in for admins (allowlisted via `ADMIN_EMAILS`) in the initial build; switch to 6-digit OTP for production. Public has no accounts
- Vercel deployment
- Resend API as Supabase SMTP provider for auth emails
- Tailwind CSS v4 with CSS custom property tokens
- Sentry (@sentry/nextjs) for error monitoring and performance tracing
- Vitest for unit and integration tests
- React Testing Library for component tests
- Playwright for end-to-end tests
- ESLint with @typescript-eslint and eslint-plugin-unicorn
- proxy.ts for middleware (middleware.ts is deprecated in v16)

This project is developed online-only against the hosted Supabase dev project and Vercel preview deployments. There is no local Next.js server or local Supabase instance — ever. See `CONTRIBUTING.md` for the workflow.

## Project structure

```
/app
  /(admin)                      ← auth-gated staff routes, full chrome
    /comps                      ← comp list, comp setup
    /[comp-slug]
      /entries                  ← lifter registration, inline weigh-in editing
      /weigh-in                 ← day-of weigh-in by session (bodyweight, openers, rack settings)
      /rack-heights             ← squat/bench rack settings by session (warm-up room, mobile-friendly)
      /run                      ← scorekeeper interface
      /refs                     ← ref panel (v2)
      /flights                  ← sessions & flight management
      /teams                    ← team management (team competitions only)
  /(display)                    ← auth-gated full-screen venue displays, no chrome (sidebar/header)
    /[comp-slug]
      /loading                  ← platform loading-crew display (per-platform via ?platform=)
  /(overlay)                    ← OBS browser sources, transparent bg, fixed dimensions
    /[comp-slug]
      /scoreboard               ← current scoreboard overlay
      /lifter                   ← on-deck / in-the-hole / on-platform overlay
      /attempt                  ← current attempt + ref lights overlay
      /weight-class             ← weight class standings overlay
  /(public)                     ← public-facing views
    /[comp-slug]                ← comp landing page
    /[comp-slug]/live           ← live scoreboard for venue TVs and socials
    /[comp-slug]/results        ← final results
  /auth                         ← sign-in (email + password; OTP for production)
  /account                      ← profile management
/components                     ← shared UI
/components/overlay             ← overlay-specific components
/components/scorekeeper         ← head table UI
/lib                            ← utilities, helpers, constants
/lib/supabase                   ← typed Supabase client setup
/lib/realtime                   ← Supabase real-time subscription helpers
/lib/scoring                    ← IPF scoring formulas (IPF GL, Wilks, DOTS) — pure functions
/lib/auth                       ← admin allowlist (ADMIN_EMAILS) and requireAdmin()
/actions                        ← server actions, one file per domain
/types                          ← shared TypeScript types and Zod schemas
/tests/unit                     ← Vitest
/tests/e2e                      ← Playwright
/sentry                         ← Sentry config
proxy.ts                        ← replaces middleware.ts in Next.js 16
```

## Coding conventions

- TypeScript strict mode. No `any`. No type assertions without an inline comment explaining why.
- Named exports only. Exceptions: `page.tsx` and `layout.tsx` default exports.
- Client components are the default for `/(admin)/run`, `/(display)/[comp-slug]/loading`, `/(overlay)`, and the live public scoreboard. Server components elsewhere.
- All mutations via server actions. Never call Supabase from the client for writes.
- Client-side Supabase is read-only and primarily for real-time subscriptions.
- Environment variables: `NEXT_PUBLIC_` prefix only for values safe to expose to the browser. Service role key is server-only and never logged.
- Zod for all input validation at the boundary (server actions, route handlers).
- Error handling: never swallow errors silently. Log to Sentry in production. Surface user-friendly messages to the UI.
- No inline styles. Tailwind utility classes only.
- No magic numbers. Constants live in `/lib/constants.ts`.
- File and directory names: kebab-case (e.g. `flight-builder.tsx`).

## Real-time conventions

This app is real-time first. Non-negotiable.

- Every screen displaying live competition state (scorekeeper, overlays, public live view) subscribes to Postgres changes via Supabase real-time. Never poll.
- Subscriptions are scoped per competition (filter on `competition_id`) to keep payloads small.
- Subscription setup lives in `/lib/realtime` as typed hooks (`useAttemptsSubscription`, `useEntriesSubscription`, `useFlightsSubscription`, etc.), not inline in components.
- Tables with logical replication enabled: `attempts`, `referee_decisions`, `entries`, `flights`, `sessions`.
- Real-time subscriptions inherit RLS. If the user can't read the row, they won't get the update.

## Optimistic update pattern

At the head table the operator cannot wait for a round-trip. Standard pattern for all live mutations:

1. Update local state immediately on user action.
2. Fire the server action in the background.
3. If the action fails, roll back local state and surface a toast.
4. If the action succeeds, the real-time subscription reconciles (usually a no-op since local state already matches).

Use React `useOptimistic` where it fits. Otherwise hand-roll with local state plus try/catch around the action call.

## Supabase conventions

- Row Level Security (RLS) on every table. No exceptions.
- Permissions model: admins (email in `ADMIN_EMAILS`) can read and write everything; anon can read data belonging to publicly visible competitions only. There are no per-comp roles.
- Typed Supabase client generated from the database schema. Regenerate types after every migration.
- Anon key used in client-side Supabase client only.
- Service role key only in server-side admin actions. Never exposed to the client.
- Always check auth session server-side before any mutation. Helper: `requireAdmin()` in `/lib/auth`. Writes rely on this as the sole gate, which is safe only while public sign-ups stay disabled.
- Migration files are the source of truth for schema. Never edit the database via the Supabase dashboard in a way that diverges from migrations.

## Sentry conventions

- Initialise Sentry in `sentry/client.ts`, `sentry/server.ts`, `sentry/edge.ts`.
- Wrap all server actions in `Sentry.withServerActionInstrumentation`.
- Use `Sentry.captureException` for caught errors.
- Set user context on Sentry after successful auth (user id and email).
- Source maps uploaded to Sentry on every Vercel deployment.

## Testing conventions

- Scoring formulas in `/lib/scoring` must have 100% unit test coverage. Non-negotiable.
- The admin allowlist in `/lib/auth/admin.ts` must have 100% unit test coverage. It is the only gate on who can write during a meet.
- Vitest for unit and integration tests.
- React Testing Library for component tests. Test behaviour not implementation.
- Playwright for end-to-end tests covering critical flows:
  1. Sign in (email + password; OTP for production)
  2. Create a comp, add weight classes and divisions
  3. Register a lifter
  4. Check in and assign to flight
  5. Run a flight: enter attempts, mark referees, advance lifter
  6. Verify overlay updates in real-time

## Key business logic

### Competition structure
- Federation: IPF-affiliated (other federations deferred).
- Kit type: classic or equipped, set per comp.
- Event type: full power (SBD), bench only, or deadlift only.
- Weights and bodyweights stored in kg with one decimal place.
- Each comp owns its own divisions and weight classes (rule sets change year to year).
- A comp can be a team competition (`is_team_competition`, full power only) — see Team competitions below.

### Attempt lifecycle
- Each entry has up to 9 attempts (3 squats, 3 benches, 3 deadlifts).
- Attempt order within a flight: by declared weight ascending, then by lot number ascending at equal weights.
- Attempt result values: pending, good_lift, no_lift, not_taken, withdrawn.
- The scorekeeper is the authority and can set any attempt's weight at any time (to fix entry errors). The enforced guard is a progression check against the *previous* attempt: a 2nd or 3rd attempt must be heavier than the previous attempt if it was a good lift, or at least the same if it was a no lift (a repeat is allowed after a miss). First attempts are unconstrained. The guard lives in `lib/attempts/weight-rule.ts` (`validateAttemptWeight`). (This supersedes the original "one increase, no decrease" rule and its `weight_changes` counter, which is no longer enforced.)
- Best successful attempt per lift counts toward the total.

### Referee decisions
- Exactly 3 referees per attempt: left, head, right.
- Each gives a white or red decision.
- Good lift = 2+ whites. No lift = 2+ reds.
- Reasons (depth, pressdown, downward motion, etc.) attach to red decisions.

### Scoring
- Total = best squat + best bench + best deadlift.
- Placement by total within (weight class × division × gender × kit type).
- IPF GL points, Wilks, DOTS as parallel ranking metrics. Pure functions in `/lib/scoring`.

### Team competitions
- Optional per-comp format (`is_team_competition`), full power only. A team is three lifters, one each on squat, bench and deadlift; each member contests only their assigned lift and weighs in individually.
- Members are entries tagged with `team_id` and `team_lift` — one member per lift per team. Deleting a team unassigns its members (it does not delete their registrations).
- Team score = sum of the three members' IPF GL points, each from that member's best lift. A member with no good lift contributes 0. Teams rank by total; there is no individual placing in this format.
- GL uses the full-power coefficients for all three roles, since the IPF has no single-squat or single-deadlift coefficient set (a deliberate house rule, not an official IPF score).
- The sessions & flights screen assigns whole teams to flights (all members move together), not individual lifters. Team standings render on the public results page.

## Operational guardrails

- Do not run destructive commands (migrations, deletes, drops) without confirming with the operator first.
- Do not commit secrets. `.env.local` is git-ignored. Use Vercel environment variables for deployment.
- Do not modify the data model without updating the migration files, regenerating types, and updating RLS policies in the same commit.
- When in doubt about a permission, default to deny.
- Ask before installing new dependencies. Prefer adding to the existing stack over introducing new tools.
