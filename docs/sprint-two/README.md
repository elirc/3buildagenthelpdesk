# Sprint Two: Incident Response Collaboration

Sprint Two expands from individual ticket handling into coordinated incident response. The app already has incidents, linked tickets, linked logs, linked jobs, and an anomaly agent. This sprint makes incidents feel like a shared workspace where responders can track updates, link evidence, and prepare follow-up work.

## Sprint Goal

Incident responders can maintain a reliable incident timeline, connect related operational evidence, and generate a first-pass post-incident summary.

## Feature Set

- Incident timeline updates with author, status, severity, message, and visibility.
- Link and unlink tickets, logs, and jobs from the incident detail page.
- Incident status and severity transition validation.
- Incident commander ownership action.
- Deterministic post-incident summary agent.
- Tests for incident transition rules and post-incident summary heuristics.

## Why This Sprint Comes Second

Sprint One teaches a vertical workflow on an existing model. Sprint Two adds new persistence and stronger cross-entity coordination. It is the right next step because incident work touches multiple areas of the app:

- `Incident`
- `Ticket`
- `StructuredLog`
- `BackgroundJob`
- `AgentRun`
- `AuditEvent`

The junior engineer now practices designing a small data model instead of only extending forms.

## Learning Outcomes

By the end of Sprint Two, the learner should be able to:

- Add a Prisma model and seed data safely.
- Explain one-to-many and optional relation choices.
- Write transition rules for a second domain object.
- Design a timeline that combines human updates and system state.
- Extend the deterministic agent system without calling an external API.
- Keep cross-entity mutations auditable.

## Primary Files

- `packages/db/prisma/schema.prisma`
- `packages/db/src/seed.ts`
- `packages/domain/src/incidents.ts`
- `packages/agents/src/registry.ts`
- `packages/agents/src/types.ts`
- `apps/web/app/incidents/page.tsx`
- `apps/web/app/incidents/[id]/page.tsx`
- `apps/web/lib/actions.ts`
- `tests/domain.test.ts`
- `tests/agents.test.ts`

## Sprint Definition Of Done

- Incident updates can be added and viewed chronologically.
- Incident status and severity changes are validated.
- Tickets, logs, and jobs can be linked or unlinked from incident detail where the schema allows it.
- Incident commander can be assigned.
- Post-incident summary agent produces deterministic output from incident context.
- Audit events capture meaningful incident changes.
- `npm run db:generate`, `npm run test`, and `npm run typecheck` pass.

