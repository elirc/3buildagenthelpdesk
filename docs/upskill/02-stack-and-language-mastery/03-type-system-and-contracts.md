# Type System and Contracts

## Concept: Contracts

A contract is a promise about shape or behavior. In this repo, contracts exist at several levels:

- shared enum constants: `packages/shared/src/index.ts:1-65`
- Prisma schema: `packages/db/prisma/schema.prisma:10-109`, `packages/db/prisma/schema.prisma:111-281`
- Zod schemas: `packages/domain/src/tickets.ts:13-29`, `packages/domain/src/incidents.ts:4-15`
- TypeScript agent types: `packages/agents/src/types.ts:16-39`
- tests: `tests/domain.test.ts:11-55`, `tests/agents.test.ts:4-69`

## TypeScript Patterns In This Repo

### Literal Union From Const Array

`packages/shared/src/index.ts:1-65` defines arrays like `TICKET_STATUSES` and then derives types from them. This keeps UI options and domain types aligned.

Failure mode: Prisma enums are separate at `packages/db/prisma/schema.prisma:18-26`. A future enum change must update both places.

Drill: Add a hypothetical `REOPENED` ticket status on paper. List every file that must change.

### Zod Runtime Validation

Ticket form input is parsed by `createTicketSchema` at `packages/domain/src/tickets.ts:13-24`, then used in `apps/web/lib/actions.ts:46-57`.

Failure mode: Update ticket action does not use `updateTicketSchema`; it manually reads and casts at `apps/web/lib/actions.ts:97-125`.

Drill: Design a refactor that uses `updateTicketSchema` without losing transition checks.

### Unknown vs Any

The agent detail page narrows `unknown` output safely at `apps/web/app/agents/[id]/page.tsx:9-21`. That is better than assuming persisted JSON always has the current shape.

Failure mode: registry casts agents through `unknown` at `packages/agents/src/registry.ts:7-15`; this is an extensibility compromise but weakens compile-time guarantees.

Drill: Explain why persisted JSON needs runtime shape checks even if TypeScript says the agent output has a type.

### Prisma JSON Casts

Prisma JSON fields require `Prisma.InputJsonValue`, so server actions cast agent input/output at `apps/web/lib/actions.ts:269-295`.

Failure mode: casts can hide non-serializable values. A Date inside JSON input should be converted to string first, as log anomaly action does at `apps/web/lib/actions.ts:396`.

## Python Interview Parallel

No Python code exists in this repo. The transferable idea is: TypeScript types are like Python type hints; both help tooling, but neither validates external input unless paired with runtime validation. Zod here plays a role similar to Pydantic in Python.

## Self-Grade

- Basic: can identify enum, schema, and type aliases.
- Solid: explains compile-time vs runtime validation.
- Strong: identifies contract drift between shared enums, Prisma enums, and stored JSON.
