# Domain Glossary

| Term | Meaning | Where it appears | Confusing neighbor |
| --- | --- | --- | --- |
| User | Internal operator using the platform | `packages/db/prisma/schema.prisma:111-125`, `packages/shared/src/index.ts:1-2` | requester email on a ticket is not a `User` |
| Role | Coarse permission category | `packages/shared/src/index.ts:1`, `packages/domain/src/permissions.ts:14-30` | capability |
| Capability | Action a role may perform | `packages/domain/src/permissions.ts:3-12` | UI button visibility |
| Team | Internal ownership group | `packages/db/prisma/schema.prisma:127-135` | assigned user |
| Ticket | Customer support issue | `packages/db/prisma/schema.prisma:137-164` | incident |
| Ticket comment | Note attached to a ticket | `packages/db/prisma/schema.prisma:166-175` | audit event |
| Internal note | Comment not meant as customer-facing communication | `packages/db/prisma/schema.prisma:172-174`, `apps/web/app/tickets/[id]/page.tsx:174-193` | customer comment |
| SLA | Due date based on ticket priority | `packages/domain/src/tickets.ts:57-89` | incident severity |
| Incident | Service-impacting operational event | `packages/db/prisma/schema.prisma:177-197` | ticket |
| Severity | Incident impact tier | `packages/db/prisma/schema.prisma:52-57`, `packages/domain/src/incidents.ts:31-42` | ticket priority |
| Structured log | Application event with service, env, level, metadata | `packages/db/prisma/schema.prisma:199-220` | audit event |
| Fingerprint | Hash for grouping similar logs | `packages/domain/src/logs.ts:14-23`, `apps/web/app/logs/page.tsx:37-60` | request id |
| Background job | Queue-like unit of work | `packages/db/prisma/schema.prisma:222-242` | agent run job type |
| Dead-lettered | Job no longer being retried | `packages/shared/src/index.ts:51` | failed |
| Agent | Deterministic local analyzer | `packages/agents/src/types.ts:33-39` | LLM |
| Agent run | Persisted execution record | `packages/db/prisma/schema.prisma:244-264`, `apps/web/lib/actions.ts:256-325` | background job |
| Trace | Agent reasoning/debug steps | `packages/agents/src/types.ts:3-8` | structured log |
| Audit event | Record of important user/system action | `packages/db/prisma/schema.prisma:266-281`, `apps/web/lib/audit.ts:5-25` | structured log |

## What Juniors Usually Miss

- Ticket priority and incident severity are different axes.
- Agent runs target generic entity ids; they are not foreign-keyed to tickets/jobs/incidents.
- Audit events are about "who changed what"; structured logs are about system behavior.
- A background job row is not a real executing worker in this MVP.

## Drill

Choose three terms and trace them through:

1. shared enum or schema field,
2. Prisma model,
3. UI route,
4. test or missing test.

Self-grade:

- Basic: gives a plain definition.
- Solid: points to schema and UI.
- Strong: explains why the term is distinct from a near-synonym.
