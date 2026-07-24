# Runtime and Tooling Map

## Package Manager and Workspaces

This repo uses npm workspaces. Workspace globs are in `package.json:6-9`. The web app declares local package dependencies in `apps/web/package.json:12-19`.

## Scripts

| Command | Source | Purpose | Verified? |
| --- | --- | --- | --- |
| `npm run dev` | `package.json:11` | Starts web dev server through workspace | previously verified by build setup, not run in this pass |
| `npm run build` | `package.json:12` | Builds Next app | previously passed |
| `npm run typecheck` | `package.json:14` | Runs root TypeScript check | previously passed |
| `npm run test` | `package.json:15` | Runs Vitest suite | previously passed |
| `npm run lint` | `package.json:17` | Runs Next lint | previously passed |
| `npm run db:start` | `package.json:18` | Starts Docker Postgres | previously failed because daemon was not running |
| `npm run db:push` | `package.json:22` | Applies Prisma schema | requires DB |
| `npm run db:seed` | `package.json:23` | Resets and seeds data | requires DB |

## Runtime Boundaries

| Runtime | Examples | Constraints |
| --- | --- | --- |
| Browser | forms rendered by `apps/web/app/tickets/[id]/page.tsx:93-193` | no direct Prisma, no secrets |
| Next server component | dashboard queries at `apps/web/app/page.tsx:18-35` | can query Prisma, should be bounded |
| Server action | mutations in `apps/web/lib/actions.ts:41-530` | validate input, check capability, audit side effects |
| Node script | seed script in `packages/db/src/seed.ts:55-598` | can destructively reset local DB |
| Tests | `tests/domain.test.ts:11-55` and `tests/agents.test.ts:4-69` | should avoid external services for unit tests |

## Environment Variables

- Prisma reads `DATABASE_URL` at `packages/db/prisma/schema.prisma:5-7`.
- `.env.example` documents the expected local Postgres URL.
- No real LLM API keys are needed.

## Build and Bundling

Next transpiles local packages from `apps/web/next.config.mjs:3-10`. That is why imports like `@agentdesk/domain` work from the app.

## Drill

Run `npm run test`, then explain why no database is required for those tests. Use `tests/domain.test.ts:1-55` and `tests/agents.test.ts:1-69`.

Self-grade:

- Basic: says tests are unit tests.
- Solid: identifies pure domain/agent functions.
- Strong: explains what an integration test would add and what isolation it would lose.
