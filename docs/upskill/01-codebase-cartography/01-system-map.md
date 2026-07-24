# System Map

## Repo Shape

This is an npm workspace modular monolith. Workspaces are declared in `package.json:6-9`. The main application is `apps/web`; shared libraries live under `packages/*`.

```text
buildagenthelpdesk/
  apps/web/                 Next.js App Router UI and server actions
  packages/db/              Prisma schema, client, seed data
  packages/domain/          validation, transitions, SLA, permissions
  packages/agents/          deterministic mock agent framework
  packages/observability/   logging, audit types, anomaly scoring
  packages/ui/              reusable UI primitives and CSS variables
  packages/shared/          enum constants, labels, utilities
  tests/                    Vitest unit tests
  docs/                     project docs and this curriculum
```

## Ownership Map

| Area | Owner | Key files | Must own | Must not own |
| --- | --- | --- | --- | --- |
| UI routes | `apps/web/app` | `apps/web/app/tickets/page.tsx:8-116`, `apps/web/app/page.tsx:9-167` | rendering, page queries, form composition | business invariants |
| Server actions | `apps/web/lib/actions.ts` | `apps/web/lib/actions.ts:41-530` | mutation orchestration, permission checks, persistence calls | heuristic scoring internals |
| Domain | `packages/domain/src` | `packages/domain/src/tickets.ts:13-142`, `packages/domain/src/permissions.ts:3-40` | validation, status transitions, SLA, capabilities | React rendering |
| Data | `packages/db` | `packages/db/prisma/schema.prisma:111-281`, `packages/db/src/seed.ts:55-598` | schema, client, seed story | UI state |
| Agents | `packages/agents/src` | `packages/agents/src/types.ts:16-39`, `packages/agents/src/registry.ts:15-34` | agent contracts, deterministic analysis | Prisma persistence |
| Observability | `packages/observability/src` | `packages/observability/src/index.ts:16-127` | audit action types, anomaly scoring, redaction helper | page-specific display |
| Tests | `tests` | `tests/domain.test.ts:11-55`, `tests/agents.test.ts:4-69` | regression coverage | product behavior definitions without code anchors |

## Public Interfaces

- Browser routes: `apps/web/app/layout.tsx:15-23`.
- Server actions: exported functions in `apps/web/lib/actions.ts:31-530`.
- Package exports: each package declares an export in its `package.json`; the web app depends on packages at `apps/web/package.json:12-19`.
- Prisma model contract: `packages/db/prisma/schema.prisma:111-281`.
- Agent contract: `packages/agents/src/types.ts:16-39`.

## Private Internals

- `persistAgentRun` is private to `apps/web/lib/actions.ts:256-325`.
- `stringValue` and `optionalStringValue` are local form helpers at `apps/web/lib/actions.ts:22-29`.
- Agent heuristic details are internal to each agent file, such as urgency scoring in `packages/agents/src/ticket-summarization.ts:40-100`.

## Runtime Surfaces

- Browser: rendered HTML and forms from `apps/web/app/*`.
- Next.js server runtime: server components and server actions.
- Node.js runtime: Prisma client, seed script, tests, crypto hashing in `packages/domain/src/logs.ts:1-23`.
- PostgreSQL: Prisma schema uses `provider = "postgresql"` at `packages/db/prisma/schema.prisma:5-7`.

## Senior Noticing

- The app is not microservices; it has module boundaries without network boundaries.
- Agents are pure functions, but agent input builders live in server actions (`apps/web/lib/actions.ts:327-357`, `apps/web/lib/actions.ts:392-403`, `apps/web/lib/actions.ts:505-518`). If those grow, extract them.
- Generic ids in `AgentRun` and `AuditEvent` (`packages/db/prisma/schema.prisma:249-258`, `packages/db/prisma/schema.prisma:270-275`) buy flexibility but lose referential integrity.

## Verification Notes

- Inspected `rg --files`.
- Inspected workspace scripts and packages.
- Inspected Prisma schema, server actions, domain, agents, UI routes, and tests.
