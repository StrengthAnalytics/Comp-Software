# Comp-Software — CLAUDE.md

This file is read by AI coding assistants at the start of every session. Read it fully before writing or modifying code.

## Project overview

Comp-Software is a web app for organising and running IPF-affiliated powerlifting competitions. It replaces tools like LiftingCast with a system built around our specific operational needs and bespoke livestream overlays.

The platform supports:
- Competition setup (age categories, weight classes, platforms, sessions, flights)
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
    /records/manage             ← UK regional/national records management (app-global; public browser is /records)
    /[comp-slug]
      /checklist                ← comp dashboard: status badge, stat cards, setup checklist
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
    /records                    ← public UK records browser (app-global, sign-in-free)
    /[comp-slug]                ← comp landing page
    /[comp-slug]/live           ← live scoreboard for venue TVs and socials (planned)
    /[comp-slug]/warm-up        ← warm-up room board: read-only run scoresheet + up-next, sign-in-free (per-platform via ?platform=)
    /[comp-slug]/results        ← final results
    /[comp-slug]/enter          ← public entry form: lifters self-register into the review inbox (planned)
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
- Named exports only. Exceptions: the Next App Router files that the framework loads by default export — `page.tsx`, `layout.tsx`, and the route convention files (`error.tsx`, `not-found.tsx`, `loading.tsx`, `global-error.tsx`).
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

The run screen (the source of truth every other screen reads) uses an offline-resilient variant of this pattern: instead of failing the mutation on a dropped connection, every edit goes through an in-memory + `localStorage` outbox (`lib/scorekeeper/outbox.ts`) that holds it and replays it on reconnect. Step 3 differs accordingly — a *transport* failure holds the edit and retries; a *deterministic* rejection (e.g. the progression guard) surfaces the message in a `role="alert"` banner and, once the queue has drained, re-pulls the authoritative server snapshot (`router.refresh()`) to converge rather than rolling back a single cell. See the "Run screen … offline-resilient" entry in CHANGELOG.md.

## Supabase conventions

- Row Level Security (RLS) on every table. No exceptions.
- Permissions model: admins (email in `ADMIN_EMAILS`) can read and write everything; anon can read data belonging to publicly visible competitions only. There are no per-comp roles. One deliberate exception: `entry_submissions` (the public entry form's inbox) carries the app's single anon write — INSERT only, gated by `comp_accepts_entries()`, with no anon read (submissions carry PII). See ARCHITECTURE.md §3/§7.
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
  2. Create a comp, add weight classes and age categories
  3. Register a lifter
  4. Check in and assign to flight
  5. Run a flight: enter attempts, mark referees, advance lifter
  6. Verify overlay updates in real-time

## Key business logic

### Competition structure
- Federation: a per-comp rule-set choice fixed at creation — `ipf` (the standard IPF age categories and weight classes are seeded automatically and locked: the Setup screen shows them read-only and the category write actions reject edits via `requireEditableCategories` in `lib/comps/category-guard.ts`) or `custom` (the operator builds their own). Stored as text on `competitions`, constrained by a database CHECK and Zod (`competitionCreateSchema`). The Checklist page omits the category steps for an `ipf` comp.
- Kit type: classic or equipped, set per comp.
- Event type: full power (SBD), bench only, or deadlift only.
- Lift weights stored in kg to one decimal place (0.5 kg increments). Bodyweights and weight-class bounds stored to two decimal places (IPF weigh-in precision, 0.01 kg). Weight-class bounds are inclusive on both ends, each class's lower bound sitting 0.01 kg above the class below's upper, so a boundary is unambiguous (83.00 kg is the -83 class, 83.01 kg is -93).
- Each comp owns its own age categories and weight classes (rule sets change year to year); for an `ipf`-federation comp that set is the locked standard, for `custom` it is operator-edited. ("Age category" is the lifter's IPF age band — U16–M6 — stored in the `age_categories` table; the word "division" means the British Powerlifting region/home nation a lifter competes on behalf of.)
- A lifter's **division** (BP region) is an informational attribute on the entry (the `entries.division` free-text column, constrained by the app to the fixed `BP_DIVISIONS` list in `lib/constants.ts`). It is set on the entries (registration) screen and shown on the boards, but it is **not** a placement dimension — placement stays weight class × age category × gender × kit type.
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
- Placement by total within (weight class × age category × gender × kit type).
- IPF GL points, Wilks, DOTS as parallel ranking metrics. Pure functions in `/lib/scoring`.

### Public entry form
- Lifters can self-register via a shareable, comp-specific public form (`/[comp-slug]/enter`). Submissions land in the `entry_submissions` holding table — never directly in `lifters`/`entries` — and wait as red-tinted review cards on the entries screen until an admin approves (which runs the standard registration path and stamps the submission) or rejects them. See the ADR in ARCHITECTURE.md §7.
- The form's design is per comp (`competitions.entry_form` jsonb + the `entry_form_open` accepting-entries toggle): name, sex and date of birth are always collected; club, membership number, division, weight class, predicted total, kit (Raw/Equipped) and event (SBD/Bench-only) preference, instagram, email and phone are each off/optional/required; an optional disclaimer, when set, makes its acceptance tick mandatory. The submission Zod schema is built from the design (`buildSubmissionSchema`, `types/entry-form.ts`), so the server enforces exactly what the admin chose to ask.
- This is the app's only anonymous write: an INSERT-only RLS policy on `entry_submissions`, gated by `comp_accepts_entries()` (comp publicly visible + form open), no anon read. The submit action is the one server action without `adminGuard()`; kit/event preference and predicted total are informational for the admin (kit and event remain per-comp settings).

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
