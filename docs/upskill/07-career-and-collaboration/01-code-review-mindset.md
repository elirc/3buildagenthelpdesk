# Code Review Mindset

Review layers:

1. Does it work?
2. Is it correct?
3. Will it stay correct?
4. Does it fit this codebase?
5. Is it kind to future maintainers?

## Repo-Specific Checklist

- Does mutation code check capability? See `apps/web/lib/actions.ts:42-44`, `apps/web/lib/actions.ts:419-421`.
- Does business logic live in domain? See `packages/domain/src/tickets.ts:34-89`.
- Does UI avoid owning invariants? See `apps/web/app/tickets/[id]/page.tsx:48-50` as UI helper, not enforcement.
- Does persistence match Prisma schema? See `packages/db/prisma/schema.prisma:111-281`.
- Does the change write audit events for major actions? See `apps/web/lib/actions.ts:129-157`.
- Are agents pure and deterministic? See `packages/agents/src/types.ts:33-39`.
- Are tests added at the right layer? See `tests/domain.test.ts:11-55`.

## Good Review Comments

> I think this transition check belongs in `packages/domain`, then the server action can call it. That keeps the UI from becoming the source of truth.

> This writes the ticket and audit event separately. For this PR that matches existing patterns, but if audit consistency is now required, let's discuss a transaction.

> Could we add a fixture for this agent branch? It changes confidence scoring, and `tests/agents.test.ts` is where current heuristic regressions live.

## Drill

Review a fake PR that adds a new ticket status. Write one blocking comment, one important comment, and one optional comment.
