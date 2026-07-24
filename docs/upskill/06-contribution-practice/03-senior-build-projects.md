# Senior Build Projects

## Project 1: Agent Approval Workflow

**Problem statement:** Agents produce recommendations but there is no approval state.
**Product value:** Prevents users from confusing analysis with authorized action.
**Design checklist:** schema, approval status, reviewer, audit, UI, permissions.
**Architecture decisions:** generic approval target vs agent-run-specific approval.
**Likely files:** `packages/db/prisma/schema.prisma`, `apps/web/lib/actions.ts`, `apps/web/app/agents/[id]/page.tsx`, `packages/domain/src/permissions.ts`.
**Migration plan:** add nullable tables/fields first, no destructive changes.
**Test plan:** unit policy tests, integration approval action tests.
**Security plan:** only managers/admin approve high-risk actions.
**Performance plan:** index pending approvals.
**Rollout/rollback:** ship read-only approval queue first.
**Open questions:** Can approval apply changes or only record decision?
**Stretch goals:** approval SLA and reviewer assignment.

## Project 2: Incident Postmortem Generator

**Problem statement:** Incidents have evidence but no postmortem workflow.
**Product value:** Faster learning from incidents.
**Likely files:** `packages/agents`, `apps/web/lib/actions.ts`, `apps/web/app/incidents/[id]/page.tsx`.
**Migration plan:** add `PostmortemDraft` or generic agent output first.
**Test plan:** fixture incident with tickets/logs/jobs/audit.
**Security plan:** redact sensitive metadata.
**Performance plan:** cap evidence windows.
**Rollback:** keep as agent run only, no incident mutation.

## Project 3: Resource-Level Authorization

**Problem statement:** Current RBAC is coarse.
**Product value:** Reduces IDOR risk.
**Likely files:** `packages/domain/src/permissions.ts`, `apps/web/lib/actions.ts`, tests.
**Migration plan:** add policy helpers first, enforce per action later.
**Test plan:** role/team matrix.
**Security plan:** deny by default.
**Rollback:** dev override only.

## Project 4: Real Background Worker Simulation

**Problem statement:** Jobs are rows, not executable work.
**Product value:** Teaches async reliability.
**Likely files:** `packages/db/prisma/schema.prisma`, new worker package or script, jobs pages.
**Migration plan:** add job run history and idempotency keys.
**Test plan:** worker unit tests and integration state transitions.
**Security plan:** payload schemas per job type.
**Performance plan:** polling interval and batch size.
**Rollback:** disable worker script.

## Project 5: Observability Baseline

**Problem statement:** Audit exists, but request ids, metrics, and traces do not.
**Product value:** Faster debugging.
**Likely files:** `packages/observability`, `apps/web/lib/actions.ts`, dashboard.
**Migration plan:** add request id in metadata before schema changes.
**Test plan:** audit metadata assertions.
**Security plan:** redaction.
**Performance plan:** avoid high-cardinality metrics.
**Rollback:** ignore optional metadata.

## Project 6: Multi-Tenant Data Isolation

**Problem statement:** Future multi-company support needs tenant boundaries.
**Product value:** Production-grade isolation.
**Likely files:** Prisma schema, auth, server actions, queries, tests.
**Migration plan:** add `tenantId` nullable, backfill seed, enforce gradually.
**Test plan:** cross-tenant rejection tests.
**Security plan:** tenant filter on every query/mutation.
**Performance plan:** tenant-aware indexes.
**Rollback:** keep tenant nullable during transition.

## Project 7: Agent Orchestration Dashboard

**Problem statement:** Future subagents need parent/child visibility.
**Product value:** Teaches agentic workflow management.
**Likely files:** `packages/db/prisma/schema.prisma`, `packages/agents`, `apps/web/app/agents`.
**Migration plan:** add `parentRunId` and orchestration metadata.
**Test plan:** parent/child run fixtures.
**Security plan:** approval gates.
**Performance plan:** index parent run.
**Rollback:** hide dashboard, keep flat runs.
