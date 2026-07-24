# Architecture Overview

## What This App Does

Agentic Help Desk is an internal enterprise platform for support, engineering, and operations teams. It manages customer tickets, incidents, structured logs, failed background jobs, audit events, and deterministic mock agent investigations.

The product goal is realistic engineering practice: reading a larger codebase, tracing data flow, debugging production-like failures, and extending agentic workflows without relying on external LLM APIs.

## Major Modules

- `apps/web`: Next.js App Router UI, pages, server actions, and request orchestration.
- `packages/db`: Prisma schema, Prisma client, and seed data.
- `packages/domain`: business rules, validation schemas, status transitions, SLA calculations, and permissions.
- `packages/agents`: mock agent interface, registry, deterministic agents, outputs, confidence, and trace format.
- `packages/observability`: structured log helpers, audit event input shape, anomaly scoring, and metadata redaction.
- `packages/ui`: reusable cards, tables, forms, badges, metrics, layout classes, and CSS variables.
- `packages/shared`: shared enums, label maps, constants, and small utilities.

## Why Modular Monolith

The app is intentionally not microservices. The modules are separated by responsibility while still deploying and running as one application. This mirrors many real internal platforms where clear boundaries matter, but distributed systems overhead would be premature.

Benefits:

- Easy local development.
- One database transaction boundary.
- Explicit business logic packages.
- Future extraction is possible if a module grows.
- Junior engineers can trace one process end to end.

## Data Flow

Typical mutation flow:

1. A user submits a form in `apps/web/app/...`.
2. A server action in `apps/web/lib/actions.ts` reads the active user.
3. Domain validation or permission checks run from `packages/domain`.
4. Prisma persists the change through `packages/db`.
5. `writeAuditEvent` records important before/after state.
6. `revalidatePath` refreshes affected pages.

## Request Flow

Read pages are server components. They query Prisma directly, compose data with domain helpers, and render reusable UI components. Mutations happen through server actions rather than client-side API calls.

## Business Logic

Business rules live in `packages/domain`, not React components. Examples:

- Ticket status transitions
- SLA due-date calculations
- SLA state
- Role capabilities
- Job retry eligibility
- Log fingerprint creation

## UI Logic

Reusable UI primitives live in `packages/ui`. Page-specific composition lives in `apps/web/app`. Styling is plain CSS with variables and reusable classes; Tailwind is intentionally not used.

## Agent Logic

Agent logic lives in `packages/agents`. Agents are pure deterministic functions. They accept input snapshots and return summaries, findings, recommendations, limitations, confidence, output JSON, and trace steps. Persistence happens in `apps/web/lib/actions.ts`, which keeps agents replaceable.
