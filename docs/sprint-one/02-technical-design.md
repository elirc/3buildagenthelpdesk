# Sprint One Technical Design

## Current Baseline

Tickets are stored in the `Ticket` model with status, priority, category, assignment, SLA due date, tags, comments, linked logs, linked jobs, and linked incidents. Mutations are implemented as server actions in `apps/web/lib/actions.ts`. Ticket status transitions and SLA calculations live in `packages/domain/src/tickets.ts`.

Sprint One should preserve this shape. The main change is to make the support workflow more expressive without adding heavy infrastructure.

## Data Model

No new model is required for the first version. Store status-change reasons inside `AuditEvent.metadata`.

Recommended audit metadata shape:

```ts
{
  reason?: string;
  source: "ticket-detail";
}
```

Why this is enough:

- Audit events already represent business history.
- The reason belongs to the transition event, not to the current ticket state.
- The app does not need to query reasons independently yet.

When to revisit:

- If reasons need reporting.
- If each transition needs its own author, timestamp, and review status outside audit.
- If compliance requires immutable typed records.

## Domain Changes

Add status-reason helpers to `packages/domain/src/tickets.ts`.

Suggested API:

```ts
export function requiresTicketStatusReason(from: TicketStatus, to: TicketStatus): boolean
export function validateTicketStatusReason(from: TicketStatus, to: TicketStatus, reason?: string): string | null
```

Behavior:

- Same-status updates return `false`.
- Transitions into `ESCALATED`, `RESOLVED`, or `CLOSED` return `true`.
- A valid reason should be trimmed and at least 6 characters.
- Invalid required reasons should produce a human-readable error.

Keep this in the domain package because it is a business rule. The UI can decide how to display the field, but it should not own the rule.

## Permission Model

Use existing ticket update capability for ownership actions.

Expected behavior:

- `ADMIN`, `SUPPORT_AGENT`, `ENGINEERING`, and `MANAGER` can claim or assign tickets.
- `VIEWER` cannot mutate.
- Claiming a ticket should use the active user's ID.
- Assigning another user should still be considered a ticket update.

Do not add a new permission unless the product asks for a role that can update ownership but not other ticket fields.

## Server Actions

Add narrow actions instead of overloading `updateTicketAction` for every interaction.

Suggested actions:

- `claimTicketAction(formData)`
- `unassignTicketAction(formData)`

Keep `updateTicketAction` responsible for full ticket edits.

Action checklist:

- Load the active user.
- Enforce capability.
- Load the current ticket if the audit event needs before state.
- Update only the fields required by the action.
- Write a specific audit event.
- Revalidate affected pages.

## Ticket List Query Design

The ticket list already filters by status, priority, and search text. Add these query params:

- `ownership`
- `sla`
- `category`
- `incident`

Implementation options:

- Prisma filters for direct fields such as `category`, `incidentId`, and `assignedUserId`.
- TypeScript post-filtering for computed SLA state.

For this learning sprint, TypeScript SLA filtering is acceptable because it teaches the difference between stored fields and computed domain state. Add a comment in the PR if the query becomes inefficient.

## UI Design

Ticket list:

- Add ownership, category, and SLA controls to the existing filter bar.
- Keep labels short.
- Preserve existing table columns.

Ticket detail:

- Add claim or unassign actions near the page header or ownership details.
- Add `Status Change Reason` near the status selector.
- Combine comments and audit events into a timeline card.

Avoid creating a dashboard or a new route in this sprint. The point is to improve the current workflow.

## Audit Design

Use specific action names:

- `ticket.claimed`
- `ticket.unassigned`
- `ticket.status_changed`
- `ticket.updated`

For status changes, include:

```ts
before: { status: before.status }
after: { status: after.status }
metadata: { reason }
```

For ownership changes, include:

```ts
before: { assignedUserId: before.assignedUserId }
after: { assignedUserId: after.assignedUserId }
```

## Testing Strategy

Add domain tests for:

- Status reason required for `TRIAGE` to `ESCALATED`.
- Status reason required for `IN_PROGRESS` to `RESOLVED`.
- Status reason not required for `NEW` to `TRIAGE`.
- Same-status update does not require a reason.

Optional action-level testing can be added later if the project introduces a server-action testing harness. For this sprint, domain tests plus manual QA are enough.

## Risk Notes

- Filtering by computed SLA state can become inefficient with large data.
- Audit metadata is flexible JSON, so tests should protect the expected shape.
- Adding too many filter controls can make the ticket page visually crowded.
- Required status reason must not block unrelated edits.

