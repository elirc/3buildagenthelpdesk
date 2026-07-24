# Writing Tests Here

## Existing Style

Tests import from packages and assert deterministic behavior:

- `tests/domain.test.ts:1-55`
- `tests/agents.test.ts:1-69`

Run:

```bash
npm run test
```

Targeted run:

```bash
npx vitest run tests/agents.test.ts
```

## Recipe 1: Happy Path Domain Test

Use a pure function:

```ts
// Illustrative fake code: adapt to the repo.
expect(canRetryJob("FAILED", 1, 3)).toBe(true);
```

Anchor: `packages/domain/src/jobs.ts:14-16`.

## Recipe 2: Validation Failure

Test Zod schema rejects invalid email:

Anchor: `packages/domain/src/tickets.ts:13-24`.

## Recipe 3: Permission Failure

Test capability matrix:

Anchor: `packages/domain/src/permissions.ts:14-40`.

## Recipe 4: Cross-Resource Rejection

Not implemented yet. Design a policy test for "support agent cannot update another team's ticket." This requires a new domain policy before implementation.

## Recipe 5: Async Side Effect

For `persistAgentRun`, use an integration test with a test DB or Prisma test double. Assert `RUNNING` then `SUCCEEDED` shape and audit events.

Anchor: `apps/web/lib/actions.ts:256-325`.

## Recipe 6: Migration/Schema Behavior

After adding a field, test seed still creates coherent records. Anchor: `packages/db/src/seed.ts:55-598`.

## Recipe 7: UI State

For job retry button, test disabled when `canRetryJob` returns false. Anchor: `apps/web/app/jobs/[id]/page.tsx:65-68`.

## Recipe 8: Agent Fixture Regression

Add a stable fixture for webhook rate limit. Anchor: `packages/agents/src/failed-job-investigation.ts:75-80`.

## Suggested New Test Files

- `tests/permissions.test.ts`
- `tests/jobs.test.ts`
- `tests/logs.test.ts`
- `tests/incidents.test.ts`
- `tests/server-actions.integration.test.ts`
- `tests/seed.integration.test.ts`

## Self-Grade

- Basic: adds one assertion.
- Solid: covers edge cases.
- Strong: writes a test that would fail before the intended fix.
