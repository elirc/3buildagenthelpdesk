# Audit Change Walkthrough

This document explains how the production audit findings were turned into implementation work. It is written for a junior engineer growing toward mid-level ownership: not just "what files changed," but why each change matters and how to reason about similar changes in a real codebase.

Read this alongside:

- `docs/09-production-enterprise-audit.md`
- `docs/10-production-hardening-implementation.md`

## The Big Picture

The audit identified a pattern: the app had a strong learning architecture, but it still had demo-level production gaps. The follow-up implementation did not try to make the app fully enterprise-ready in one jump. Instead, it added the foundations that production systems rely on:

- real authentication boundaries
- tenant isolation
- server-side resource authorization
- background work instead of request blocking
- observability and request correlation
- pagination for growing tables
- safer error handling
- integration tests for production seams

That is a useful mid-level lesson: production hardening usually starts by turning implicit assumptions into explicit code.

## Audit Finding 1: Authentication Was Demo-Only

### What The Audit Found

The app used an `activeUserId` cookie and silently fell back to the first seeded user. That is convenient in a training app, but dangerous in production because an unauthenticated request could accidentally become authenticated.

### What Changed

Authentication now goes through a provider boundary in `apps/web/lib/auth.ts`.

The current provider is still local-demo auth, but the rest of the app no longer needs to know that detail. Demo auth can be enabled with:

```env
AUTH_PROVIDER="local-demo"
ALLOW_DEMO_AUTH="true"
```

The layout and settings page now show whether demo auth is active.

### Why It Matters

A mid-level engineer should avoid scattering auth assumptions through the app. The provider boundary creates a place where OIDC, SAML, or another identity provider can be added later without rewriting every page.

### Code To Read

1. `apps/web/lib/auth.ts`
2. `apps/web/app/layout.tsx`
3. `apps/web/app/settings/page.tsx`
4. `.env.example`

### Learning Check

Ask yourself: what would need to change to add a real OIDC provider? The answer should mostly be "the provider implementation," not every page and action.

## Audit Finding 2: No Tenant Isolation

### What The Audit Found

Users, tickets, incidents, logs, jobs, agents, and audit events lived in one global data space. That is not safe for an enterprise system with multiple customers, departments, or business units.

### What Changed

The Prisma schema now has an `Organization` model and `organizationId` on core records. Seed data creates two organizations so tenant isolation can be tested manually.

Pages now scope queries by the active user's organization.

### Why It Matters

Tenant isolation must happen at the query and mutation layer, not only in the UI. If you fetch records globally and filter later, you have already created a leakage risk.

### Code To Read

1. `packages/db/prisma/schema.prisma`
2. `packages/db/src/seed.ts`
3. `apps/web/app/tickets/page.tsx`
4. `apps/web/app/incidents/page.tsx`
5. `apps/web/app/logs/page.tsx`
6. `apps/web/app/audit/page.tsx`

### Learning Check

When reviewing a page, look for `organizationId` inside the Prisma `where` clause. If it is missing on tenant data, that is a red flag.

## Audit Finding 3: Authorization Was Too Coarse

### What The Audit Found

The app had role capabilities such as `ticket:update`, but did not consistently verify whether the user could access the specific ticket, incident, job, or agent run being mutated.

### What Changed

`apps/web/lib/access.ts` now provides scoped access helpers. Server actions load target records by both ID and `organizationId`, then assert access before mutation.

Related fields are also scoped. For example, a ticket cannot be assigned to a team or user outside the active organization.

### Why It Matters

Role authorization answers "can this kind of user do this kind of thing?" Resource authorization answers "can this user do this thing to this record?" Production systems need both.

### Code To Read

1. `packages/domain/src/permissions.ts`
2. `apps/web/lib/access.ts`
3. `apps/web/lib/actions.ts`
4. `tests/integration.test.ts`

### Learning Check

Find one server action and trace this order:

1. Load current user.
2. Check capability.
3. Load target record in the user's organization.
4. Mutate.
5. Audit.

That sequence is the pattern to preserve.

## Audit Finding 4: Agent Runs Blocked Requests

### What The Audit Found

Agent runs executed synchronously inside server actions. That works for deterministic mock agents, but it would not scale if future agents became slower, called external APIs, or ran multi-step workflows.

### What Changed

Agent actions now create:

- an `AgentRun` with `PENDING`
- a `BackgroundJob` with type `AGENT_RUN`

The new worker in `packages/db/src/worker.ts` claims queued jobs and executes the agent outside the request-response path.

New commands:

```bash
npm run worker
npm run worker:once
```

### Why It Matters

Production web requests should stay responsive. Slow or retryable work belongs behind a worker, queue, or job system.

### Code To Read

1. `apps/web/lib/actions.ts`
2. `packages/db/src/worker.ts`
3. `packages/agents/src/registry.ts`
4. `package.json`

### Learning Check

Ask: what happens if an agent fails? You should be able to find where the agent run becomes `FAILED`, where the job records the error, and where audit events are written.

