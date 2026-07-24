# Sprint Five: Production Reliability and Platform Operations

Sprint Five prepares the app for the reliability expectations of a production enterprise system. The current app is intentionally simple: server actions mutate the database directly, agents run synchronously, logs are stored in the primary database, and there is no CI workflow. This sprint introduces the operational spine that real teams need before depending on the platform.

## Sprint Goal

The platform has safer delivery, background processing, observability, and operational runbooks so teams can deploy, monitor, and recover it with confidence.

## Feature Set

- CI pipeline for typecheck, tests, lint, build, and Prisma validation.
- Database migration workflow with documented rollback expectations.
- Background worker boundary for jobs and agent runs.
- Request IDs, structured server-action logging, and audit correlation.
- Pagination and time-window filters for high-volume pages.
- Backup, restore, retention, and incident runbooks.

## Why This Sprint Comes Fifth

The first four sprints make the product useful and secure. Sprint Five asks whether the system can survive production reality: deploys, failures, large tables, retries, slow queries, debugging, and recovery. This is where a junior engineer learns that reliability is mostly explicit process plus boring safeguards.

## Learning Outcomes

By the end of Sprint Five, the learner should be able to:

- Explain the difference between synchronous server actions and background jobs.
- Add a CI workflow that prevents known broken states from merging.
- Use migrations instead of ad hoc schema pushes for shared environments.
- Correlate an action, audit event, job, and agent run through a request ID.
- Add pagination before list pages become operational hazards.
- Write a runbook that another engineer can follow during an outage.

## Primary Files

- `package.json`
- `vitest.config.ts`
- `docker-compose.yml`
- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`
- `apps/web/lib/actions.ts`
- `apps/web/app/logs/page.tsx`
- `apps/web/app/jobs/page.tsx`
- `apps/web/app/agents/page.tsx`
- `apps/web/app/audit/page.tsx`

## Sprint Definition Of Done

- CI workflow runs quality gates on every pull request.
- Prisma migration process is documented and used.
- Background job execution has a clear worker boundary.
- Server actions emit structured logs with request IDs.
- Audit events include correlation metadata.
- High-volume pages have pagination or time-window filters.
- Production runbooks exist for deploy, rollback, backup, restore, and incident response.

