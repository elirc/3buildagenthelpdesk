# Command Cheatsheet

| Command | Purpose | Source | Status |
| --- | --- | --- | --- |
| `npm install` | install dependencies | `README.md`, `package-lock.json` | previously run |
| `npm run dev` | start Next dev server | `package.json:11` | inferred from script |
| `npm run build` | production build | `package.json:12` | previously passed |
| `npm run start` | start built app | `package.json:13` | inferred from script |
| `npm run typecheck` | TypeScript check | `package.json:14` | previously passed |
| `npm run test` | Vitest suite | `package.json:15` | previously passed |
| `npm run test:watch` | Vitest watch | `package.json:16` | inferred from script |
| `npm run lint` | Next lint | `package.json:17` | previously passed |
| `npm run db:start` | start Docker Postgres | `package.json:18`, `docker-compose.yml:1-20` | previously failed when Docker daemon was stopped |
| `npm run db:stop` | stop Docker Compose | `package.json:19` | inferred |
| `npm run db:generate` | generate Prisma client | `package.json:20` | previously passed |
| `npm run db:migrate` | create/apply migration | `package.json:21` | inferred, requires DB |
| `npm run db:push` | push schema without migration | `package.json:22` | inferred, requires DB |
| `npm run db:seed` | reset and seed DB | `package.json:23`, `packages/db/src/seed.ts:55-598` | inferred, requires DB |
| `npm run db:studio` | open Prisma Studio | `package.json:24` | inferred, requires DB |
| `npx vitest run tests/agents.test.ts` | targeted agent tests | `tests/agents.test.ts:1-69` | inferred |
| `rg --files -g '!node_modules' -g '!.next'` | file inventory | local command | run during docs pass |

## Setup Sequence

```bash
npm install
cp .env.example .env
npm run db:start
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Pre-PR Sequence

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Database Warning

`npm run db:seed` calls a reset path that deletes domain rows at `packages/db/src/seed.ts:12-22`. Use only against local disposable data unless a production guard is added.
