# Interview Prep From This Repo

This file turns the codebase into practice for mid-level software engineering interviews in JavaScript/TypeScript and Python. There is no Python production code in this repo; Python prompts use analogous concepts such as Pydantic, SQLAlchemy/Django ORM, FastAPI/Django views, pytest, async I/O, and service boundaries.

## How To Use This

For each prompt:

1. Answer from memory.
2. Re-open the anchor.
3. Upgrade your answer from junior to mid-level to senior.
4. Practice a 2-minute spoken version.

## JavaScript and TypeScript Runtime Questions

### Question: Why use `Promise.all` in server components?

Anchor: `apps/web/app/page.tsx:10-35`.

Junior answer:

- It runs multiple queries at the same time.

Mid-level answer:

- Independent reads can be awaited in parallel to reduce request latency. The dashboard queries open tickets, incidents, job counts, logs, agent runs, and audit events without depending on each other.

Senior answer:

- Parallel reads reduce latency, but the dashboard also needs query budgets. `openTickets` currently loads all open rows at `apps/web/app/page.tsx:19-23`, so scaling should move toward aggregate queries and bounded result sets. Parallelism does not replace data-shape discipline.

### Question: What is the difference between TypeScript types and runtime validation?

Anchors: `packages/domain/src/tickets.ts:13-24`, `apps/web/lib/actions.ts:46-57`.

Junior answer:

- TypeScript checks code; Zod checks data.

Mid-level answer:

- FormData is untrusted runtime input, so `createTicketSchema.parse` turns strings into a validated object. TypeScript alone cannot protect the server from malformed browser input.

Senior answer:

- Runtime validation is a boundary contract. I would audit every server action for schema use, because `updateTicketAction` manually casts several fields at `apps/web/lib/actions.ts:97-125`. That is a future hardening target.

### Question: When is `unknown` better than `any`?

Anchor: `apps/web/app/agents/[id]/page.tsx:9-21`.

Junior answer:

- `unknown` makes you check the type first.

Mid-level answer:

- Persisted JSON may not match the current TypeScript type, so the page narrows fields before rendering findings, recommendations, and limitations.

Senior answer:

- `unknown` is correct, but I would prefer versioned output schemas. That would let old agent runs render safely while new runs validate before persistence.

## React and Next.js Questions

### Question: What is a Server Component doing here?

Anchor: `apps/web/app/tickets/page.tsx:8-31`.

Junior answer:

- It gets tickets and renders a table.

Mid-level answer:

- The page runs on the server, reads search params, queries Prisma, includes related user/team/incident data, and renders HTML. No client fetch is required.

Senior answer:

- This is productive for internal tools, but query params are untrusted and should be validated. Also, as datasets grow, table routes need pagination and bounded queries.

### Question: How do server actions change form handling?

Anchor: `apps/web/lib/actions.ts:41-89`.

Junior answer:

- Forms can call a server function.

Mid-level answer:

- The action reads `FormData`, validates with Zod, checks role capability, writes through Prisma, records audit, revalidates, and redirects.

Senior answer:

- Server actions are the application-service boundary here. I would keep them thin over time by extracting per-domain services and input builders as complexity grows.

## Python Comparison Questions

### Question: How would this Zod pattern translate to Python?

Anchor: `packages/domain/src/tickets.ts:13-24`.

Junior answer:

- Use Pydantic to validate the input.

Mid-level answer:

- A FastAPI endpoint or service layer could parse a `CreateTicket` Pydantic model, then call domain functions for SLA and transitions before writing with SQLAlchemy.

Senior answer:

- I would keep the same boundary: request/form model validation, domain invariants outside the web framework, persistence models separate from API models, and tests for both runtime validation and business rules.

### Question: How would Python async compare to this repo's JavaScript async?

Anchor: `apps/web/app/page.tsx:10-35`.

Junior answer:

- Both can run I/O without waiting one by one.

Mid-level answer:

- JavaScript uses promises and `Promise.all`; Python async uses coroutines and `asyncio.gather`. In both, independent I/O can run concurrently, but CPU work is not magically parallel.

Senior answer:

- In both ecosystems, concurrency must respect connection pools, timeouts, cancellation, and transaction boundaries. I would not parallelize dependent writes like ticket create plus audit unless wrapped in a deliberate transaction/outbox design.

### Question: What Python ORM lesson maps to Prisma here?

Anchor: `apps/web/app/tickets/page.tsx:25-29`.

Junior answer:

