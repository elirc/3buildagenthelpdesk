# Fast Track: One Weekend

This path gives you a fast win: run the app, trace a real feature, make one safe change, and explain what happened.

## Install, Run, Test

Commands are verified against `package.json:10-24`; database commands require PostgreSQL.

```bash
npm install
cp .env.example .env
npm run db:start
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Checks:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

If Docker Desktop is not running, `npm run db:start` will fail even though Docker CLI exists. Start Docker Desktop or point `DATABASE_URL` at an existing Postgres database.

## First 10 Files To Open

1. `README.md:1-126` - project identity and setup.
2. `package.json:6-24` - workspace and command map.
3. `packages/db/prisma/schema.prisma:111-281` - data model.
4. `packages/shared/src/index.ts:1-67` - shared enum contracts.
5. `packages/domain/src/tickets.ts:13-89` - ticket validation, transitions, SLA.
6. `apps/web/lib/actions.ts:41-89` - ticket creation mutation.
7. `apps/web/app/tickets/page.tsx:13-31` - ticket list query.
8. `apps/web/app/tickets/[id]/page.tsx:15-51` - ticket detail data assembly.
9. `packages/agents/src/types.ts:16-39` - agent interface.
10. `tests/agents.test.ts:4-69` - agent behavior tests.

## End-to-End Flow 1: Create A Ticket

Open these first:

- `apps/web/app/tickets/new/page.tsx` - form surface.
- `apps/web/lib/actions.ts:41-89` - server action.
- `packages/domain/src/tickets.ts:13-24` - validation.
- `packages/db/prisma/schema.prisma:137-164` - persisted ticket shape.

Pause and predict:

- Which fields come from the form?
- Which fields are computed server-side?
- Where is the audit event written?

Answer from code:

- Form values are read at `apps/web/lib/actions.ts:46-57`.
- SLA is computed at `apps/web/lib/actions.ts:72`.
- The ticket is written at `apps/web/lib/actions.ts:75-77`.
- Audit is written at `apps/web/lib/actions.ts:79-86`.

## End-to-End Flow 2: Run A Ticket Agent

Open these first:

- `apps/web/app/tickets/[id]/page.tsx:55-63` - button entry point.
- `apps/web/lib/actions.ts:327-368` - input snapshot builder.
- `apps/web/lib/actions.ts:256-325` - persisted agent lifecycle.
- `packages/agents/src/ticket-summarization.ts:29-145` - deterministic heuristic.
- `apps/web/app/agents/[id]/page.tsx:24-101` - run inspection UI.

Pause and predict:

- What evidence does the agent see?
- What is persisted before the agent runs?
- What is persisted after success or failure?

## Small Safe Change

Add one assertion to `tests/domain.test.ts` for a ticket transition that should be invalid. Keep it inside the existing `describe("ticket domain rules")` block at `tests/domain.test.ts:11-55`.

Suggested check:

```bash
npm run test
```

## Teach-Back Exercise

Explain ticket creation in 90 seconds:

- UI entry point
- validation boundary
- permission boundary
- domain computation
- database write
- audit event
- redirect

Self-grade:

- Basic: names the files.
- Solid: traces data through form, Zod, Prisma, audit.
- Strong: identifies risks such as form errors surfacing poorly and foreign-key ids not being resource-authorized.

## What This Fast Path Does Not Cover

- Full incident lifecycle.
- Background job reliability design.
- Prisma migration strategy.
- Deep React mental models.
- Security hardening beyond the obvious permission checks.
- Open source contribution workflow.
