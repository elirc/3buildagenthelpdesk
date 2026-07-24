# Agentic Help Desk + Incident Intelligence Platform

This repository is a TypeScript modular monolith that emulates a mid-size internal enterprise platform. It combines help desk ticket management, incident monitoring, structured logs, background job monitoring, audit events, and deterministic mock agents.

The project is intentionally production-shaped without depending on real LLM APIs, LangChain, external API keys, or Tailwind CSS.

## Stack

- Next.js App Router + React
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod validation
- Vitest
- CSS variables and a small internal UI package
- Local deterministic mock agents

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an environment file:

```bash
cp .env.example .env
```

3. Start PostgreSQL and create a database named `agentdesk`, or edit `DATABASE_URL` in `.env`.

With Docker:

```bash
npm run db:start
```

4. Generate Prisma client and push the schema:

```bash
npm run db:generate
npm run db:push
```

5. Seed the coherent demo dataset:

```bash
npm run db:seed
```

6. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run typecheck    # TypeScript check
npm run test         # core logic and agent tests
npm run lint         # Next.js lint
npm run worker       # process queued background jobs continuously
npm run worker:once  # process one queued background job
npm run db:start     # start local PostgreSQL with Docker
npm run db:stop      # stop local PostgreSQL
npm run db:push      # apply schema without migration files
npm run db:migrate   # create a local migration
npm run db:seed      # reset and seed demo data
npm run db:studio    # inspect data with Prisma Studio
```

## Demo Users

Use the switcher in the top bar or `/settings`.

- `admin@agentdesk.local` - Admin
- `maya.support@agentdesk.local` - Support Agent
- `ethan.eng@agentdesk.local` - Engineering
- `nina.manager@agentdesk.local` - Manager
- `victor.viewer@agentdesk.local` - Viewer

## Key Pages

- `/` - Operations dashboard
- `/tickets` - Ticket list and filters
- `/tickets/new` - Create ticket
- `/tickets/[id]` - Ticket detail, comments, audit, linked logs/jobs, ticket agent
- `/incidents` - Incident monitoring
- `/incidents/[id]` - Incident detail and anomaly agent
- `/logs` - Log explorer and fingerprint grouping
- `/logs/[id]` - Structured log detail
- `/jobs` - Background job monitor
- `/jobs/[id]` - Failed job detail, retry/dead-letter, investigation agent
- `/agents` - Agent run history
- `/agents/[id]` - Agent input, output, trace, confidence, recommendations
- `/audit` - Audit event explorer
- `/settings` - Local active-user switcher

## Architecture Summary

The repository is split by logical module:

- `apps/web` contains App Router pages, server actions, and app composition.
- `packages/db` owns Prisma schema, database client, and seed data.
- `packages/domain` owns business rules, validation, transitions, SLA logic, and permissions.
- `packages/agents` owns deterministic mock agent interfaces, registry, and implementations.
- `packages/observability` owns structured logging and anomaly scoring helpers.
- `packages/ui` owns the small reusable internal UI system and design tokens.
- `packages/shared` owns cross-package enums, labels, constants, and utilities.
- `docs` explains how to read, debug, extend, and learn from the codebase.

## Tests

Core tests live in `tests/` and cover:

- Ticket status transitions
- SLA calculations and SLA state
- Ticket validation and tag normalization
- Ticket summarization heuristics
- Log anomaly scoring
- Failed job investigation heuristics

## Known Limitations

- Authentication is intentionally simulated with a local active user cookie.
- The app expects PostgreSQL; no SQLite fallback is included.
- Agents are deterministic heuristic systems, not LLM calls.
- Server actions provide the main mutation path; there is no separate public REST API.
- Realtime log streaming is not implemented yet.

## Recommended Learning Path

Start with `docs/02-codebase-reading-guide.md`, then trace a ticket from `/tickets/new` through `apps/web/lib/actions.ts`, `packages/domain`, and `packages/db/prisma/schema.prisma`. After that, inspect `packages/agents` and run the tests while changing a heuristic.

For sprint-style feature practice, follow `docs/sprint-roadmap.md`. It breaks the next set of product improvements into five training sprints with user stories, technical designs, implementation playbooks, and review guides.
