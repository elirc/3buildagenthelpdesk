# Sprint Five Implementation Playbook

## Before Coding

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Read:

- `package.json`
- `docker-compose.yml`
- `packages/db/prisma/schema.prisma`
- `apps/web/lib/actions.ts`
- `apps/web/app/logs/page.tsx`
- `apps/web/app/audit/page.tsx`
- `apps/web/app/jobs/page.tsx`
- `apps/web/app/agents/page.tsx`

Write down:

- Which pages load unbounded or high-limit lists.
- Which actions do long-running work.
- Which scripts should run in CI.

## Slice 1: CI Workflow

1. Add `.github/workflows/ci.yml`.
2. Use Node version compatible with the project.
3. Run `npm ci`.
4. Run Prisma generate.
5. Run typecheck, tests, lint, and build.
6. Document the workflow in README.

Checkpoint:

```bash
npm ci
npm run db:generate
npm run typecheck
npm run test
npm run lint
npm run build
```

## Slice 2: Migration Process Docs

1. Create database migration docs.
2. Explain `db:push` versus `db:migrate`.
3. Explain deploy-time migration command.
4. Add warning around seed reset.
5. Add reviewer checklist for schema changes.

This slice may be documentation-only unless the sprint includes an actual schema change.

## Slice 3: Request Context Helper

1. Add request ID helper.
2. Update audit writes to accept request metadata.
3. Add structured action logging.
4. Include action name, actor, entity, duration, and result.
5. Add tests for request ID format if helper is pure.

Do not log full form data.

## Slice 4: Worker Boundary

1. Add worker script package entry.
2. Add a job claim helper.
3. Add handlers by job type.
4. Move agent execution behind the `AGENT_RUN` handler.
5. Add audit events around worker success and failure.
6. Document how to run the worker locally.

Suggested command:

```bash
npm run worker
```

## Slice 5: Pagination

1. Add shared pagination param parsing.
2. Update audit page first.
3. Update logs page.
4. Update jobs page.
5. Update agent runs page.
6. Add next and previous controls.

Keep filters in the URL. This makes debugging and sharing views easier.

## Slice 6: Runbooks

1. Add `docs/runbooks`.
2. Write deploy runbook.
3. Write rollback runbook.
4. Write migration runbook.
5. Write backup and restore runbook.
6. Write worker operations runbook.
7. Write incident response runbook.

Verification:

- Every command maps to an existing script or clearly says it is future infrastructure.

## Final Verification

Run:

```bash
npm run db:generate
npm run test
npm run typecheck
npm run lint
npm run build
```

Manual QA:

- CI commands pass locally.
- Worker handles one queued job.
- Server action audit events include request ID.
- Logs and audit pagination work.
- Runbooks are accurate enough for another engineer to follow.

## PR Description Template

```md
## Summary
- Added CI workflow and production migration docs.
- Added request correlation for server actions and audit events.
- Added worker boundary for queued jobs and agent runs.
- Added pagination and time windows to high-volume pages.
- Added production runbooks.

## Tests
- npm run db:generate
- npm run test
- npm run typecheck
- npm run lint
- npm run build

## Risk
- Worker execution starts with a database-backed polling model. A managed queue should be considered before high throughput.
```

