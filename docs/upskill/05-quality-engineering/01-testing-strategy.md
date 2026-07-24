# Testing Strategy

## Current Test Layers

| Layer | Current coverage | Anchors | Gaps |
| --- | --- | --- | --- |
| Domain unit | yes | `tests/domain.test.ts:11-55` | more edge cases |
| Agent unit | yes | `tests/agents.test.ts:4-69` | more fixtures and output schemas |
| Server action integration | no direct coverage found | `apps/web/lib/actions.ts:41-530` | create/update/audit/agent lifecycle |
| DB integration | no direct coverage found | `packages/db/prisma/schema.prisma:111-281` | relation and seed tests |
| UI route | no direct coverage found | `apps/web/app/*` | rendering and forms |
| E2E | none found | routes in `apps/web/app/layout.tsx:15-23` | browser-level flow |
| Type tests | implicit through `tsc` | `package.json:14` | enum drift checks |

## What Belongs Where

Unit tests:

- pure domain rules
- agent heuristics
- log scoring
- permission matrix

Integration tests:

- server action writes
- audit event creation
- Prisma relation traversal
- seed coherence

UI tests:

- route renders
- filters change query
- buttons enabled/disabled

E2E tests:

- create ticket
- run agent
- retry job
- inspect audit

What not to test:

- exact CSS class names unless they represent behavior
- Prisma internals
- Next internals
- every repeated table row if one representative assertion is enough

## Fixtures and Flake Prevention

- Use fixed dates when testing SLA (`tests/domain.test.ts:18-39` already does this).
- Avoid real database for pure tests.
- Use deterministic agent inputs.
- Avoid tests that depend on seeded relative "now" unless controlled.

## Drill

Write a test plan for `updateTicketAction`. Include success, invalid transition, permission failure, audit event, and SLA recalculation.
