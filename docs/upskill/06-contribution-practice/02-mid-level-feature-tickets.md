# Mid-Level Feature Tickets

Each ticket crosses layers and requires design notes before code.

## Ticket 1: Enforce Incident Transitions

**Scope:** domain, server action, tests, UI error handling.
**Anchors:** `packages/domain/src/incidents.ts:20-29`, `apps/web/lib/actions.ts:227-254`.
**Design notes required:** expected invalid transition behavior.
**Acceptance criteria:** server action rejects invalid transition; tests cover valid/invalid.
**Risk:** users may see framework error until form error handling improves.
**Rollback:** revert action enforcement if migration blocks demos.

## Ticket 2: Agent Output Zod Schemas

**Scope:** agents, tests, agent detail reader.
**Anchors:** `packages/agents/src/types.ts:22-31`, `apps/web/app/agents/[id]/page.tsx:9-21`.
**Acceptance criteria:** each agent validates output before persistence.
**Risk:** old runs may not match new schemas.
**Rollback:** soft-validate and warn before hard fail.

## Ticket 3: Request ID Propagation

**Scope:** server actions, audit metadata, logs, docs.
**Anchors:** `apps/web/lib/actions.ts:41-530`, `apps/web/lib/audit.ts:5-25`.
**Acceptance criteria:** every audit write includes request id.
**Risk:** inconsistent adoption.
**Rollback:** helper default generation.

## Ticket 4: Log Time Window Filters

**Scope:** UI, query validation, tests.
**Anchors:** `apps/web/app/logs/page.tsx:14-35`, `packages/domain/src/logs.ts:5-12`.
**Acceptance criteria:** validated 1h, 6h, 24h filters.
**Risk:** timezone confusion.
**Rollback:** remove param handling.

## Ticket 5: Server Action Integration Test Harness

**Scope:** test config, DB setup, server actions.
**Anchors:** `apps/web/lib/actions.ts:41-530`, `packages/db/prisma/schema.prisma:111-281`.
**Acceptance criteria:** at least ticket create persists audit event.
**Risk:** slow or flaky tests.
**Rollback:** mark as optional integration suite.

## Ticket 6: Dead-Letter Reason Field

**Scope:** Prisma schema, form, action, audit, tests.
**Anchors:** `packages/db/prisma/schema.prisma:222-242`, `apps/web/lib/actions.ts:452-478`.
**Acceptance criteria:** reason required when manually dead-lettering.
**Risk:** migration affects existing rows.
**Rollback:** nullable field.

## Ticket 7: Agent Approval Workflow MVP

**Scope:** schema, actions, UI, audit.
**Anchors:** `packages/db/prisma/schema.prisma:244-264`, `apps/web/app/agents/[id]/page.tsx:59-96`.
**Acceptance criteria:** recommendations can be approved/rejected, not auto-applied.
**Risk:** scope creep.
**Rollback:** keep approval records read-only.

## Ticket 8: Resource-Level Ticket Authorization

**Scope:** domain policy, actions, tests.
**Anchors:** `packages/domain/src/permissions.ts:14-40`, `apps/web/lib/actions.ts:92-161`.
**Acceptance criteria:** support users can update only assigned/team tickets.
**Risk:** seed users lose demo ability.
**Rollback:** feature flag policy in dev.

## Ticket 9: Dashboard Aggregation Refactor

**Scope:** Prisma queries, dashboard page, tests.
**Anchors:** `apps/web/app/page.tsx:18-43`.
**Acceptance criteria:** open counts use aggregate/groupBy where possible.
**Risk:** more complex query code.
**Rollback:** keep old query behind helper.

## Ticket 10: Seed Safety Guard

**Scope:** seed script, docs, tests.
**Anchors:** `packages/db/src/seed.ts:12-22`, `package.json:23`.
**Acceptance criteria:** refuses production environment.
**Risk:** local scripts need documented override.
**Rollback:** allow explicit `ALLOW_SEED_RESET=true`.

## Ticket 11: Agent Evaluation Fixture Suite

**Scope:** tests, fixtures, agent docs.
**Anchors:** `tests/agents.test.ts:4-69`, `packages/agents/src/*.ts`.
**Acceptance criteria:** fixtures cover billing, auth, webhook, db timeout, permission, rate limit.
**Risk:** brittle copy-heavy tests.
**Rollback:** table fixtures.

## Ticket 12: Audit Timeline Component

**Scope:** UI package, ticket/incident/job pages.
**Anchors:** `apps/web/app/tickets/[id]/page.tsx:248-258`, `apps/web/app/jobs/[id]/page.tsx:140-150`.
**Acceptance criteria:** shared timeline component renders consistent audit events.
**Risk:** over-abstraction.
**Rollback:** keep component narrow.
