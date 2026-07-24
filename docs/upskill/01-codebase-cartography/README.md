# Codebase Cartography

Cartography is the skill of forming a reliable map before changing code. In this repo, the important move is to distinguish product surfaces from ownership boundaries:

- UI pages: `apps/web/app/*`
- server actions: `apps/web/lib/actions.ts`
- domain rules: `packages/domain/src/*`
- persistence: `packages/db/prisma/schema.prisma`
- deterministic agents: `packages/agents/src/*`
- reusable UI: `packages/ui/src/*`
- tests: `tests/*.test.ts`

Use this module before making contributions. Do not start by changing the first file that looks relevant.

## Drills

1. Pick one page under `apps/web/app` and find the server action it uses.
2. Pick one server action and find the domain functions it calls.
3. Pick one model in Prisma and find every UI route that reads it.
4. Pick one enum in `packages/shared/src/index.ts:1-65` and verify the same concept exists in Prisma at `packages/db/prisma/schema.prisma:10-109`.

## Self-Grade

- Basic: can name the packages.
- Solid: can trace UI to server action to domain to Prisma.
- Strong: can identify where a rule should live and where it would be a boundary leak.
