# Review Katas

## Kata 1: Incident Status Shortcut

**Author intent:** Let users jump incidents from resolved back to investigating.
**Fake diff summary:** Removes incident transition checks from a new helper.
**Files this resembles:** `packages/domain/src/incidents.ts:20-29`, `apps/web/lib/actions.ts:227-254`.
**Your task:** Review this PR.
**Expected findings:**

Blocking:

- Incident transitions must be enforced server-side.

Important:

- Add tests for allowed and rejected transitions.

Optional:

- Improve error message copy.

**Good review comment example:**

> This needs a server-side transition guard. The UI can offer helpful options, but the invariant belongs in domain and must be enforced in the action.

## Kata 2: Agent Output Shape Change

**Author intent:** Rename `findings` to `observations`.
**Files this resembles:** `packages/agents/src/types.ts:22-31`, `apps/web/app/agents/[id]/page.tsx:9-21`.
**Expected findings:**

Blocking:

- Existing persisted runs may still have `findings`.

Important:

- Add output versioning or backward-compatible reader.

## Kata 3: Retry All Failed Jobs

**Author intent:** Add a bulk retry button.
**Files this resembles:** `apps/web/lib/actions.ts:418-450`.
**Expected findings:**

Blocking:

- Bulk retry needs idempotency and per-job eligibility.

Important:

- Audit each job or create a batch audit entity.

## Kata 4: Add Ticket Status

**Author intent:** Add `REOPENED`.
**Files this resembles:** `packages/shared/src/index.ts:4-13`, `packages/db/prisma/schema.prisma:18-26`, `packages/domain/src/tickets.ts:34-42`.
**Expected findings:**

Blocking:

- Shared enum, Prisma enum, transitions, labels, seeds, tests must all update.

## Kata 5: Move Anomaly Scoring Into Page

**Author intent:** Inline scoring in log explorer.
**Files this resembles:** `packages/observability/src/index.ts:64-115`, `apps/web/app/logs/page.tsx:37-60`.
**Expected findings:**

Important:

- Keep reusable scoring in observability package; page can format.

## Kata 6: Hide Admin Buttons In UI Only

**Author intent:** Remove server permission check because button is hidden.
**Files this resembles:** `apps/web/lib/actions.ts:419-421`, `packages/domain/src/permissions.ts:14-30`.
**Expected findings:**

Blocking:

- UI is not an authorization boundary.

## Kata 7: Seed Production Data

**Author intent:** Reuse seed script in staging.
**Files this resembles:** `packages/db/src/seed.ts:12-22`.
**Expected findings:**

Blocking:

- Seed deletes all rows; add environment guard.

## Kata 8: Add Real LLM API Key

**Author intent:** Replace deterministic agents with real LLM calls.
**Files this resembles:** `packages/agents/src/types.ts:33-39`.
**Expected findings:**

Blocking:

- This violates project constraint; add adapter boundary only if explicitly approved.

## Kata 9: Query Logs Without Limit

**Author intent:** Show all logs.
**Files this resembles:** `apps/web/app/logs/page.tsx:23-29`.
**Expected findings:**

Important:

- Add pagination/time windows instead of unbounded query.

## Kata 10: Remove Audit Event On Ticket Update

**Author intent:** Simplify code.
**Files this resembles:** `apps/web/lib/actions.ts:129-157`.
**Expected findings:**

Blocking:

- Auditability is a product requirement.

## Kata 11: Type Cast Query Params

**Author intent:** Add new filters using `as never`.
**Files this resembles:** `apps/web/app/logs/page.tsx:14-21`.
**Expected findings:**

Important:

- Prefer Zod validation or typed enum guard for URL params.

## Kata 12: Job Agent Executes Retry

**Author intent:** Let agent retry automatically when confidence is high.
**Files this resembles:** `packages/agents/src/failed-job-investigation.ts:28-126`, `apps/web/lib/actions.ts:480-530`.
**Expected findings:**

Blocking:

- Recommendations need human approval before mutation.

Important:

- Add approval workflow and audit trail first.
