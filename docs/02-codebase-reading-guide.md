# Codebase Reading Guide

## Recommended Reading Order

1. `README.md`
2. `packages/db/prisma/schema.prisma`
3. `packages/shared/src/index.ts`
4. `packages/domain/src/tickets.ts`
5. `apps/web/lib/actions.ts`
6. `packages/agents/src/types.ts`
7. `packages/agents/src/registry.ts`
8. `apps/web/app/tickets/[id]/page.tsx`
9. `packages/db/src/seed.ts`
10. `tests/`

## Most Important Files

- `packages/db/prisma/schema.prisma`: data model and relationships.
- `packages/domain/src/tickets.ts`: status transitions and SLA rules.
- `packages/domain/src/permissions.ts`: role capabilities.
- `apps/web/lib/actions.ts`: mutation workflow, audit events, and agent persistence.
- `packages/agents/src/*`: deterministic agent architecture.
- `apps/web/app/page.tsx`: dashboard aggregation.

## Trace a Ticket From UI to Database

Start at `/tickets/new`.

1. `apps/web/app/tickets/new/page.tsx` renders the form.
2. The form posts to `createTicketAction`.
3. `createTicketAction` checks the active user capability.
4. `createTicketSchema` validates the form.
5. `calculateSlaDueAt` sets the SLA.
6. Prisma creates the ticket.
7. `writeAuditEvent` records `ticket.created`.
8. The user is redirected to `/tickets/[id]`.

For updates, read `updateTicketAction`. Notice how it calls `assertTicketTransition` before changing status.

## Trace an Agent Run

Use a ticket detail page and click `Run Ticket Agent`.

1. `runTicketAgentAction` loads ticket, comments, linked logs, and incident.
2. It creates an `AgentRun` with status `RUNNING`.
3. It calls `runRegisteredAgent`.
4. The registry selects the deterministic agent implementation.
5. The output, confidence, and trace are persisted.
6. Audit events record start and completion.
7. The browser redirects to `/agents/[id]`.

## Trace a Failed Job Investigation

1. Open `/jobs?status=FAILED`.
2. Select a failed job.
3. Read payload, error, attempts, and linked incident/ticket.
4. Click `Run Job Agent`.
5. Compare the output to `packages/agents/src/failed-job-investigation.ts`.

## Trace Logs to Incidents

1. Open `/logs`.
2. Filter to `auth-service` and `production`.
3. Inspect grouped fingerprints.
4. Open a log detail page.
5. Follow the linked incident.
6. On the incident page, run the anomaly agent for incident-linked logs.

## What to Study First

Study tickets first. They cover CRUD, validation, status transitions, comments, audit events, linked incidents, linked logs, and agent summaries.

## What to Study Second

Study logs and jobs. They show operational debugging data and how agents use context beyond normal CRUD state.

## What to Study Third

Study agents. Add a new deterministic rule, update tests, and inspect the persisted trace on `/agents/[id]`.
