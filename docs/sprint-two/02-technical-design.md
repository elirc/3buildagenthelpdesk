# Sprint Two Technical Design

## Data Model

Add an `IncidentUpdate` model.

Suggested Prisma model:

```prisma
model IncidentUpdate {
  id         String           @id @default(cuid())
  incidentId String
  incident   Incident         @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  authorId   String?
  author     User?            @relation(fields: [authorId], references: [id])
  message    String
  status     IncidentStatus?
  severity   IncidentSeverity?
  isInternal Boolean          @default(true)
  createdAt  DateTime         @default(now())

  @@index([incidentId, createdAt])
}
```

Also add relation fields:

- `Incident.updates IncidentUpdate[]`
- `User.incidentUpdates IncidentUpdate[]`

Why a model instead of audit metadata:

- Incident updates are first-class collaboration content.
- They need listing, ordering, authorship, and visibility.
- They are not only a record of mutations.

## Domain Changes

Extend `packages/domain/src/incidents.ts`.

Suggested exports:

```ts
export const allowedIncidentTransitions: Record<IncidentStatus, IncidentStatus[]>
export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean
export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): void
export function isSeverityIncrease(from: IncidentSeverity, to: IncidentSeverity): boolean
```

The status transition helper belongs in domain code because it is business policy.

Severity increase can support UI labels and audit metadata. Do not block severity decreases unless product asks for approvals.

## Server Actions

Add narrow actions:

- `addIncidentUpdateAction`
- `assignIncidentOwnerAction`
- `linkIncidentTicketAction`
- `unlinkIncidentTicketAction`
- `linkIncidentLogAction`
- `unlinkIncidentLogAction`
- `linkIncidentJobAction`
- `unlinkIncidentJobAction`
- `runIncidentSummaryAgentAction`

This looks like many actions, but each one should be small. That is easier for a junior engineer to test and review than one action with a large `switch`.

## Agent Design

The current agents use deterministic heuristics. Follow that pattern.

Suggested new agent:

- File: `packages/agents/src/incident-summary.ts`
- Registry key: `INCIDENT_SUMMARY`
- Target type: `INCIDENT`

Suggested output:

```ts
{
  executiveSummary: string;
  customerImpact: string;
  timelineHighlights: string[];
  likelyContributingFactors: string[];
  followUpTasks: string[];
  confidenceScore: number;
}
```

Heuristic inputs:

- Severity and status.
- Affected service.
- Number of linked tickets.
- Fatal or error logs.
- Failed or dead-lettered jobs.
- Incident updates containing phrases such as `mitigated`, `rollback`, `deploy`, `root cause`, or `customer impact`.

## UI Design

Incident detail should become the incident workspace.

Recommended sections:

- Header with status, severity, affected service, and commander.
- Timeline updates.
- Linked tickets.
- Linked logs.
- Linked jobs.
- Agent summary.
- Audit history.

Keep the page server-rendered. Use simple forms and existing UI components.

## Audit Design

Recommended action names:

- `incident.update_added`
- `incident.status_changed`
- `incident.severity_changed`
- `incident.owner_changed`
- `incident.ticket_linked`
- `incident.ticket_unlinked`
- `incident.log_linked`
- `incident.log_unlinked`
- `incident.job_linked`
- `incident.job_unlinked`
- `agent.run_started`
- `agent.run_completed`

Include both IDs when linking:

```ts
metadata: {
  incidentId,
  linkedEntityType: "Ticket",
  linkedEntityId: ticketId
}
```

## Seed Data

Update `packages/db/src/seed.ts` with:

- At least one active incident with two timeline updates.
- At least one resolved incident with a summary-worthy timeline.
- Linked tickets, logs, and jobs that demonstrate the workspace.

Seed data should support manual demos without hand-editing records.

## Migration And Local Database Workflow

Development sequence:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

If using migrations locally:

```bash
npm run db:migrate
```

For a training repo, document whether the sprint is using `db:push` or migrations before implementation begins.

## Testing Strategy

Domain tests:

- Valid incident transitions.
- Invalid status jumps.
- Reopening a resolved incident.
- Severity increase detection.

Agent tests:

- Summary mentions customer impact when many linked tickets exist.
- Summary mentions failed jobs when failed jobs are present.
- Summary confidence increases when updates, logs, tickets, and jobs are all present.

Manual tests:

- Add update.
- Change owner.
- Link and unlink each entity type.
- Generate summary.

## Risk Notes

- Incident detail can become too crowded.
- Link-by-ID is simple but not very user-friendly.
- Prisma enum changes must stay aligned with shared constants.
- Agent output should not pretend to know a root cause when evidence is weak.

