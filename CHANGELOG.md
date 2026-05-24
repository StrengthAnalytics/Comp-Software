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
- Database foundation: sequential migrations in `/supabase/migrations` for the full data model (profiles, competitions, divisions, weight_classes, platforms, sessions, flights, lifters, entries, attempts, referee_decisions, comp_roles) plus the nine domain enums (`kit_type`, `event_type`, `comp_status`, `entry_status`, `lift_type`, `attempt_result`, `ref_position`, `ref_decision`, `comp_role`)
- Row Level Security on every table, mapped to the ARCHITECTURE.md permission matrix and enforced via `comp_roles` through SECURITY DEFINER helpers (`has_comp_role`, `has_any_comp_role`, `is_comp_public`, `lifter_in_public_comp`); a trigger grants the competition creator `meet_director`
- Logical replication enabled (`supabase_realtime` publication + `replica identity full`) on `attempts`, `referee_decisions`, `entries`, `flights`, `sessions`
- `lib/permissions/matrix.ts` typed permission matrix with `permittedRoles()` helper, plus `lib/permissions/require-role.ts` `requireRole()` guard and typed `AuthorizationError`; 100% unit coverage of the matrix in `tests/unit/permissions`
- `supabase/seed.sql` sample published full-power classic meet: IPF Open weight classes, seven divisions, one platform/session, two flights, sixteen lifters with entries, and a mid-squat-round set of attempts and referee decisions
- `package.json` with the full script set from `CONTRIBUTING.md` (`dev`, `build`, `lint`, `typecheck`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `test:e2e:ui`, `db:types`, `db:reset`, `db:seed`, `db:migration:new`)
- Next.js 16 baseline (App Router, Turbopack, TypeScript strict mode) with `(admin)`, `(overlay)`, and `(public)` route groups, each with its own root layout, plus placeholder `page.tsx` stubs for every route in the structure
- Tailwind CSS v4 via `@tailwindcss/postcss` with a minimal `app/globals.css`
- Supabase typed-client stubs in `/lib/supabase` (browser `client.ts`, server `server.ts`, service-role `admin.ts`) and a placeholder `types/database.types.ts` `Database` type
- `proxy.ts` session-cookie pass-through skeleton (no role logic yet)
- Sentry initialisation in `sentry/{client,server,edge}.ts`, wired through `instrumentation.ts` and `instrumentation-client.ts`, and `next.config.ts` wrapped in `withSentryConfig`
- ESLint flat config (`typescript-eslint`, `eslint-plugin-unicorn`, `@next/eslint-plugin-next`) enforcing kebab-case filenames
- Vitest + React Testing Library config (`vitest.config.ts`, `vitest.setup.ts`) and Playwright config (`playwright.config.ts`)
- `.env.example` documenting every environment variable (Supabase URL/anon/service-role keys, `SUPABASE_DB_URL`, Resend key, Sentry DSN/org/project/auth token, overlay signing secret)
- `.gitignore` and a `supabase/` directory with `migrations/` and a seed placeholder

### Changed
- Public read on `lifters` is scoped to lifters with an entry in a published competition, rather than exposing the full lifter directory. The directory remains staff-only (any `comp_roles` row). Enforced in RLS (`lifter_in_public_comp`) and represented in `/lib/permissions/matrix.ts` as a custom predicate rather than a plain R/W flag.
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
