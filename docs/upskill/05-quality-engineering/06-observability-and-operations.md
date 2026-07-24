# Observability and Operations

## Current Observability

- Audit event helper: `apps/web/lib/audit.ts:5-25`.
- Audit model: `packages/db/prisma/schema.prisma:266-281`.
- Structured log model: `packages/db/prisma/schema.prisma:199-220`.
- Anomaly scoring helper: `packages/observability/src/index.ts:64-115`.
- Dashboard metrics: `apps/web/app/page.tsx:18-43`.

## Gaps

- No request id propagation across server actions.
- No metrics sink.
- No tracing.
- No health check route.
- No alert thresholds.
- No error boundary strategy.
- Agent failures are persisted but not highly visible.
- Logs are static seed data, not ingested.

## How Would I Know This Broke?

| Flow | Current signal | Missing signal |
| --- | --- | --- |
| ticket create | audit event if successful | structured error log on failure |
| ticket update | audit event | validation error tracking |
| incident update | audit event | invalid transition metric |
| job retry | audit event | idempotency or worker result |
| agent run | agent run status | duration, failure rate, low-confidence alert |
| log anomaly | agent output | baseline trend |

## Local vs Production

Local:

- seed data is realistic but static.
- active user is a cookie simulation.
- Postgres can be Docker Compose.

Production would need:

- real auth
- secret management
- migrations
- backups
- CI
- deployment health checks
- log/metric/trace sinks

## Drill

Add a design for request id propagation:

1. Generate id in each server action.
2. Add it to audit metadata.
3. Add it to structured logs.
4. Show it on agent run detail.

Self-grade:

- Basic: stores request id.
- Solid: links action, audit, and agent run.
- Strong: includes tests and privacy considerations.
