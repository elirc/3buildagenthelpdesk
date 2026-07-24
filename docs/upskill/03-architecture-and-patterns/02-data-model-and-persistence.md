# Data Model and Persistence

## Core Entities

| Entity | Schema anchor | Purpose | Key relationships |
| --- | --- | --- | --- |
| User | `packages/db/prisma/schema.prisma:111-125` | internal operator | team, tickets, comments, incidents, audit, agent runs |
| Team | `packages/db/prisma/schema.prisma:127-135` | ownership group | users, tickets |
| Ticket | `packages/db/prisma/schema.prisma:137-164` | customer issue | comments, logs, jobs, optional incident |
| Incident | `packages/db/prisma/schema.prisma:177-197` | service event | tickets, logs, jobs, owner |
| StructuredLog | `packages/db/prisma/schema.prisma:199-220` | application log | optional ticket/incident |
| BackgroundJob | `packages/db/prisma/schema.prisma:222-242` | async job row | optional ticket/incident |
| AgentRun | `packages/db/prisma/schema.prisma:244-264` | persisted agent execution | generic target |
| AuditEvent | `packages/db/prisma/schema.prisma:266-281` | mutation history | generic entity |

## Indexes

Important indexes:

- Ticket status/priority: `packages/db/prisma/schema.prisma:161`.
- Log service/environment/level: `packages/db/prisma/schema.prisma:215`.
- Log fingerprint: `packages/db/prisma/schema.prisma:216`.
- Job status/type: `packages/db/prisma/schema.prisma:238`.
- Agent target lookup: `packages/db/prisma/schema.prisma:262`.
- Audit entity lookup: `packages/db/prisma/schema.prisma:278`.

## Transaction Boundaries

Current multi-write flows are not wrapped in explicit transactions. Example: `createTicketAction` writes ticket at `apps/web/lib/actions.ts:75-77`, then audit at `apps/web/lib/actions.ts:79-86`.

This is acceptable for a learning MVP, but production expectations differ. If audit consistency becomes mandatory, wrap mutation and audit in `prisma.$transaction`.

## Safely Changing Schema

1. Update `packages/db/prisma/schema.prisma`.
2. Update shared enum constants if enums changed (`packages/shared/src/index.ts:1-65`).
3. Update domain validation schemas.
4. Generate Prisma client: `npm run db:generate`.
5. Add or update tests.
6. Use `npm run db:migrate` for migration files when persistence history matters.
7. Update seed data if the required fields changed.
8. Update docs and risk register.

## Drill

Design an `AgentApproval` model. Include foreign keys, status enum, reviewer, timestamps, and indexes. Explain why a generic `targetType`/`targetId` may or may not be acceptable.
