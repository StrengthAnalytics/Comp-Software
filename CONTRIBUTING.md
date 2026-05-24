# Contributing to Comp-Software

## Local development

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in values (Supabase URL and keys, Resend API key, Sentry DSN)
3. `pnpm install`
4. `pnpm db:types` to regenerate the typed Supabase client from the current schema
5. `pnpm dev` to start the Next.js dev server on port 3000

If you're running a fresh local Supabase instance:

1. `pnpm db:reset` to apply all migrations
2. `pnpm db:seed` to load a sample comp with lifters and a partial flight

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
- [ ] If the data model changed: migration committed, types regenerated, RLS policies updated, all in the same commit
- [ ] If a new role permission added: permission matrix tests updated and `ARCHITECTURE.md` table refreshed
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

The migration files in `/supabase/migrations` are the source of truth. Never edit the production database via the Supabase dashboard in a way that diverges from migrations.

To make a schema change:

1. Create a new migration via `pnpm db:migration:new <name>`
2. Edit the generated SQL file
3. Apply locally with `pnpm db:reset`
4. Regenerate types with `pnpm db:types`
5. Update affected RLS policies in the same commit
6. Update the permission matrix tests if the change affects access

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
