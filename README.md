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
- `/analytics` - Team and assignee analytics (Story F1)
- `/knowledge` - Knowledge base with article suggestions (Story E3)
- `/notifications` - Watcher notification inbox (Story A5)
- `/settings` - Local active-user switcher
- `/api/v1/tickets`, `/api/v1/incidents` - read-only REST API behind scoped API keys (Story F2)

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

288 tests across 22 files in `tests/` (grown from 12 while shipping the
20-story backlog — every PR passed CI). Coverage spans the original domain
suites (ticket transitions, SLA, validation, summarization, anomaly scoring,
job investigation) plus one suite per shipped story: saved views, bulk
triage, canned replies, ticket links/merge, duplicate detection, SLA pause,
business hours, first response, routing, job backoff/leases, dead letter,
agent diff, analytics, API keys, log alerts, knowledge, notifications.

## Known Limitations

- Authentication is intentionally simulated with a local active user cookie.
- The app expects PostgreSQL; no SQLite fallback is included.
- Agents are deterministic heuristic systems, not LLM calls.
- Server actions are the mutation path; the REST API under `/api/v1` (Story F2) is read-only.
- Realtime log streaming is not implemented yet.

## Recommended Learning Path

Read `fabledocs/01-how-this-app-works.md` first — it is the most recent
full pass over the code, and where it disagrees with `docs/`, it wins.
Then trace a ticket from `/tickets/new` through `apps/web/lib/actions.ts`,
`packages/domain`, and `packages/db/prisma/schema.prisma`; inspect
`packages/agents` and run the tests while changing a heuristic.

The best study material in this repo is the PR history: the 20 backlog
stories (`fabledocs/02-feature-backlog-user-stories.md`) were merged as
PRs #3–#22, each with acceptance criteria, verification notes, and a risks
section. Read a story, design it yourself, then read its PR.

For fresh feature practice, `docs/sprint-roadmap.md` holds five unbuilt
training sprints — but read its status note first, because several sprint
stories overlap with work the backlog has since shipped.
