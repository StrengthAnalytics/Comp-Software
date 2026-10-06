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
      /rota                     ← staff rota builder (volunteer sign-up admin)
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
    /[comp-slug]/enter          ← public entry form: lifters self-register into the review inbox
    /[comp-slug]/volunteer      ← public staff-rota sign-up board (volunteers claim slots, sign-in-free)
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
- Tables with logical replication enabled: `attempts`, `referee_decisions`, `entries`, `flights`, `sessions`, plus the admin-only inboxes `entry_submissions`, `rota_signups` and `rota_change_requests` (subscriptions inherit RLS, so only admin sessions receive those).
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
- Permissions model: admins (email in `ADMIN_EMAILS`) can read and write everything; anon can read data belonging to publicly visible competitions only. There are no per-comp roles. Three deliberate anon-write exceptions, each a single INSERT-only policy with no anon read of the base table (all carry PII): `entry_submissions` (the public entry form's inbox, gated by `comp_accepts_entries()`); `rota_signups` (the public volunteer staff rota, gated by `comp_rota_open()` — the volunteer's name, but never email/phone, is exposed through the `public_rota_signups` view); and `rota_change_requests` (the rota's "Request a change" inbox, same `comp_rota_open()` gate). See ARCHITECTURE.md §3/§7. A comp's organiser email lives in the admin-only `competition_organisers` table (not on anon-readable `competitions`) and is never anon-readable; the two anonymous actions that email on a comp's behalf read it server-side with the service-role client (`lib/email/organiser.ts`). The public `*_` views (`public_lifters`, `public_rota_signups`, `public_rota_comps`) are SELECT-only: they run as their owner, so any write grant on one would bypass the base table's RLS — never grant anything but SELECT on a view.
- Typed Supabase client generated from the database schema. Regenerate types after every migration.
- Anon key used in client-side Supabase client only.
- Service role key only in server-side code: admin actions, plus the one fixed organiser-email lookup in `lib/email/organiser.ts` used by the anonymous entry submit and rota change request. Never exposed to the client.
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
- The form's design is per comp (`competitions.entry_form` jsonb + the `entry_form_open` accepting-entries toggle): name, sex and date of birth are always collected; club, membership number, division, weight class, predicted total, best comp total from the last 12 months (to help seed prime-time flights), kit (Raw/Equipped) and event (SBD/Bench-only) preference, instagram, email and phone are each off/optional/required; an optional disclaimer, when set, makes its acceptance tick mandatory. The submission Zod schema is built from the design (`buildSubmissionSchema`, `types/entry-form.ts`), so the server enforces exactly what the admin chose to ask.
- This is one of the app's three anonymous writes (the others are the volunteer staff rota's `rota_signups` and `rota_change_requests`): an INSERT-only RLS policy on `entry_submissions`, gated by `comp_accepts_entries()` (comp publicly visible + form open), no anon read. The submit action is one of the three server actions without `adminGuard()` (with the rota sign-up and change request); abuse is bounded by a honeypot plus a database insert trigger capping a comp at 500 pending submissions. Kit/event preference and the total questions are informational for the admin (kit and event remain per-comp settings).
- When the lifter gave an email, they are emailed on submit ("we've got your entry"), on approval ("you're in") and, if the admin leaves the reject card's tick on, on rejection — wording in `lib/entries/entry-emails.ts`, sent via `lib/email/resend.ts` with `after()` (never fails the action; skipped without `RESEND_API_KEY`; replies go to the comp's organiser email, else `RESEND_REPLY_TO_EMAIL`). The receipt and the rejection go to an unverified address, so they repeat only fixed-list values (the receipt lists weight class, division, kit, event), never the name or club the submitter typed. Links in every email use Vercel's own deployment address (`lib/email/request-origin.ts`), never the request's Host header.

### Team competitions
- Optional per-comp format (`is_team_competition`), full power only. A team is three lifters, one each on squat, bench and deadlift; each member contests only their assigned lift and weighs in individually.
- Members are entries tagged with `team_id` and `team_lift` — one member per lift per team. Deleting a team unassigns its members (it does not delete their registrations).
- Team score = sum of the three members' IPF GL points, each from that member's best lift. A member with no good lift contributes 0. Teams rank by total; there is no individual placing in this format.
- GL uses the full-power coefficients for all three roles, since the IPF has no single-squat or single-deadlift coefficient set (a deliberate house rule, not an official IPF score).
- The sessions & flights screen assigns whole teams to flights (all members move together), not individual lifters. Team standings render on the public results page.

