# Production Hardening Implementation

This document explains the implementation pass that addressed the requested production gaps: authentication, tenant isolation, resource-level authorization, background processing, operational observability, pagination, error handling, and integration test coverage.

The goal was to keep the app understandable for a junior engineer while moving the code toward mid-level and senior production patterns. The implementation is intentionally pragmatic: it creates durable seams and guardrails without turning the learning app into a large distributed system.

## Summary Of Changes

| Gap | Implemented Change | Main Files |
| --- | --- | --- |
| Authentication | Added an auth provider boundary with local demo mode and production-disabled fallback behavior. | `apps/web/lib/auth.ts`, `apps/web/app/layout.tsx`, `apps/web/app/settings/page.tsx` |
| Tenant isolation | Added `Organization` and `organizationId` fields to core records. Scoped list/detail queries by active organization. | `packages/db/prisma/schema.prisma`, `packages/db/src/seed.ts`, `apps/web/app/*` |
| Resource authorization | Added scoped access helpers and checked target/related records before mutation. | `apps/web/lib/access.ts`, `apps/web/lib/actions.ts` |
| Background processing | Queued agent runs as `AGENT_RUN` jobs and added a worker that processes queued/retrying jobs. | `packages/db/src/worker.ts`, `apps/web/lib/actions.ts`, `package.json` |
| Operational observability | Added request context IDs, structured operational logs, audit correlation, worker logs, and metadata redaction. | `apps/web/lib/request-context.ts`, `apps/web/lib/audit.ts`, `packages/observability/src/index.ts` |
| Pagination | Added bounded pagination and time filters for high-volume pages. | `apps/web/lib/pagination.ts`, `apps/web/app/logs/page.tsx`, `apps/web/app/jobs/page.tsx`, `apps/web/app/agents/page.tsx`, `apps/web/app/audit/page.tsx` |
| Error handling | Added a shared action error type and a product-level Next.js error page. | `apps/web/lib/errors.ts`, `apps/web/app/error.tsx` |
| Integration test coverage | Added cross-module tests for scoping, redaction, pagination, and incident transition behavior. | `tests/integration.test.ts`, `tests/domain.test.ts` |

## Authentication

Before this pass, `getCurrentUser` read an `activeUserId` cookie and silently fell back to the first seeded user. That is convenient for demos, but dangerous in production because unauthenticated requests could become authenticated as a real user.

What changed:

- `apps/web/lib/auth.ts` now has a small auth provider boundary.
- Local demo auth remains available in development.
- Demo auth can also be explicitly enabled with `AUTH_PROVIDER=local-demo` or `ALLOW_DEMO_AUTH=true`.
- In production-like modes without demo auth, `getCurrentUser` returns `null` instead of falling back.
- `requireCurrentUser` centralizes authenticated access for pages and actions.
- The layout and settings page show whether demo auth is active.

Why this matters:

A production app should not let application code care whether identity came from a demo cookie, OIDC, SAML, or another provider. The rest of the app should ask one question: "Who is the current user?" This is the seam where a real identity provider can be added later.

Junior engineer mental model:

- Authentication answers "who are you?"
- Authorization answers "what are you allowed to do?"
- Tenant isolation answers "which organization's data can you touch?"

## Tenant Isolation

Before this pass, every user and record lived in one global data space. That works for a local demo but not for enterprise data.

What changed:

- Added an `Organization` model.
- Added required `organizationId` relations to users, teams, tickets, incidents, structured logs, background jobs, agent runs, and audit events.
- Added organization-aware indexes for common query paths.
- Updated seed data to create two organizations.
- Updated list/detail pages to scope queries by the active user's organization.

Why this matters:

Tenant isolation must be enforced in the database queries, not only in UI filters. If a query fetches all records and filters afterward, sensitive records can leak through logs, performance traces, accidental rendering, or future refactors.

How it was done:

```ts
const currentUser = await requireCurrentUser();

const tickets = await prisma.ticket.findMany({
  where: {
    organizationId: currentUser.organizationId,
    status: searchParams.status ? searchParams.status : undefined
  }
});
```

Senior-level note:

The current implementation is organization-scoped but does not add a cross-organization platform admin role. That is deliberate. It is safer to start with strict isolation and add explicit cross-tenant access later than to accidentally make admin mean global admin.

## Resource-Level Authorization

Before this pass, server actions checked role capabilities but did not consistently verify that submitted IDs belonged to the active user's organization.

What changed:

- Added `apps/web/lib/access.ts`.
- Added helpers for scoped query construction and record access assertions.
- Updated server actions to load target records by `id` plus `organizationId`.
- Updated related record checks for assigned team, assigned user, and linked incident.
- Kept role capability checks in place.

Why this matters:

Role checks are necessary but insufficient. A support agent may be allowed to update tickets, but not every ticket in every organization.

The intended mutation pattern is now:

1. Load authenticated user.
2. Check role capability.
3. Load target record inside the user's organization.
4. Validate related records are also inside the user's organization.
5. Mutate.
6. Audit.

Example:

```ts
const before = await prisma.ticket.findFirst({
  where: { id: ticketId, organizationId: user.organizationId }
});
assertCanAccessRecord(user, before, "Ticket");
```

## Background Processing

