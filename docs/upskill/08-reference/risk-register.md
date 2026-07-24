# Risk Register

| Risk | Evidence | File anchors | Impact | Likelihood | Suggested test | Suggested fix | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Incident transitions not enforced | domain rule exists, action does not call it | `packages/domain/src/incidents.ts:20-29`, `apps/web/lib/actions.ts:227-254` | invalid incident states | medium | server action invalid transition test | call assert helper | high |
| Coarse RBAC only | role capability matrix lacks resource scope | `packages/domain/src/permissions.ts:14-30` | IDOR-style updates | medium | role/team matrix tests | add resource policies | high |
| Ticket create and audit not transactional | separate writes | `apps/web/lib/actions.ts:75-86` | missing audit or partial write | low-medium | integration test with forced audit failure | Prisma transaction | high |
| Agent outputs lack schema version | JSON output only | `packages/db/prisma/schema.prisma:250-258` | old runs may break UI | medium | old-output fixture test | add `agentVersion` and schemas | high |
| Registry weakens types | casts through unknown | `packages/agents/src/registry.ts:7-15` | wrong input shape can compile | medium | registry contract tests | typed registry helper | high |
| Log filters cast query params | `as never` | `apps/web/app/logs/page.tsx:14-21` | invalid query behavior | medium | invalid query param test | Zod filter parsing | high |
| Dashboard unbounded open tickets | no `take` or aggregation | `apps/web/app/page.tsx:19-23` | slow dashboard | medium as data grows | performance/query test | aggregate queries | medium |
| Seed reset unsafe | deletes all rows | `packages/db/src/seed.ts:12-22` | data loss if misused | low locally, high if prod | env guard test | refuse production seed | high |
| Retry not idempotent | attempts increments | `apps/web/lib/actions.ts:429-437` | double-submit attempts | medium | double-submit integration test | idempotency key | medium |
| Dead-letter has no reason | action only sets status | `apps/web/lib/actions.ts:452-478` | poor auditability | medium | action requires reason test | add reason field | high |
| Logs stored in primary DB | log model in Prisma | `packages/db/prisma/schema.prisma:199-220` | scale/retention issue | low now, high later | large log fixture/perf test | retention/time windows | medium |
| Redaction helper not enforced | helper exists only | `packages/observability/src/index.ts:117-127` | sensitive metadata leakage | medium | metadata redaction integration | call helper on ingestion | medium |
| Server actions huge | one file owns many domains | `apps/web/lib/actions.ts:41-530` | maintainability risk | medium | no test; review metric | split by domain | high |
| UI lacks mutation error states | actions throw | `apps/web/lib/actions.ts:41-530` | poor UX | medium | route/action error tests | form state handling | medium |
| No CI workflow found | no `.github/workflows` in file inventory | file inventory | regressions missed | medium | CI dry run | add workflow | high |
