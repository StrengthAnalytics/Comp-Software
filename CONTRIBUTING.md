# Contributing to Comp-Software

## Development workflow

This project is developed online-only. There is no local Next.js server and no local Supabase instance — all work runs against the hosted Supabase dev project and Vercel preview deployments.

- **Branches and previews.** Push a branch to GitHub and Vercel auto-deploys a preview for it. You exercise your changes against that preview URL, which reads from the hosted Supabase dev project. There is nothing to run on your machine.
- **Environment variables.** Managed in Vercel (project settings) and mirrored to Supabase via the Vercel ↔ Supabase integration. Do not keep a local `.env.local`; the preview deployment supplies the runtime config.
- **Migrations and types.** Claude Code writes the migration SQL into `/supabase/migrations/*.sql`. The operator applies it manually through the Supabase SQL editor against the hosted dev project. Claude Code then hand-updates `types/database.types.ts` to match the new schema, and both land in the same commit. (See "Database changes" below.)

The `db:*` scripts in `package.json` (`db:reset`, `db:seed`, `db:types`, `db:migration:new`) and `pnpm dev` are retained for a possible future local setup, but are not part of this workflow today.

## Branch naming

Branch names are kebab-case with a prefix.

- `feature/*` for new functionality
- `fix/*` for bug fixes
- `chore/*` for tooling, dependency upgrades, refactors
- `docs/*` for documentation only

Examples:

- `feature/flight-builder`
- `fix/attempt-order-at-equal-weights`
- `chore/upgrade-next-16-3`
- `docs/architecture-permission-matrix`

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) format.

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `style`.

Examples:

- `feat(scorekeeper): add optimistic update for attempt result`
- `fix(realtime): scope subscriptions to current session`
- `chore(deps): bump @sentry/nextjs to 9.3.0`
- `docs(architecture): add v2 referee role to permission matrix`

## PR checklist

Before opening a PR:

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm test:e2e` passes for any touched user flow
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] If the data model changed: migration committed, `types/database.types.ts` hand-updated to match, RLS policies updated, all in the same commit
- [ ] If the auth/access model changed: `/lib/auth` tests updated and `ARCHITECTURE.md` sections 3 and 5 refreshed
- [ ] Screenshots or screen recordings attached for any UI change
- [ ] One reviewer minimum before merge to `main`

## Testing

| Command | Purpose |
|---------|---------|
| `pnpm test` | Vitest unit and integration tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Coverage report |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm test:e2e:ui` | Playwright UI mode for debugging |

Non-negotiable coverage:

- `/lib/scoring` must hit 100% unit test coverage
- `/lib/permissions/matrix.ts` must hit 100% unit test coverage

## Database changes

The migration files in `/supabase/migrations` are the source of truth. Never edit the hosted database via the Supabase dashboard in a way that diverges from migrations.

Schema changes follow the online-only workflow:

1. Claude Code adds a new timestamped migration file in `/supabase/migrations/` (RLS policy changes included in the same file).
2. The operator applies it by hand via the Supabase SQL editor against the hosted dev project.
3. Claude Code hand-updates `types/database.types.ts` to match the new schema.
4. Claude Code updates the permission matrix and its tests if the change affects access.
5. Migration, types, and any matrix/test changes are committed together.

## Working with AI coding assistants

Always start a session by asking the assistant to read `CLAUDE.md` first. Confirm it has done so before requesting code changes.

Do not let the assistant run destructive commands (database drops, force pushes, mass deletes, dependency removals) without explicit approval per `CLAUDE.md`.

Hold the assistant to the conventions in `CLAUDE.md`. If a generated change violates them (default exports, inline styles, direct client-side database writes, missing RLS, untyped Supabase calls), reject and ask for a corrected version rather than accepting and patching.

## Release process

1. Cut a release branch from `main`: `release/v0.x.0`
2. Move `[Unreleased]` entries in `CHANGELOG.md` to a new `[0.x.0]` section with today's date
3. Bump `version` in `package.json`
4. Open a PR, review, merge
5. Tag the merge commit: `git tag v0.x.0 && git push origin v0.x.0`
6. Vercel auto-deploys from `main`
7. Verify Sentry release is tagged and source maps uploaded
