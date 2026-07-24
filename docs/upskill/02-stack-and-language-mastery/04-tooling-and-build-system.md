# Tooling and Build System

## npm Workspaces

The root package declares workspaces at `package.json:6-9`. The web app depends on internal packages at `apps/web/package.json:12-19`.

Why it matters:

- Packages can be imported by name, such as `@agentdesk/domain`.
- Build tooling must transpile local packages.
- Versioning is private/local for now.

## Next Transpilation

`apps/web/next.config.mjs:3-10` lists internal packages for Next to transpile. If a new package is added and imported by the app, it likely needs to be added here.

Failure mode:

- The app compiles in TypeScript but fails in Next build because package transpilation is missing.

## TypeScript

Root `npm run typecheck` runs `tsc --noEmit -p tsconfig.json` from `package.json:14`. The web workspace has its own `apps/web/tsconfig.json`.

Drill:

- Break one import path in a scratch branch and predict whether `npm run test`, `npm run typecheck`, or `npm run build` catches it first.

## Prisma Codegen

Prisma client generation is `npm run db:generate` at `package.json:20`. It reads `packages/db/prisma/schema.prisma`.

Failure mode:

- Changing schema without regenerating the client can leave generated types stale.

## Docker

Local Postgres is defined in `docker-compose.yml:1-20`. The script is `npm run db:start` at `package.json:18`.

Failure mode:

- Docker CLI can exist while Docker daemon is stopped. This was observed in prior verification.

## Tests

Vitest is configured by `vitest.config.ts`. Current tests are unit tests that do not require a database.

Anchors:

- `tests/domain.test.ts:11-55`
- `tests/agents.test.ts:4-69`

## Build Checklist

Before a PR:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

If schema changed:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Self-Grade

- Basic: can run scripts.
- Solid: knows which scripts require database.
- Strong: can explain why build, typecheck, lint, and tests catch different classes of problems.
