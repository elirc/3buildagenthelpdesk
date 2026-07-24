# File Reading Order

## Junior Path

| Order | File | Why it matters | Look for | Do not get distracted by |
| --- | --- | --- | --- | --- |
| 1 | `README.md:1-126` | Setup and product identity | commands and routes | every limitation |
| 2 | `package.json:6-24` | Workspace and scripts | dev, test, build, db scripts | dependency versions |
| 3 | `packages/shared/src/index.ts:1-67` | Shared enums | status/role vocabulary | label maps yet |
| 4 | `packages/db/prisma/schema.prisma:137-164` | Ticket model | fields and relations | every other model |
| 5 | `packages/domain/src/tickets.ts:13-89` | Ticket rules | Zod schema, transitions, SLA | category inference |
| 6 | `apps/web/app/tickets/page.tsx:8-116` | Ticket list UI | query, filters, rendering | styling classes |
| 7 | `apps/web/app/tickets/[id]/page.tsx:15-51` | Detail data loading | includes and parallel reads | whole JSX tree |
| 8 | `apps/web/lib/actions.ts:41-89` | Ticket create mutation | validation, SLA, audit | all other actions |
| 9 | `tests/domain.test.ts:11-55` | Existing domain tests | test style | missing tests |
| 10 | `packages/ui/src/index.tsx:5-66` | UI primitives | components are simple | CSS details |

## Mid-Level Path

| Order | File | Why it matters | Look for | Do not get distracted by |
| --- | --- | --- | --- | --- |
| 1 | `apps/web/lib/actions.ts:92-161` | Update flow | transition enforcement and audit | form UI first |
| 2 | `packages/domain/src/permissions.ts:3-40` | RBAC boundary | capability matrix | production auth not present |
| 3 | `apps/web/lib/auth.ts:5-23` | simulated auth | cookie selection and fallback | real sessions |
| 4 | `packages/domain/src/incidents.ts:4-42` | incident rules | transition function not used in action | severity naming |
| 5 | `apps/web/lib/actions.ts:256-325` | agent persistence | lifecycle and failure path | heuristic details |
| 6 | `packages/agents/src/types.ts:16-39` | agent contract | input/output/trace | UI rendering |
| 7 | `packages/observability/src/index.ts:64-115` | anomaly scoring | deterministic score | real metrics |
| 8 | `apps/web/app/logs/page.tsx:23-60` | log grouping | filters, group reduce | visual table |
| 9 | `apps/web/app/jobs/[id]/page.tsx:19-72` | job controls | retry/dead-letter actions | card layout |
| 10 | `tests/agents.test.ts:4-69` | agent tests | fixture shapes | coverage gaps |

## Senior Path

| Order | File | Why it matters | Look for | Do not get distracted by |
| --- | --- | --- | --- | --- |
| 1 | `packages/db/prisma/schema.prisma:244-281` | generic run/audit model | referential integrity tradeoff | exact enum names |
| 2 | `apps/web/lib/actions.ts:227-254` | incident status mutation | missing transition guard | status form |
| 3 | `apps/web/lib/actions.ts:371-415` | log anomaly run | selected window and thresholds | UI text |
| 4 | `apps/web/lib/actions.ts:418-478` | job mutation | retry/dead-letter side effects | real worker absence |
| 5 | `packages/agents/src/registry.ts:7-15` | type erasure | casts and extensibility | immediate bug hunting |
| 6 | `packages/db/src/seed.ts:12-22` | destructive reset | environment safety | seed story first |
| 7 | `apps/web/app/page.tsx:18-35` | dashboard aggregation | unbounded openTickets query | small dataset |
| 8 | `docs/08-staff-engineering-audit.md` | risk inventory | prioritization | treating hypotheses as bugs |

## Drill

Pick one file from each path and answer:

1. What contract does this file own?
2. What does it import from other layers?
3. What would be risky to add here?
4. What test would catch a regression?

Self-grade:

- Basic: summarizes the file.
- Solid: names dependencies and outputs.
- Strong: identifies invariants, boundary leaks, and a targeted test.
