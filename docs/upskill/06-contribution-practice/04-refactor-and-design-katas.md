# Refactor and Design Katas

## Kata 1: Identify A Boundary Leak

Anchor: `apps/web/app/logs/page.tsx:37-60`
Task: Decide whether fingerprint grouping belongs in UI, domain, or observability.
Self-grade: Strong answer includes reuse, testability, and performance tradeoffs.

## Kata 2: Propose Outbox/Eventing

Anchor: `apps/web/lib/actions.ts:75-86`
Task: Design how ticket create and audit write could become transactional event/outbox.
Self-grade: Strong answer names transaction, retry, idempotency, and monitoring.

## Kata 3: Split Server Actions

Anchor: `apps/web/lib/actions.ts:41-530`
Task: Propose modules without breaking imports.
Self-grade: Strong answer separates tickets, incidents, jobs, agents, shared helpers.

## Kata 4: Remove Registry Type Casts

Anchor: `packages/agents/src/registry.ts:7-15`
Task: Design a type-safe registry.
Self-grade: Strong answer preserves heterogeneous input/output types.

## Kata 5: Design Schema Migration

Anchor: `packages/db/prisma/schema.prisma:244-264`
Task: Add `agentVersion`.
Self-grade: Strong answer includes default, backfill, tests, UI display.

## Kata 6: Reduce Dashboard Query Load

Anchor: `apps/web/app/page.tsx:18-43`
Task: Replace full open ticket load with aggregate queries.
Self-grade: Strong answer measures first and keeps SLA calculation accurate.

## Kata 7: Write An RFC

Topic: Agent approval workflow.
Self-grade: Strong answer includes problem, alternatives, migration, risks, test plan.

## Kata 8: Review A Flawed PR

Scenario: PR lets agents retry jobs automatically.
Anchors: `packages/agents/src/failed-job-investigation.ts:115-123`, `apps/web/lib/actions.ts:418-450`.
Self-grade: Strong answer blocks mutation without approval.
