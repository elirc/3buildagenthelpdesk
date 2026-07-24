# Language and Runtime Model

## JavaScript Runtime Concept

JavaScript runs one main thread of execution per event loop. Async work lets the runtime wait on I/O without blocking other work. In server code, `await` pauses the current function, not the whole process.

## Why It Matters

Bad async structure causes slow pages, hidden race conditions, or broken side effects. Good async structure makes independent reads parallel and dependent writes explicit.

## Real Code Examples

- Parallel page reads: dashboard uses `Promise.all` for independent queries at `apps/web/app/page.tsx:10-35`.
- Ticket detail uses `Promise.all` to load ticket, teams, users, incidents, current user, agent runs, and audit events at `apps/web/app/tickets/[id]/page.tsx:15-44`.
- Seed script intentionally runs destructive deletes sequentially at `packages/db/src/seed.ts:12-22` because delete order matters.
- Agent persistence uses sequential writes because audit should reflect run lifecycle order at `apps/web/lib/actions.ts:263-325`.

## Pitfall Checklist

- Do not make independent DB reads serial without reason.
- Do not put dependent writes in `Promise.all` when order or rollback matters.
- Do not swallow async errors unless you can explain the fallback. `getUsersForSwitcher` catches DB errors and returns `[]` at `apps/web/lib/auth.ts:11-19`; this is acceptable for build tolerance but risky if copied into real mutations.
- Do not assume server actions are retried safely. Retrying `retryJobAction` changes attempts at `apps/web/lib/actions.ts:429-437`.

## TypeScript Runtime Reality

TypeScript types disappear at runtime. Runtime validation needs Zod or explicit checks.

Repo anchors:

- Zod validates tickets at `packages/domain/src/tickets.ts:13-24`.
- Server action calls that schema at `apps/web/lib/actions.ts:46-57`.
- Agent output types exist at compile time, but persisted JSON has no runtime schema in `packages/db/prisma/schema.prisma:250-258`.

## Drill

Find one cast using `as never` or `as unknown`. Explain:

1. Why the compiler needed help.
2. What runtime value could still be invalid.
3. What validation would reduce risk.

Suggested anchors:

- `apps/web/app/logs/page.tsx:14-21`
- `packages/agents/src/registry.ts:7-15`

Self-grade:

- Basic: identifies the cast.
- Solid: explains compile-time vs runtime.
- Strong: proposes a Zod schema or typed helper to remove the cast.
