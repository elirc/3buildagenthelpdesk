# Sprint One User Stories

## Epic: Faster Ticket Triage

Support agents need a practical queue, not just a list of records. The current ticket list is useful, but a real support team also needs ownership filters and SLA awareness.

### Story 1.1: Filter The Ticket Queue By Ownership

As a support agent, I want to filter tickets by ownership so I can quickly find work that is unassigned or assigned to me.

Acceptance criteria:

- The tickets page supports an `ownership` query param.
- `ownership=unassigned` shows tickets without `assignedUserId`.
- `ownership=mine` shows tickets assigned to the active user.
- `ownership=all` or no value keeps the current behavior.
- The selected filter remains visible after submitting the filter form.
- A viewer can use the filter but cannot mutate tickets.

Implementation notes:

- The active user comes from `getCurrentUser()`.
- Add the query handling in `apps/web/app/tickets/page.tsx`.
- Avoid introducing client state for this feature.

### Story 1.2: Filter The Ticket Queue By SLA State

As a support agent, I want to filter by SLA state so I can prioritize tickets that are breached or approaching breach.

Acceptance criteria:

- The tickets page supports an `sla` query param.
- Supported values are `healthy`, `approaching`, `breached`, and `resolved`.
- The app uses the existing `getSlaState` domain helper.
- Filtering is correct for unresolved and resolved tickets.
- The page still sorts high-priority and recently updated tickets first.

Implementation notes:

- Prisma cannot directly call `getSlaState` in SQL.
- For a first implementation, fetch a bounded ticket set and filter in TypeScript.
- Add a note in the PR about when this would need a database-backed SLA state.

### Story 1.3: Claim A Ticket

As a support agent, I want to claim an unassigned ticket so the team knows I am responsible for the next action.

Acceptance criteria:

- A writable user sees a `Claim Ticket` action on an unassigned ticket detail page.
- Clicking the action assigns the current user to the ticket.
- The action writes an audit event named `ticket.claimed`.
- The ticket detail and ticket list revalidate.
- A viewer cannot claim a ticket.

Implementation notes:

- Add a small server action in `apps/web/lib/actions.ts`.
- Reuse `requireCapability(user.role, "ticket:update")`.
- Keep the mutation narrow. It should not update title, description, priority, or status.

### Story 1.4: Require A Reason For Major Status Changes

As a manager, I want escalations, resolutions, and closures to include a reason so we can review decisions later.

Acceptance criteria:

- Moving a ticket to `ESCALATED`, `RESOLVED`, or `CLOSED` requires a non-empty reason.
- The reason is recorded in the audit event metadata.
- Normal edits that do not change status do not require a reason.
- Minor status changes, such as `NEW` to `TRIAGE`, do not require a reason.
- Validation is tested in the domain package.

Implementation notes:

- Add a helper such as `requiresTicketStatusReason(from, to)`.
- Add a helper such as `validateTicketStatusReason(from, to, reason)`.
- Keep UI copy short. The form can include a `Status Change Reason` field near the status selector.

### Story 1.5: Show A Unified Ticket Activity Timeline

As a support agent, I want comments and system activity in one timeline so I can understand what happened without jumping between cards.

Acceptance criteria:

- Ticket detail shows comments and audit events in one chronological section.
- Each timeline item identifies whether it is a comment or system event.
- Internal comments remain visibly different from customer-facing comments.
- The existing audit card can be removed or made secondary once the unified timeline exists.
- Empty states are clear.

Implementation notes:

- Build the timeline data in the page component first.
- If the transformation gets noisy, extract a formatter to `apps/web/lib/format.ts`.
- Do not create a new package for this sprint.

## Nonfunctional Requirements

- Existing ticket creation and editing behavior must continue to work.
- The page should remain server-rendered.
- Query params should be readable and shareable.
- Audit event metadata should not store full ticket descriptions.
- Tests should focus on business rules, not CSS.

## Out Of Scope

- Realtime updates.
- Email notifications.
- Bulk assignment.
- Saved personal views.
- Full text search infrastructure.

