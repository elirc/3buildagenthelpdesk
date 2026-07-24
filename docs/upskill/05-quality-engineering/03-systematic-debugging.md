# Systematic Debugging

Method:

1. Reproduce.
2. Narrow layer: UI, action, domain, DB, agent, test.
3. Form a cheap hypothesis.
4. Probe with logs, queries, or focused tests.
5. Fix root cause.
6. Add regression coverage.

## Scenario: Ticket Save Throws Error

**Reproduction:** Edit a ticket and choose a status not in allowed transition.
**First question:** Is the bug in UI options or server transition guard?
**Narrowing path:**

1. Check allowed status list at `apps/web/app/tickets/[id]/page.tsx:48-50`.
2. Check server assertion at `apps/web/lib/actions.ts:97-100`.
3. Check transition map at `packages/domain/src/tickets.ts:34-42`.

**Useful probes:**

- Add a temporary unit test around `canTransitionTicket`.
- Inspect form field name `status` at `apps/web/app/tickets/[id]/page.tsx:109-117`.

**Regression test:** server-action integration test for invalid transition.

**Senior lesson:** UI should guide, server should enforce.

## Scenario: Anomaly Agent Does Not Recommend Incident

**Reproduction:** Run anomaly agent on a filtered log set.
**First question:** Is the selected log window production and high enough score?
**Narrowing path:**

1. Check log query at `apps/web/lib/actions.ts:381-390`.
2. Check scoring at `packages/observability/src/index.ts:75-115`.
3. Check threshold at `packages/agents/src/log-anomaly.ts:74`.

**Regression test:** fixture with production errors and expected `shouldCreateIncident`.

## Scenario: Retry Button Disabled Unexpectedly

**Reproduction:** Open a failed job and retry is disabled.
**First question:** Is domain eligibility false or UI passed wrong values?
**Narrowing path:**

1. Check UI condition at `apps/web/app/jobs/[id]/page.tsx:65-68`.
2. Check `canRetryJob` at `packages/domain/src/jobs.ts:14-16`.
3. Check job attempts/max attempts in DB.

**Regression test:** `canRetryJob("FAILED", 2, 3)` true and `canRetryJob("FAILED", 3, 3)` false.

## Scenario: Agent Detail Shows Empty Findings

**Reproduction:** Open an agent run and findings are blank.
**First question:** Is output missing, malformed, or reader too strict?
**Narrowing path:**

1. Check output persisted at `apps/web/lib/actions.ts:289-295`.
2. Check reader at `apps/web/app/agents/[id]/page.tsx:9-21`.
3. Inspect raw JSON block at `apps/web/app/agents/[id]/page.tsx:91-96`.

**Regression test:** render or unit-test reader with old output shape.

## Scenario: Dashboard Slow With More Data

**Reproduction:** Seed many tickets/logs and load `/`.
**First question:** Is slowness query count, query size, or render size?
**Narrowing path:**

1. Inspect dashboard queries at `apps/web/app/page.tsx:18-35`.
2. Note open tickets query has no `take` at `apps/web/app/page.tsx:19-23`.
3. Use Prisma query logging in `packages/db/src/index.ts:3-11` if needed.

**Regression test:** not a unit test; add performance budget or query shape assertion.

## Tools

- Browser devtools network panel for route timing.
- Prisma Studio via `npm run db:studio`.
- Vitest targeted runs.
- Temporary structured logs around server actions.
- Next build output for route and bundle checks.
