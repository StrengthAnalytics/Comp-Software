# Changelog

All notable changes to Comp-Software are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html): `major.minor.patch`.

- **Major**: breaking changes to the data model, public API, or operator-facing workflows
- **Minor**: new functionality, additive schema changes
- **Patch**: bug fixes, copy changes, internal refactors

Update the `[Unreleased]` section in every PR. Cut a new version entry when deploying to production.

---

## [Unreleased]

### Added
- Admin OTP sign-in at `/auth`: two-step email + 6-digit code form (`components/auth/sign-in-form.tsx`) backed by `actions/auth.ts` (`requestOtp`, `verifyOtp`, `signOut`). OTP requests are restricted to `ADMIN_EMAILS` (defense-in-depth on top of disabled public sign-ups) with `shouldCreateUser: false`
- Route protection: `proxy.ts` redirects unauthenticated visitors away from `/comps`, and the `(admin)` layout is now an async server component that gates on `isAdmin()` and renders the admin chrome (nav + signed-in email + sign-out)
- Competition setup UI under `/comps`: list, create (`/comps/new`), and edit (`/comps/[id]/edit`) screens. The edit screen manages the comp plus its divisions and weight classes, including a "Seed IPF defaults" button for the standard classic divisions and weight classes
- Server actions for competition setup (`actions/competitions.ts`, `actions/divisions.ts`, `actions/weight-classes.ts`): each calls `requireAdmin()` via the `adminGuard()` helper, validates with Zod, is wrapped in `Sentry.withServerActionInstrumentation`, and returns a typed `ActionResult` rather than leaking raw DB errors (unique-violation mapped to friendly messages)
- Shared Zod schemas and a `slugify` helper in `/types` (`competition.ts`, `auth.ts`), an `ActionResult` discriminated union (`types/action-result.ts`), `toFieldErrors` (`lib/validation.ts`), and IPF default divisions/weight-class data plus enum labels in `lib/constants.ts`
- Unit tests for the competition and auth Zod schemas (`tests/unit/competition`, `tests/unit/auth/auth-schema.test.ts`)
- Database foundation: sequential migrations in `/supabase/migrations` for the full data model (profiles, competitions, divisions, weight_classes, platforms, sessions, flights, lifters, entries, attempts, referee_decisions) plus the eight domain enums (`kit_type`, `event_type`, `comp_status`, `entry_status`, `lift_type`, `attempt_result`, `ref_position`, `ref_decision`)
- Row Level Security on every table: admins (any authenticated session) read and write everything; anon reads data belonging to publicly visible competitions, gated by SECURITY DEFINER helpers (`is_comp_public`, `lifter_in_public_comp`)
- `public_lifters` view exposing only non-PII lifter fields (name, gender, club, country) to anon, scoped to lifters in a publicly visible competition; the base `lifters` table is admin-only (full PII)
- Logical replication enabled (`supabase_realtime` publication + `replica identity full`) on `attempts`, `referee_decisions`, `entries`, `flights`, `sessions`
- `lib/auth/admin.ts` admin allowlist (`isAdmin`, `requireAdmin`) checked against the `ADMIN_EMAILS` env var, with typed `AuthorizationError`; 100% unit coverage in `tests/unit/auth`
- `package.json` with the full script set from `CONTRIBUTING.md` (`dev`, `build`, `lint`, `typecheck`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `test:e2e:ui`, `db:types`, `db:reset`, `db:seed`, `db:migration:new`)
- Next.js 16 baseline (App Router, Turbopack, TypeScript strict mode) with `(admin)`, `(overlay)`, and `(public)` route groups, each with its own root layout, plus placeholder `page.tsx` stubs for every route in the structure
- Tailwind CSS v4 via `@tailwindcss/postcss` with a minimal `app/globals.css`
- Supabase typed-client stubs in `/lib/supabase` (browser `client.ts`, server `server.ts`, service-role `admin.ts`) and a placeholder `types/database.types.ts` `Database` type
- `proxy.ts` session-cookie pass-through skeleton (no role logic yet)
- Sentry initialisation in `sentry/{client,server,edge}.ts`, wired through `instrumentation.ts` and `instrumentation-client.ts`, and `next.config.ts` wrapped in `withSentryConfig`
- ESLint flat config (`typescript-eslint`, `eslint-plugin-unicorn`, `@next/eslint-plugin-next`) enforcing kebab-case filenames
- Vitest + React Testing Library config (`vitest.config.ts`, `vitest.setup.ts`) and Playwright config (`playwright.config.ts`)
- `.env.example` documenting every environment variable (Supabase URL/anon/service-role keys, `SUPABASE_DB_URL`, Resend key, Sentry DSN/org/project/auth token, `ADMIN_EMAILS` admin allowlist)
- `.gitignore` and a `supabase/` directory with `migrations/`

### Changed
- Simplified the auth model to an admin allowlist (`ADMIN_EMAILS`) plus anonymous public read of published comps. Removed the role-based permission matrix, the `comp_roles` table, the `comp_role` enum, `requireRole()`, the role helpers (`has_comp_role`, `has_any_comp_role`), the creator-grants-meet_director trigger, and the per-comp `overlay_key` and `created_by` columns. Overlays now run on the admin session (no separate overlay auth). See the ADR in ARCHITECTURE.md section 7. Writes rely on `requireAdmin()` in server actions as the sole gate, which requires public sign-ups to stay disabled.
- Public read on `lifters` exposes only non-PII fields: anon reads the `public_lifters` view (name, gender, club, country — no date of birth, no IPF member ID), scoped to lifters in a publicly visible comp; the base table is admin-only.
- Documentation updated to reflect online-only, hosted-first development workflow (no local Next.js or Supabase; migrations applied via the Supabase SQL editor; `types/database.types.ts` hand-authored to match)
- The `@sentry/cli` install build script is currently unapproved (pnpm `onlyBuiltDependencies`). It must be approved before the first production deploy, since Sentry source-map upload runs at build time and depends on the `sentry-cli` binary.
- Email delivery: Supabase default SMTP service used in development until a production domain is registered. Resend integration (per CLAUDE.md and ARCHITECTURE.md) deferred until then. No code changes required at switchover; only Supabase Auth SMTP settings.

### Deprecated

### Removed

### Fixed

### Security

---

## [0.1.0] - 2026-05-24

### Added
- Initial project scaffolding
- `CLAUDE.md` anchor file for AI coding sessions
- `ARCHITECTURE.md` documenting system design, data model, permission matrix, and real-time subscription map
- `CONTRIBUTING.md` with branch naming, commit conventions, PR checklist, and local dev setup
- Next.js 16.2.6+ App Router project structure with `(admin)`, `(overlay)`, and `(public)` route groups
- Supabase client setup (`/lib/supabase`), typed against the database schema
- `proxy.ts` for authenticated route protection
- Sentry configuration for client, server, and edge
- Vitest, React Testing Library, and Playwright test runners configured
- ESLint with `@typescript-eslint` and `eslint-plugin-unicorn`
