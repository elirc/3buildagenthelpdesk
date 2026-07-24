# Architecture Critique

## Strongest Design Choices

- Modular monolith is appropriate for a learning MVP: `package.json:6-9`.
- Domain rules are separated from React, especially tickets: `packages/domain/src/tickets.ts:13-142`.
- Agents are pure and deterministic: `packages/agents/src/types.ts:33-39`.
- Agent runs persist input/output/trace: `packages/db/prisma/schema.prisma:244-264`.
- Audit events exist from the start: `packages/db/prisma/schema.prisma:266-281`.
- UI system avoids Tailwind and keeps repeated primitives small: `packages/ui/src/index.tsx:5-156`.

## Confirmed Issues

1. Incident transitions exist but are not enforced in `updateIncidentStatusAction` (`packages/domain/src/incidents.ts:20-29`, `apps/web/lib/actions.ts:227-254`).
2. Server-action integration tests are missing for persistence and audit behavior.
3. Agent output JSON has no runtime schema version (`packages/db/prisma/schema.prisma:250-258`).
4. Seed reset is destructive and has no environment guard (`packages/db/src/seed.ts:12-22`).

## Hypotheses To Investigate

- Dashboard open ticket query may become slow because it loads all open tickets (`apps/web/app/page.tsx:19-23`).
- Log explorer grouping may belong in observability/domain if reused (`apps/web/app/logs/page.tsx:37-60`).
- Role checks may be too coarse for real operations (`packages/domain/src/permissions.ts:14-30`).

## Priority Improvements

| Priority | Improvement | Migration path | Test strategy |
| --- | --- | --- | --- |
| 1 | Enforce incident transitions | call `canTransitionIncident` or add assert helper | unit test transitions, server action integration |
| 2 | Add server-action integration tests | create test DB or Prisma mock boundary | create/update ticket, audit events, agent run lifecycle |
| 3 | Add agent input/output schemas | add Zod schemas per agent, validate before persist | fixture tests and backward-compatible old JSON test |
| 4 | Add request id to audit metadata | generate per action, pass to audit/logs | assert metadata exists |
| 5 | Add seed safety guard | refuse production env | unit test guard |
| 6 | Add resource-level authorization | policy helpers by entity/team | role/team matrix tests |

## If I Owned This For 3 Months

Month 1:

- Fill integration test gaps.
- Harden incident transitions, seed guard, and job mutation checks.
- Add agent schema versions.

Month 2:

- Extract application services from large server actions.
- Add request-id observability and audit timeline.
- Add log time-window filters and query validation.

Month 3:

- Add approval workflow for agent recommendations.
- Add postmortem agent.
- Add CI workflow and documented release checks.

## Senior Design Question

What should stay generic, and what should become relationally strict? Agent targets and audit entities are flexible, but flexibility pushes cleanup and correctness into application code.