## Audit Finding 5: Observability Was Incomplete

### What The Audit Found

Audit events existed, but there was no consistent request correlation. Metadata redaction also existed as a helper but was not enforced at audit write time.

### What Changed

The app now creates request context IDs and stores them on:

- audit events
- background jobs
- agent runs

Audit writes also redact sensitive values by default.

### Why It Matters

During a production incident, engineers need to follow a chain of events. A request ID connects the original action to audit records, queued work, worker execution, and agent results.

### Code To Read

1. `apps/web/lib/request-context.ts`
2. `apps/web/lib/audit.ts`
3. `packages/observability/src/index.ts`
4. `packages/db/src/worker.ts`

### Learning Check

Search for `requestContextId`. A healthy implementation should show the same idea flowing through actions, audit, jobs, and agent runs.

## Audit Finding 6: High-Volume Pages Needed Pagination

### What The Audit Found

Logs, audit events, jobs, and agent runs used fixed `take` limits but did not provide proper pagination or time-window filters.

### What Changed

`apps/web/lib/pagination.ts` now parses bounded page and page-size values. The high-volume pages use database-level pagination and preserve filters in page links.

Logs and audit events also support `from` and `to` time filters.

### Why It Matters

Operational tables grow quickly. Pagination prevents slow pages and makes investigation more precise.

### Code To Read

1. `apps/web/lib/pagination.ts`
2. `apps/web/app/logs/page.tsx`
3. `apps/web/app/audit/page.tsx`
4. `apps/web/app/jobs/page.tsx`
5. `apps/web/app/agents/page.tsx`

### Learning Check

Look for `skip` and `take` in Prisma queries. Pagination should happen in the database, not after fetching all records.

## Audit Finding 7: Error Handling Was Too Raw

### What The Audit Found

Expected business failures could surface as framework errors. That is not a polished operator experience.

### What Changed

The implementation added:

- `ActionError` in `apps/web/lib/errors.ts`
- a Next.js app error boundary in `apps/web/app/error.tsx`

This gives the app a clearer recovery path for thrown errors.

### Why It Matters

Mid-level engineers distinguish between expected failures and unexpected bugs. Invalid permissions, invalid submitted IDs, and ineligible retries are expected failures. They should be represented intentionally.

### Code To Read

1. `apps/web/lib/errors.ts`
2. `apps/web/app/error.tsx`
3. `apps/web/lib/actions.ts`

### Learning Check

Find an `ActionError` and ask whether the message helps a user understand what happened without leaking sensitive data.

## Audit Finding 8: Integration Coverage Was Thin

### What The Audit Found

The repo had useful domain and agent tests, but not enough coverage around production seams like scoping, redaction, pagination, and cross-module behavior.

### What Changed

`tests/integration.test.ts` now covers:

- organization-scoped query helpers
- access denial for cross-organization records
- nested sensitive metadata redaction
- pagination bounds and filter-preserving links

Incident transition coverage was also added to `tests/domain.test.ts`.

### Why It Matters

Production bugs often happen at the boundaries between modules. Integration-style tests protect those seams.

### Code To Read

1. `tests/integration.test.ts`
2. `tests/domain.test.ts`
3. `vitest.config.ts`

### Learning Check

Ask whether each test would fail if someone accidentally removed a production guard. Good tests protect behavior, not implementation trivia.

## How To Review A Hardening Change Like This

Use this checklist:

- Does the database model support the invariant?
- Is the invariant enforced in server actions?
- Are list and detail pages both scoped?
- Are related records checked before linking or assignment?
- Are audit events written after important mutations?
- Is sensitive metadata redacted at the write boundary?
- Can long-running work move outside the request path?
- Can an operator trace the workflow with a request ID?
- Are high-volume pages bounded?
- Is there a test for the production seam?

This checklist is more important than memorizing the exact files. It is the mental model that turns a junior implementation into mid-level system ownership.

## What Still Needs Work

This pass improved the foundation, but it did not finish every enterprise requirement.

Still needed:

- Real OIDC or SAML provider.
- CI workflow.
- Committed Prisma migrations.
- Test database integration tests for server actions.
- Stronger worker locking and heartbeat behavior.
- Retention policies for logs, audit events, jobs, and agent runs.
- Inline form validation errors.
- External metrics, traces, and alerting.

That is normal. Production maturity is incremental. The important thing is that the code now has better places to attach those next improvements.

## Suggested Junior-To-Mid Exercise

Pick one workflow: ticket update, incident status update, or job retry.

Trace it through:

1. Page form.
2. Server action.
3. Permission check.
4. Resource access check.
5. Prisma mutation.
6. Audit event.
7. Request context.
8. Test coverage.

Then write a short note answering:

- What user behavior does this workflow support?
- What data boundary protects it?
- What could go wrong?
- Where would you add the next test?

That is exactly the kind of thinking that moves an engineer from "I changed code" to "I own a system behavior."

