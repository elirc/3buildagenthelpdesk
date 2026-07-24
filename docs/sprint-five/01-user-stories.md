# Sprint Five User Stories

## Epic: Operable Production Platform

The platform should be something a team can deploy and support, not just run locally. This sprint adds delivery and operations practices around the existing code.

### Story 5.1: Add Continuous Integration

As a maintainer, I want CI to run quality gates so broken changes are caught before merge.

Acceptance criteria:

- Pull requests run install, typecheck, tests, lint, build, and Prisma validation.
- CI caches dependencies where practical.
- CI failure output is readable.
- README documents how CI maps to local commands.
- The workflow does not require seeded production data.

Implementation notes:

- Use GitHub Actions if the repository is hosted on GitHub.
- Keep the first workflow simple.
- Do not require Docker database startup unless integration tests need it.

### Story 5.2: Use A Migration Workflow

As a database owner, I want schema changes represented as migrations so shared environments can move forward safely.

Acceptance criteria:

- The team chooses `prisma migrate dev` for schema changes.
- Migration files are committed.
- README documents local development, review, deploy, and rollback expectations.
- Seed reset is clearly labeled local-only.
- CI validates Prisma schema.

Implementation notes:

- `db:push` can remain for throwaway local experiments.
- Production-like environments should use migrations.

### Story 5.3: Move Long-Running Work Behind A Worker Boundary

As an operator, I want jobs and agent runs to execute outside request-response paths so user actions remain responsive and retryable.

Acceptance criteria:

- Agent runs can be queued as jobs.
- A worker process claims runnable jobs.
- Job attempts, started time, finished time, and error messages are updated by the worker.
- Server actions enqueue work and return quickly.
- Failed worker execution is visible in jobs and audit.

Implementation notes:

- Start with a simple polling worker.
- Use database row state before introducing a new queue dependency.
- Document why a real queue would be needed later.

### Story 5.4: Add Request Correlation

As an engineer debugging production, I want one request ID to connect server action logs, audit events, jobs, and agent runs.

Acceptance criteria:

- Server actions create or read a request ID.
- Audit metadata includes request ID.
- Structured logs include request ID.
- Agent runs and background jobs can store or reference the request ID.
- Debug docs show how to trace one workflow.

Implementation notes:

- Use a simple generated ID first.
- Do not expose secret session identifiers.

### Story 5.5: Add Pagination And Time Windows

As an operator, I want high-volume pages to load predictably as data grows.

Acceptance criteria:

- Logs, audit events, jobs, and agent runs support pagination.
- Logs and audit events support time-window filters.
- Default page sizes are bounded.
- Query params preserve filters and page cursor or page number.
- Empty and boundary states are readable.

Implementation notes:

- Start with page-number pagination for simplicity.
- Cursor pagination can be a follow-up when records grow large.

### Story 5.6: Write Production Runbooks

As an on-call engineer, I want runbooks so I can respond to common operational failures.

Acceptance criteria:

- Create runbooks for deploy, rollback, backup, restore, database migration, and incident response.
- Each runbook has prerequisites, commands, verification, and escalation criteria.
- Runbooks reference existing npm scripts.
- Runbooks identify what is still missing for true production readiness.

Implementation notes:

- Store runbooks in `docs/runbooks`.
- Keep commands explicit and copyable.

## Nonfunctional Requirements

- Worker actions should be idempotent where possible.
- CI should be fast enough to run on every PR.
- Pagination should be applied in database queries.
- Runbooks should not rely on undocumented local state.
- Request IDs should not contain sensitive user data.

## Out Of Scope

- Kubernetes manifests.
- Full Terraform infrastructure.
- External queue services.
- OpenTelemetry collector deployment.
- Multi-region failover.