Before this pass, agent runs executed synchronously inside server actions. Background jobs existed as records, but no worker executed them.

What changed:

- Agent run actions now create an `AgentRun` with `PENDING`.
- They also create a `BackgroundJob` of type `AGENT_RUN`.
- Added `packages/db/src/worker.ts`.
- Added `npm run worker` and `npm run worker:once`.
- The worker claims queued or retrying jobs, marks them running, executes handlers, updates status, and writes audit events.

Why this matters:

Production systems should avoid doing long-running or retryable work inside web requests. Even though the current agents are deterministic and fast, the architecture now supports slower future agents, retries, and operational visibility.

How to run one job locally:

```bash
npm run worker:once
```

How the queued agent flow works:

1. User clicks `Run Ticket Agent`, `Run Anomaly Agent`, or `Run Job Agent`.
2. Server action creates an `AgentRun` as `PENDING`.
3. Server action creates an `AGENT_RUN` background job.
4. User is redirected to the agent run page.
5. Worker claims the job.
6. Worker marks the agent run `RUNNING`, executes the deterministic agent, then marks it `SUCCEEDED` or `FAILED`.

Senior-level note:

This is still a database-backed worker, not a full queue system. It is a good intermediate step. Before high throughput, add stronger locking, worker heartbeats, dead job recovery, and eventually a managed queue.

## Operational Observability

Before this pass, audit events existed but did not consistently carry request correlation, and sensitive metadata redaction was available but not enforced.

What changed:

- Added `apps/web/lib/request-context.ts`.
- Server actions create request context IDs.
- Audit events now store `requestContextId`.
- Background jobs and agent runs store `requestContextId`.
- `writeAuditEvent` redacts metadata, before, and after payloads.
- Worker execution writes structured JSON logs.
- Audit writes emit structured operational logs.

Why this matters:

During an incident, an engineer should be able to follow one user action through:

- server action start
- audit event
- background job
- agent run
- worker completion or failure

That is what request correlation enables.

Redaction was also made defensive. Callers no longer need to remember to redact sensitive metadata before writing audit events.

## Pagination And Time Windows

Before this pass, high-volume pages loaded a fixed number of recent records. That is better than unbounded reads, but it does not let operators navigate history.

What changed:

- Added `apps/web/lib/pagination.ts`.
- Logs, jobs, agent runs, and audit events now support page/page-size pagination.
- Logs and audit events also support `from` and `to` time filters.
- Page links preserve existing filters.

Why this matters:

Enterprise systems accumulate logs, audit events, jobs, and agent runs quickly. Pagination and time windows keep pages predictable and make operational investigation easier.

Junior engineer rule:

Filtering and pagination should happen in the database query whenever possible. Fetching everything and slicing in JavaScript is a common beginner mistake.

## Error Handling

Before this pass, many action failures would surface as framework errors.

What changed:

- Added `ActionError` for expected action-level failures.
- Added `apps/web/app/error.tsx` as a user-facing error boundary.
- Authentication and access failures now use clearer messages.

Why this matters:

Production apps need errors that help users recover and help engineers debug. This is only a first step. A future improvement would use form state to show inline validation errors without leaving the current page.

## Integration Test Coverage

Before this pass, tests covered domain rules and agent heuristics. They did not yet cover the new production seams.

What changed:

- Added `tests/integration.test.ts`.
- Added tests for:
  - organization-scoped query objects
  - cross-organization access denial
  - nested sensitive metadata redaction
  - bounded pagination and filter-preserving links
- Added incident transition tests in `tests/domain.test.ts`.

Why this matters:

These are not full database integration tests yet. They are integration-contract tests across modules. They protect the seams most likely to regress during future production hardening.

Next testing step:

Add a test database and server-action integration tests that prove actual Prisma mutations write scoped records and audit events.

## Verification

Commands run during this implementation:

```bash
npm run db:generate
npm run typecheck
npm run test
```

`npm run db:push` was attempted but could not run because `DATABASE_URL` is not set in the current environment. Once a local `.env` exists and PostgreSQL is running, run:

```bash
npm run db:push
npm run db:seed
```

## What This Does Not Solve Yet

This pass creates a production-shaped foundation, but a real enterprise launch would still need:

- Real OIDC/SAML provider implementation.
- CSRF and rate-limit documentation.
- CI workflow.
- Committed Prisma migrations.
- Database-backed server-action integration tests.
- Stronger worker locking and heartbeat behavior.
- Retention policies for logs, audit events, jobs, and agent runs.
- Operational dashboards and alerting outside console logs.
- Inline form validation states.

## Learning Path For A Junior Engineer

Read the changes in this order:

1. `packages/db/prisma/schema.prisma`
2. `packages/db/src/seed.ts`
3. `apps/web/lib/auth.ts`
4. `apps/web/lib/access.ts`
5. `apps/web/lib/actions.ts`
6. `apps/web/lib/audit.ts`
7. `packages/db/src/worker.ts`
8. `apps/web/lib/pagination.ts`
9. `tests/integration.test.ts`

For each file, ask:

- What invariant does this file protect?
- Is the protection enforced on the server?
- Does the database model support the rule?
- Is the behavior observable?
- Is there a test or manual verification path?

That question set is the bridge from junior implementation to mid-level ownership and eventually senior system design.

