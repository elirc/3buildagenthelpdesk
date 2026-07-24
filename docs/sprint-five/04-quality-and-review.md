# Sprint Five Quality And Review Guide

## Test Plan

Automated tests:

- Pagination parsing.
- Job claim helper.
- Job transition behavior.
- Request ID generation.
- Worker failure path.
- Existing domain and agent tests.

Manual tests:

- Run all CI commands locally.
- Confirm CI file uses the same commands.
- Run a migration locally.
- Queue and process one job.
- Confirm audit events include request IDs.
- Confirm logs, jobs, agents, and audit pages are paginated.
- Read runbooks and verify commands exist.

## Review Checklist

CI:

- Workflow is not overly complex.
- Commands match local scripts.
- Prisma generate runs before TypeScript checks.
- Failures are easy to diagnose.

Migrations:

- Shared environments use migrations.
- Seed reset is documented as local-only.
- Schema changes have reviewer notes.
- Rollback expectations are honest.

Worker:

- Job claiming is safe enough for expected concurrency.
- Failed jobs record useful error messages.
- Agent runs no longer block request-response paths.
- Worker logs include request or correlation context.

Observability:

- Server actions log success and failure.
- Audit events include request ID.
- Sensitive input is not logged.
- Runbooks explain how to follow a request through the system.

Performance:

- High-volume pages have bounded queries.
- Filters are applied before pagination.
- Page size has a maximum.
- Time-window filters use indexed fields.

## Common Junior Mistakes

- Adding CI commands that do not match local scripts.
- Treating `db:push` as a production migration strategy.
- Running agents synchronously from a worker and still leaving old synchronous action paths active.
- Logging raw form data.
- Paginating after fetching records.
- Writing runbooks with commands that do not exist.

## Debugging Prompts

If CI fails only in GitHub:

- Is the Node version different?
- Did Prisma generate run?
- Does the workflow need environment variables?
- Is a database required for the failing command?

If the worker processes a job twice:

- Is the claim operation atomic?
- Does the worker filter out `RUNNING` jobs?
- Does a failed handler reset state correctly?

If request correlation is missing:

- Is the request ID created before the audit write?
- Does the helper pass metadata through every action?
- Are worker-created events inheriting job metadata?

If pagination skips records:

- Is ordering stable?
- Are page and page size parsed safely?
- Are filters changing between requests?

## Demo Script

1. Show CI workflow and map each step to a local command.
2. Show migration policy docs.
3. Trigger a server action and find its request ID in audit.
4. Queue an agent run job.
5. Run the worker and show job and agent status changes.
6. Open logs and audit pages with pagination.
7. Walk through rollback and incident response runbooks.

## Retrospective Questions

- Which reliability feature prevented the most risk?
- What still requires external infrastructure?
- Which runbook would be hardest to execute under stress?
- Where did request correlation require more plumbing than expected?
- When would a database-backed queue stop being enough?

