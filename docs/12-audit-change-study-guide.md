# Audit Change Study Guide

This guide explains the audit-driven production hardening changes from the perspective of a junior engineer learning to think like a mid-level engineer. The goal is not to memorize every file. The goal is to understand how an audit finding becomes a durable system invariant.

Use this as a study companion to:

- `docs/09-production-enterprise-audit.md`
- `docs/10-production-hardening-implementation.md`
- `docs/11-audit-change-walkthrough.md`

## How To Think About The Audit

The audit found that the app had good learning architecture but weak production guardrails. That is common in early systems.

A junior engineer often asks:

- What file do I edit?
- What code do I add?
- Why is TypeScript failing?

A mid-level engineer starts asking:

- What invariant are we trying to protect?
- Where should that invariant be enforced?
- What breaks if this grows by 100x?
- How would an operator debug this at 2 AM?
- What test would fail if someone removes the safeguard?

The changes in this pass are mostly about adding those invariants.

## Change Map

| Audit Gap | New Invariant | Where It Was Implemented |
| --- | --- | --- |
| Demo authentication | Production must not silently authenticate as a seeded user. | `apps/web/lib/auth.ts` |
| No tenant isolation | Core records must belong to an organization. | `packages/db/prisma/schema.prisma` |
| Coarse authorization | A user can mutate only records in their organization. | `apps/web/lib/access.ts`, `apps/web/lib/actions.ts` |
| Synchronous agents | Agent work can be queued and processed by a worker. | `packages/db/src/worker.ts` |
| Weak observability | Important work carries a request correlation ID. | `apps/web/lib/request-context.ts`, `apps/web/lib/audit.ts` |
| Metadata leak risk | Audit metadata is redacted at the write boundary. | `packages/observability/src/index.ts` |
| Large list risk | High-volume pages are paginated. | `apps/web/lib/pagination.ts` |
| Raw errors | Expected action failures have a product-level path. | `apps/web/lib/errors.ts`, `apps/web/app/error.tsx` |
| Thin integration coverage | Production seams have tests. | `tests/integration.test.ts` |

## Before And After: Authentication

Before:

- The app read `activeUserId` from a cookie.
- If the cookie was missing, it used the first seeded user.
- That made local demos easy, but it was unsafe as a production pattern.

After:

- Authentication goes through a provider boundary.
- Demo auth is explicit.
- Production-like mode does not silently fall back to a seeded user.
- Pages and actions can call `requireCurrentUser()`.

What to learn:

Authentication should have one clear doorway. If every page invents its own auth logic, the system becomes hard to secure.

Study exercise:

Open `apps/web/lib/auth.ts` and answer:

- Where is demo auth allowed?
- What happens when demo auth is disabled?
- Which function should server pages call when they require a user?

## Before And After: Tenant Isolation

Before:

- Tickets, incidents, logs, jobs, agent runs, and audit events were global.
- A query could accidentally return every organization's data because there was no organization field.

After:

- `Organization` exists in the schema.
- Core records include `organizationId`.
- List and detail pages query by active organization.
- Seed data creates more than one organization.

What to learn:

Tenant isolation starts in the data model. If the database cannot represent ownership, the application cannot reliably enforce ownership.

Study exercise:

Open `packages/db/prisma/schema.prisma` and find every `organizationId`. For each one, ask:

- Why does this record need tenant scope?
- What query would be dangerous without this field?
- Is there an index that supports common scoped reads?

## Before And After: Resource Authorization

Before:

- A role capability could allow a mutation.
- The mutation did not always prove the target record belonged to the user's organization.

After:

- Server actions load target records by `id` plus `organizationId`.
- Shared helpers assert scoped access.
- Related IDs, such as assigned team or linked incident, are checked before mutation.

What to learn:

Role-based authorization and resource authorization are different layers.

Example:

- Role rule: support agents can update tickets.
- Resource rule: this support agent can update this ticket only if it is in their organization.

Study exercise:

Open `apps/web/lib/actions.ts` and trace `updateTicketAction`.

Write down where it:

1. Loads the current user.
2. Checks the user's capability.
3. Loads the target ticket in the user's organization.
4. Checks related team, user, and incident IDs.
5. Writes the audit event.

## Before And After: Background Processing

Before:

- Agent actions ran the agent immediately inside the server action.
- The request had to wait for the agent.
- There was no worker execution path.

After:

- Server actions create pending agent runs.
- Server actions enqueue `AGENT_RUN` background jobs.
- The worker claims and processes jobs.
- Worker success and failure are written to audit.