### Volunteer staff rota
- A per-comp **staff rota** lets an organiser publish an online volunteer sign-up (replacing the staffing Google Sheet). Built in phases (all in): the backend, the admin builder (`/[comp-slug]/rota`), the public sign-up board (`/[comp-slug]/volunteer`, sign-in-free), and the admin contact-management view — the signed-up volunteers with their contact details, confirm-then-remove, an "+ Add volunteer" form on open slots, a contacts CSV export, live updates (`useRotaSignupsSubscription` + the shared debounced refresh), and a type-the-comp-name **Reset the rota** danger zone (`resetRotaAction`) that wipes all sections/roles/sign-ups (prompting a contacts export first). The data model is independent of the comp's own sessions/flights: `rota_sections` (grid columns, e.g. "Sat — AM", "Set-up", with an optional `day_label` banner + free-text `subtitle`), `rota_roles` (a job within a section — title, `arrive_by`, and a slot `capacity`), and `rota_signups` (a volunteer claiming a slot). The admin builder edits sections/roles through `adminGuard()` actions in `actions/rota.ts` and reorders by neighbour `sort_order` swap. A one-click **Generate from sessions** creates a column per session, pre-filled with default crew roles (`DEFAULT_ROTA_ROLE_TEMPLATE` — MC, Platform Manager, Spotters/Loaders, Refs, Weigh-in, Livestream, Refreshments), made idempotent by a nullable `rota_sections.session_id` link (only sessions without a column are added; `on delete set null`). Each generated role's arrive-by is auto-filled `ROTA_ARRIVE_BEFORE_MINUTES` (30) before the session's lift-off — or `ROTA_WEIGH_IN_ARRIVE_BEFORE_MINUTES` (10) before weigh-in for the weigh-in team — driven by each role's `arriveBasis`, and stored in the rota's "8:30am" style (`lib/rota/time.ts`; older 24-hour values are converted for display). A per-column **Duplicate to a session** (`duplicateRotaSectionToSessionAction`) copies a column's roles (not its sign-ups) onto a session that has no column yet.
- **The rota follows the session schedule.** A generated column stays linked to its session: after every session create/edit/delete (and platform rename/delete) the action runs `syncRotaWithSessions` (`lib/rota/sync.ts`, pure rules in `lib/rota/sync-plan.ts`), which rebuilds the column header from the session (read-only in the builder — edited on Sessions & flights), recalculates each job's arrive-by from its `rota_roles.arrive_basis` (`lift_off` = 30 min before lift-off, `weigh_in` = 10 min before weigh-in; null = a typed time, left alone), and keeps session columns in session order. A newly created session gets a column copied from its neighbour's (only once the rota has session columns); a deleted session's column goes too unless someone is signed up in it. Sync errors are logged to Sentry and never fail the session save.
- **Both the public board and the admin screen are a spreadsheet-style grid** (`components/rota/rota-grid.tsx`, layout in `lib/rota/grid.ts`): sessions as columns under day banners, jobs as rows (merged by title across columns), a green slot per volunteer and a grey one per open place, each column's usual arrive-by in its header and any different time (weigh-in) in the cell; on a phone it scrolls sideways with the job names pinned. Volunteers tap an open slot to sign up in a pop-up, and their name/email/mobile are remembered in that browser's localStorage (`lib/rota/remembered-volunteer.ts`) so later slots are one tap. The admin screen has three tabs: **Rota** (the grid — tap a name for contact details, Move or Remove; "+ Add" on an open slot, name only allowed — plus the change-request inbox) **Edit layout** (Generate, "Add a role to every column", per-column role/arrive-by/spaces editing, add column, Reset) and **Formatting** (`components/rota/rota-formatting.tsx` — line weights between jobs/sessions/days, line colour, filled/open slot, day-banner and header colours, striped rows, with a live preview; stored as `competitions.rota_style` jsonb, preset choices only — `types/rota-style.ts` → Tailwind classes in `lib/rota/style.ts` — and passed to both the admin grid and the public board). Lowering a role's spaces below the people already in it is refused (`updateRotaRoleAction`).
- **Admin builds and owns it; volunteers can only add themselves.** All structure edits and any removal/move are admin-only server actions (`adminGuard()`), like every other setup write. There is no self-service cancel — volunteers use the board's **Request a change** button (drop out / swap / something else, optional slot, message), which lands in `rota_change_requests` and shows on the admin Rota tab (live, badge count) until marked done, and emails the comp's organiser email (`competition_organisers`, set on the comp's edit screen and defaulting to the admin who created it; else `ROTA_NOTIFY_EMAILS`, else `ADMIN_EMAILS`) through Resend's HTTP API (`lib/email/resend.ts`, plain `fetch`, no SDK; sent with `after()` so it never slows or fails the saved request; skipped when `RESEND_API_KEY` is unset; never logs the volunteer's details); a drop-out whose name matches someone in the chosen slot gets a "remove and mark done", confirmed after showing the request's contact beside the sign-up's (anyone can type a name). An optional admin-set `rota_withdrawal_contact` line is still shown on the board. Rota settings live on the comp row (`rota_open` toggle + `rota_withdrawal_contact`). `rota_signups.email`/`phone` are nullable because an admin can add a helper by name only; the public sign-up still requires both.
- **The volunteer sign-up is the app's second fenced anonymous write** (`rota_signups`, INSERT-only), gated by `comp_rota_open()` rather than `is_comp_public()` — so the rota can open while the comp is still a draft (early crew recruiting). Abuse is bounded by a honeypot (`website`) plus a database trigger (`BEFORE INSERT OR UPDATE OF role_id`, so an admin move is covered too) that enforces each slot's `capacity` (serialised per slot with an advisory lock, so the last spot can't be double-booked) and refuses a slot from another comp. The change-request form is the **third** (`rota_change_requests`, INSERT-only, same gate), bounded by a honeypot plus a `BEFORE INSERT` trigger capping a comp at 200 open requests and rejecting a slot from another comp.
- **Names are public; contact details are admin-only.** The public board reads the volunteer's name through the PII-free `public_rota_signups` view; email/phone live only on the base table (never anon-readable, never logged to Sentry). A still-draft comp's header reads through the narrow `public_rota_comps` view (slug/name/dates/withdrawal-contact, plus `rota_open` and `rota_style` — nothing private). The admin rota view updates live (it subscribes to `rota_signups` and `rota_change_requests`); the public board is server-rendered (a sign-up sheet is not live competition state, so "never poll" does not force a subscription there — and anon can't subscribe to the PII base table anyway).

## Operational guardrails

- Do not run destructive commands (migrations, deletes, drops) without confirming with the operator first.
- Do not commit secrets. `.env.local` is git-ignored. Use Vercel environment variables for deployment.
- Do not modify the data model without updating the migration files, regenerating types, and updating RLS policies in the same commit.
- When in doubt about a permission, default to deny.
- Ask before installing new dependencies. Prefer adding to the existing stack over introducing new tools.
