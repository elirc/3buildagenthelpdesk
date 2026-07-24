# Side Effects, Async, and Reliability

## Side Effects In This Repo

| Side effect | Anchor | Notes |
| --- | --- | --- |
| Audit write | `apps/web/lib/audit.ts:5-25` | separate DB write |
| Revalidate path | `apps/web/lib/actions.ts:88-89`, `apps/web/lib/actions.ts:448-449` | Next cache invalidation |
| Redirect | `apps/web/lib/actions.ts:89`, `apps/web/lib/actions.ts:415` | user navigation |
| Job retry state change | `apps/web/lib/actions.ts:429-437` | no worker executes retry |
| Agent run execution | `apps/web/lib/actions.ts:283-305` | synchronous deterministic function |
| Seed reset | `packages/db/src/seed.ts:12-22` | destructive local operation |

## Reliability Concepts

Idempotency: repeating an operation should not cause unintended duplicates. `retryJobAction` increments attempts at `apps/web/lib/actions.ts:429-434`, so a double submit changes state twice.

Retries: `canRetryJob` checks failed/retrying and attempts at `packages/domain/src/jobs.ts:14-16`.

Dead letter: `shouldDeadLetterJob` encodes max-attempt failure at `packages/domain/src/jobs.ts:18-20`, but `deadLetterJobAction` does not require the job to have reached max attempts (`apps/web/lib/actions.ts:452-478`).

Outbox pattern: not implemented. If audit/event delivery must be reliable, an outbox table plus worker would be safer than direct side effects.

Backpressure: not modeled. Log explorer uses `take: 200` at `apps/web/app/logs/page.tsx:27-28`, which is a simple cap.

Timeout handling: agents infer timeout risk from text (`packages/agents/src/failed-job-investigation.ts:46-52`), but no actual network timeouts exist.

## Risky Places

- Multi-write flows without transactions.
- Retry buttons with no idempotency key.
- Agent runs executed synchronously inside server action.
- Seed reset has no environment guard.

## Drill

Write a design note for converting job retry into a real worker flow. Include state transitions, idempotency key, retry delay, audit, and failure visibility.
