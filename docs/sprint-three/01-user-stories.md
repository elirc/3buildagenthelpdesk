# Sprint Three User Stories

## Epic: Proactive Operations

Managers want fewer surprises. Support and engineering teams want automation to handle repetitive detection work, but not to silently make risky decisions.

### Story 3.1: Run SLA Escalation Automation

As a manager, I want to run SLA escalation automation so breached and high-risk tickets are surfaced quickly.

Acceptance criteria:

- A writable manager or admin can run an SLA escalation check.
- The check finds unresolved tickets that are breached or approaching breach.
- Breached critical or high-priority tickets are marked `ESCALATED` when transition rules allow it.
- Tickets that cannot transition are skipped with a reason.
- Every decision writes an audit event.
- The run summary shows checked, escalated, skipped, and failed counts.

Implementation notes:

- Start with a manual server action, not a scheduler.
- Use existing `getSlaState` and `assertTicketTransition`.
- Do not escalate closed or resolved tickets.

### Story 3.2: Review Agent Recommendations

As an engineering manager, I want agent recommendations to enter a review queue so humans approve meaningful operational changes.

Acceptance criteria:

- Agent runs can create recommendation records.
- Recommendations have `PENDING`, `APPROVED`, `REJECTED`, and `APPLIED` states.
- A reviewer can approve or reject a recommendation with a note.
- Applying a recommendation writes a business audit event.
- The original agent run remains linked for traceability.

Implementation notes:

- Add an `AgentRecommendation` model.
- Keep recommendation application narrow in the first version.
- Start with recommendations from ticket and incident agents.

### Story 3.3: Add Operations Analytics Dashboard

As a manager, I want an analytics dashboard so I can understand workload, risk, and automation impact.

Acceptance criteria:

- Dashboard shows ticket count by status and priority.
- Dashboard shows SLA breached and approaching counts.
- Dashboard shows incidents by severity and status.
- Dashboard shows failed jobs by type.
- Dashboard shows agent run success rate and average confidence.
- Queries are grouped in a helper instead of being scattered through JSX.

Implementation notes:

- Create `apps/web/lib/analytics.ts`.
- Use Prisma aggregation where practical.
- Keep date ranges simple for the first version.

### Story 3.4: Export Operational Report CSV

As a manager, I want to export a CSV report so I can share operational status outside the app.

Acceptance criteria:

- A report route or server action returns CSV.
- Export includes ticket summary fields, SLA state, owner, team, and linked incident.
- Export excludes raw descriptions, comments, log metadata, and agent trace.
- The export writes an audit event.
- Tests or review notes document sensitive fields intentionally excluded.

Implementation notes:

- Consider a route handler under `apps/web/app/reports`.
- Keep CSV formatting small and explicit.
- Do not add a CSV dependency unless escaping becomes complex.

### Story 3.5: Add Automation Governance Checklist

As an admin, I want automation behavior to be visible so the team trusts the system.

Acceptance criteria:

- Settings or admin page lists enabled automations.
- Each automation explains trigger, action, permission, audit event, and rollback.
- SLA escalation automation appears in the list.
- Agent recommendation review appears in the list.
- The page is informational in the first version.

Implementation notes:

- This can be static configuration rendered from a TypeScript array.
- Keep it close to the automation code if possible.

## Nonfunctional Requirements

- Automation should be idempotent enough for repeated manual runs.
- Analytics queries should not load entire tables when counts are enough.
- CSV export should avoid sensitive text fields.
- Recommendation state changes should be auditable.
- The app should preserve human review for uncertain actions.

## Out Of Scope

- Cron scheduling.
- External notifications.
- Webhooks to third-party systems.
- Role management UI.
- ML-based forecasting.

