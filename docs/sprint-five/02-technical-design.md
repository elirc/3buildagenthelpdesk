# Sprint Five Technical Design

## CI Design

Use the same local commands developers run:

```bash
npm ci
npm run db:generate
npm run typecheck
npm run test
npm run lint
npm run build
```

CI should fail when:

- TypeScript contracts drift.
- Domain or agent tests fail.
- Next.js build fails.
- Prisma schema cannot generate a client.
- Lint catches invalid framework usage.

If integration tests are later added, introduce a Postgres service container in CI.

## Migration Design

Current scripts support both `db:push` and `db:migrate`. Production-like workflows should use migrations.

Recommended policy:

- `db:push`: local throwaway prototypes only.
- `db:migrate`: feature branches and shared development.
- `prisma migrate deploy`: staging and production.
- Seed reset: local demos only.

Document rollback expectations. Prisma migrations do not automatically provide perfect down migrations, so rollback often means deploy a forward fix or restore from backup.

## Worker Boundary

Start with a database-backed worker because the app already has `BackgroundJob`.

Worker loop:

1. Find a queued or retrying job.
2. Claim it by setting status to `RUNNING`.
3. Execute by type.
4. Mark `SUCCEEDED`, `FAILED`, or `DEAD_LETTERED`.
5. Write audit and structured logs.

Concurrency risks:

- Two workers can claim the same job without locking.
- Long jobs need heartbeat or timeout handling.
- Retried jobs need idempotent handlers.

First production-ish fix:

- Use a transaction when claiming work.
- Add `lockedAt` and `lockedBy` if multiple workers are expected.

## Agent Queueing

Today, server actions run agents synchronously and then redirect. Sprint Five should enqueue an `AGENT_RUN` job and let a worker execute it.

Suggested flow:

1. Server action creates `AgentRun` with `PENDING`.
2. Server action creates `BackgroundJob` of type `AGENT_RUN`.
3. Worker claims job.
4. Worker runs registered agent.
5. Worker updates `AgentRun` to `SUCCEEDED` or `FAILED`.
6. Worker writes audit events.

This preserves the deterministic agent model while making execution operationally safer.

## Request Correlation

Create a lightweight request context helper.

Suggested metadata:

```ts
{
  requestId: string;
  actorUserId: string;
  actorRole: string;
  route: string;
}
```

Use it in:

- Audit events.
- Structured logs.
- Background job payload metadata.
- Agent run input or metadata, if the model is extended.

Avoid putting secrets or cookies into the request ID.

## Pagination And Time Windows

Pages that need bounded reads:

- `/logs`
- `/jobs`
- `/agents`
- `/audit`

Add:

- `page`
- `pageSize`
- `from`
- `to`

For first version:

- Default page size: 50.
- Maximum page size: 200.
- Sort by descending timestamp or creation time.
- Apply filters in Prisma query.

## Runbook Design

Create:

- `docs/runbooks/deploy.md`
- `docs/runbooks/rollback.md`
- `docs/runbooks/database-migration.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/worker-operations.md`

Each runbook:

- Purpose.
- Prerequisites.
- Commands.
- Verification.
- Rollback or escalation.
- Known gaps.

## Testing Strategy

Unit tests:

- Pagination param parsing.
- Request ID generation.
- Job state transition helpers.
- Worker handler selection.

Integration tests:

- Queue agent run and execute worker once.
- Failed worker updates job and agent status.
- Audit event includes request ID.

Manual tests:

- CI commands run locally.
- Worker processes one seeded job.
- Logs page paginates.
- Audit date filter works.
- Runbook commands are accurate.

## Risk Notes

- Database-backed workers are simple but can become contention-heavy.
- Request IDs must be passed consistently or correlation becomes unreliable.
- Pagination can change user expectations if current pages show all records.
- Migration rollout requires discipline; `db:push` should not be used on shared environments.

