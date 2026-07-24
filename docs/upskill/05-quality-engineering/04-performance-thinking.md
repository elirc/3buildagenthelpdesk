# Performance Thinking

## Measure First

Do not optimize because code "looks slow." Identify path, measure query count, row count, render cost, and network cost.

## Performance Domains

| Domain | Repo example | Likely hotspot |
| --- | --- | --- |
| Render | tables in `apps/web/app/logs/page.tsx:141-169` | large rows |
| Server | dashboard queries at `apps/web/app/page.tsx:18-35` | unbounded open tickets |
| DB | log filters at `apps/web/app/logs/page.tsx:23-35` | index usage and time windows |
| Worker | job rows at `packages/db/prisma/schema.prisma:222-242` | no actual worker yet |
| Bundle | shared UI in `packages/ui/src/index.tsx:1-156` | small now |
| Startup | Prisma client at `packages/db/src/index.ts:1-13` | connection availability |

## How To Find N+1

Look for loops that call Prisma inside each iteration. Current pages mostly use includes, such as ticket list at `apps/web/app/tickets/page.tsx:25-29`.

## Serial Async Work

Seed creates logs sequentially at `packages/db/src/seed.ts:351-369`. For seed readability this is okay; for production ingestion it would be too slow.

## Missing Indexes

Existing helpful indexes:

- log fingerprint: `packages/db/prisma/schema.prisma:216`
- log timestamp: `packages/db/prisma/schema.prisma:219`
- job status/type: `packages/db/prisma/schema.prisma:238`

Possible future index:

- ticket `updatedAt` or `slaDueAt` for dashboard SLA views.

## Drill

Design a version of dashboard metrics that uses aggregate queries instead of loading all open tickets.

Self-grade:

- Basic: adds `take`.
- Solid: uses counts/groupBy.
- Strong: considers indexes, stale metrics, and acceptable freshness.
