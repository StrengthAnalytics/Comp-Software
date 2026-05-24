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

### Changed

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