- Include related data to avoid extra queries.

Mid-level answer:

- Prisma `include` is similar to eager loading in SQLAlchemy or Django `select_related/prefetch_related`. It prevents per-row relation queries.

Senior answer:

- Eager loading is not always better. It should match page data needs, row counts, and indexes. For large tables, pagination and selected fields matter as much as avoiding N+1.

## Debugging Interview Questions

### Prompt: A support agent says ticket status save fails.

Use anchors:

- `apps/web/app/tickets/[id]/page.tsx:109-117`
- `apps/web/lib/actions.ts:97-100`
- `packages/domain/src/tickets.ts:34-55`

Junior answer:

- Check the status field and transition function.

Mid-level answer:

- Reproduce, inspect submitted status, check current ticket status, then test `canTransitionTicket`. If the transition is invalid, improve user feedback instead of weakening the rule.

Senior answer:

- I would confirm whether the workflow requirement changed. If yes, update the domain transition map, UI status options, tests, audit expectations, and docs. If no, add better error handling.

### Prompt: An agent recommends the wrong owner team.

Use anchors:

- `packages/agents/src/ticket-summarization.ts:100-106`
- `tests/agents.test.ts:5-25`

Junior answer:

- Update the if statement.

Mid-level answer:

- Add a failing fixture first, then adjust the heuristic.

Senior answer:

- I would ask whether this is a rule problem, input snapshot problem, or confidence/limitation problem. If wrong recommendations are expected sometimes, add evaluation fixtures and make uncertainty visible.

## System Design Questions

### Prompt: Design an agent approval workflow.

Anchor: `packages/db/prisma/schema.prisma:244-264`.

Junior answer:

- Add a table for approvals.

Mid-level answer:

- Add `AgentApproval` with run id, reviewer id, status, decision notes, timestamps, and audit events. Add UI buttons on agent detail.

Senior answer:

- Clarify whether approvals apply recommendations or only record decisions. Add permissions, audit trail, rollback behavior, migration strategy, and tests. Avoid agents mutating tickets/jobs directly.

### Prompt: Scale log explorer to millions of logs.

Anchor: `apps/web/app/logs/page.tsx:23-60`.

Junior answer:

- Add pagination.

Mid-level answer:

- Add time-window filters, pagination, indexes, and avoid grouping too many rows in memory.

Senior answer:

- I would likely move logs out of the primary relational DB or add retention/partitioning. For this MVP, first add validated time windows and aggregate queries.

## Code Review Questions

Prompt: A PR removes `requireCapability` from `retryJobAction` because the button is disabled for viewers.

Anchor: `apps/web/lib/actions.ts:419-421`.

Junior response:

- Put it back.

Mid-level response:

- UI is not an authorization boundary. Keep server-side capability checks.

Senior response:

- Block the PR, explain the security model, add permission tests, and consider resource-level checks beyond role capabilities.

## Behavioral Prompts

### Tell me about a time you improved test coverage.

Use this repo story:

- Found pure domain logic in `packages/domain/src/jobs.ts:14-20`.
- Added tests similar to `tests/domain.test.ts:11-55`.
- Explained edge cases and regression value.

Junior answer sounds like:

- "I added tests for retry behavior."

Mid-level answer adds:

- "I chose unit tests because the behavior was pure and did not require the database."

Senior answer includes:

- "I also identified missing integration tests for server actions because pure tests do not prove audit events and persistence happen together."

### Tell me about a time you identified architectural risk.

Use this repo story:

- Incident transition rules exist at `packages/domain/src/incidents.ts:20-29`.
- Server action does not enforce them at `apps/web/lib/actions.ts:227-254`.

Senior answer includes:

- confirmed evidence, impact, proposed fix, tests, and migration path.

## Practice Set

1. Explain modular monolith vs microservices using `package.json:6-9`.
2. Explain domain invariants using `packages/domain/src/tickets.ts:34-55`.
3. Explain runtime validation using `packages/domain/src/tickets.ts:13-24`.
4. Explain deterministic agents using `packages/agents/src/types.ts:16-39`.
5. Explain auditability using `apps/web/lib/audit.ts:5-25`.
6. Explain operational debugging using `apps/web/app/logs/page.tsx:23-60`.
7. Explain retry safety using `packages/domain/src/jobs.ts:14-20`.
8. Explain generic entity reference tradeoffs using `packages/db/prisma/schema.prisma:248-249` and `packages/db/prisma/schema.prisma:270-272`.
