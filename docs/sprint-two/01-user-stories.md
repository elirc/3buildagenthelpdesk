# Sprint Two User Stories

## Epic: Shared Incident Workspace

During an incident, responders need one place to record decisions, evidence, status changes, and next steps. The current incident pages show related objects, but they do not yet provide enough collaboration history.

### Story 2.1: Add Incident Timeline Updates

As an incident responder, I want to add timeline updates so everyone can see what happened and when.

Acceptance criteria:

- Incident detail includes a form to add an update.
- Each update stores author, message, created time, optional status, optional severity, and visibility.
- Updates are listed in chronological order.
- Internal visibility is clearly marked.
- Adding an update writes an audit event.

Implementation notes:

- Add an `IncidentUpdate` model.
- Keep messages plain text.
- Use existing active user handling.

### Story 2.2: Validate Incident Status Transitions

As an engineering manager, I want incident status transitions to follow an expected lifecycle so the timeline remains trustworthy.

Acceptance criteria:

- Valid lifecycle: `INVESTIGATING` to `IDENTIFIED`, `IDENTIFIED` to `MONITORING`, `MONITORING` to `RESOLVED`.
- Reopening from `RESOLVED` to `INVESTIGATING` is allowed.
- Same-status updates are allowed.
- Invalid jumps throw a clear domain error.
- Domain tests cover valid and invalid transitions.

Implementation notes:

- Add `allowedIncidentTransitions` and helpers in `packages/domain/src/incidents.ts`.
- Use the helper in `updateIncidentStatusAction`.

### Story 2.3: Assign An Incident Commander

As a manager, I want to assign an incident commander so ownership is clear during response.

Acceptance criteria:

- Incident detail allows writable users to set or change `ownerId`.
- The selected owner must be an existing user.
- The change writes an `incident.owner_changed` audit event.
- The incident header displays the current commander.

Implementation notes:

- The schema already has `ownerId`.
- Add a narrow server action instead of mixing ownership into every update.

### Story 2.4: Link Operational Evidence To An Incident

As an incident responder, I want to link related tickets, logs, and jobs so the incident page becomes the source of truth.

Acceptance criteria:

- Incident detail shows controls to link an existing ticket, log, or job by ID.
- Linking updates the related record's `incidentId` or `relatedIncidentId`.
- Unlinking is available where appropriate.
- Each link or unlink writes an audit event.
- The page revalidates after mutation.

Implementation notes:

- `Ticket` has `incidentId`.
- `StructuredLog` has `incidentId`.
- `BackgroundJob` has `relatedIncidentId`.
- Validate the target exists before updating.

### Story 2.5: Generate A Post-Incident Summary

As an incident commander, I want a deterministic draft summary so I can start a post-incident review faster.

Acceptance criteria:

- Incident detail has a `Generate Summary` action.
- The agent input includes incident fields, updates, tickets, logs, and jobs.
- The output includes impact, timeline highlights, likely contributing factors, follow-up tasks, and confidence.
- The agent run is persisted in `AgentRun`.
- The result is visible on the agent run detail page.

Implementation notes:

- Add a new agent type only if the shared enum and Prisma enum are updated together.
- Keep output deterministic and testable.

## Nonfunctional Requirements

- Incident timeline data should be ordered consistently.
- Linking evidence should not overwrite unrelated fields.
- Agent output should acknowledge limitations.
- Audit events should identify both the incident and linked object.
- Seed data should include at least one incident with multiple updates.

## Out Of Scope

- Realtime incident war room chat.
- External Slack or email integration.
- File attachments.
- Public customer status page.
- Automated incident creation from logs.