What to learn:

Long-running or retryable work should not be trapped inside request-response logic. A worker boundary lets the app retry, observe, and recover work more safely.

Study exercise:

Trace a ticket agent run:

1. `runTicketAgentAction`
2. `queueAgentRun`
3. `BackgroundJob` with type `AGENT_RUN`
4. `processNextBackgroundJob`
5. `processAgentRunJob`
6. `AgentRun` status update

Then answer:

- What status does the agent run start with?
- What status does the worker set before execution?
- Where is failure recorded?

## Before And After: Observability

Before:

- Audit events existed.
- There was no consistent correlation ID connecting actions, jobs, and agent runs.
- Sensitive metadata redaction was available but not enforced in audit writes.

After:

- Server actions create request context IDs.
- Audit events, jobs, and agent runs can share the same `requestContextId`.
- Audit writes redact sensitive data automatically.
- Worker events log structured JSON.

What to learn:

Observability is not only dashboards. It starts by making events connectable and safe to inspect.

Study exercise:

Search for `requestContextId` and follow it through:

- action
- audit event
- background job
- agent run
- worker

If you cannot follow a workflow with one ID, observability is incomplete.

## Before And After: Pagination

Before:

- High-volume pages used fixed limits.
- Operators could not move through history reliably.
- Logs and audit had limited time-window controls.

After:

- Pagination parsing lives in `apps/web/lib/pagination.ts`.
- Logs, jobs, agents, and audit pages use bounded pagination.
- Logs and audit support `from` and `to` filters.

What to learn:

Production data grows. If a page can only work with demo-size data, it is not production-ready.

Study exercise:

Open `apps/web/app/audit/page.tsx` and identify:

- where pagination is parsed
- where `skip` and `take` are applied
- where next and previous links preserve filters

## Before And After: Error Handling

Before:

- Expected business failures could surface as raw framework errors.

After:

- `ActionError` represents expected action-level failures.
- `apps/web/app/error.tsx` gives users a clearer recovery page.

What to learn:

Not every error is the same. A validation failure, permission failure, database outage, and programmer bug need different handling over time. This pass adds the first layer of distinction.

Study exercise:

Find one `ActionError`. Decide whether the message is:

- clear enough for the user
- safe enough not to reveal sensitive record existence
- specific enough for support to understand

## Before And After: Tests

Before:

- Tests focused on domain rules and agent heuristics.

After:

- Integration-style tests cover production seams:
  - scoping
  - access denial
  - redaction
  - pagination
- Incident transition behavior is also tested.

What to learn:

Tests should protect the behavior that matters most. Production hardening tests often look less glamorous than feature tests, but they prevent serious regressions.

Study exercise:

Open `tests/integration.test.ts`.

For each test, answer:

- What production risk does this protect?
- What bug would make this test fail?
- Is this a pure unit test, integration-contract test, or database integration test?

## Code Review Checklist

When reviewing future work in this app, ask these questions.

Authentication:

- Does this route require a user?
- Does it use `requireCurrentUser()` when needed?
- Does it accidentally depend on demo auth?

Tenant isolation:

- Does every tenant-owned query include `organizationId`?
- Are detail pages scoped, not just list pages?
- Are related records checked before linking?

Authorization:

- Is there a role capability check?
- Is there a resource access check?
- Are errors safe and understandable?

Background work:

- Should this happen in the request path or in a worker?
- Is retry behavior clear?
- Is failure visible?

Observability:

- Is an audit event written for business state changes?
- Is `requestContextId` preserved?
- Is sensitive data redacted?

Pagination:

- Could this table grow large?
- Are filters applied before pagination?
- Is page size bounded?

Testing:

- Is there a test for the invariant?
- Would the test fail if the production guard were removed?

## Mid-Level Takeaways

The most important skill here is recognizing that production hardening is not one feature. It is a set of repeated patterns:

- Put identity behind a boundary.
- Put ownership in the data model.
- Enforce authorization on the server.
- Queue slow work.
- Correlate operational events.
- Bound large queries.
- Redact by default.
- Test the seams.

Those patterns show up in almost every enterprise application. Once you learn to spot them here, you can carry the same thinking into larger systems.

## Practice Task

Choose one new feature idea from the sprint docs. Before implementing it, write a short design note with these sections:

- What organization owns the data?
- Who can view it?
- Who can mutate it?
- Does it need background processing?
- What audit event should be written?
- What request context should be preserved?
- What list page needs pagination?
- What test protects the production invariant?

If you can answer those questions before coding, you are thinking like a mid-level engineer.

