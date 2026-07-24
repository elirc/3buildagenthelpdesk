# Sprint Three Technical Design

## Automation Philosophy

This sprint should keep a clear line between detection, recommendation, and action.

- Detection finds a condition.
- Recommendation explains a possible next step.
- Action mutates business state.

The app can automate detection confidently. It should require review for actions that could create customer-visible or operational risk.

## Data Model

Add an `AgentRecommendation` model.

Suggested Prisma model:

```prisma
enum AgentRecommendationStatus {
  PENDING
  APPROVED
  REJECTED
  APPLIED
}

model AgentRecommendation {
  id              String                    @id @default(cuid())
  agentRunId      String
  agentRun        AgentRun                  @relation(fields: [agentRunId], references: [id], onDelete: Cascade)
  targetType      AgentTargetType
  targetId        String
  title           String
  rationale       String
  proposedAction  String
  status          AgentRecommendationStatus @default(PENDING)
  reviewedById    String?
  reviewedBy      User?                     @relation(fields: [reviewedById], references: [id])
  reviewNote      String?
  reviewedAt      DateTime?
  appliedAt       DateTime?
  createdAt       DateTime                  @default(now())

  @@index([status, targetType])
  @@index([agentRunId])
}
```

Also add relation fields to `AgentRun` and `User`.

## Domain Changes

Add recommendation transition helpers.

Suggested file:

- `packages/domain/src/agent-recommendations.ts`

Suggested API:

```ts
export function canTransitionRecommendation(
  from: AgentRecommendationStatus,
  to: AgentRecommendationStatus
): boolean
```

Allowed transitions:

- `PENDING` to `APPROVED`
- `PENDING` to `REJECTED`
- `APPROVED` to `APPLIED`
- Same-state transitions allowed for idempotent form resubmission.

Disallowed:

- `REJECTED` to `APPLIED`
- `APPLIED` to `PENDING`
- `APPROVED` to `REJECTED` without a reopening story.

## SLA Escalation Design

Create a service-style helper rather than embedding all logic in a page.

Suggested file:

- `apps/web/lib/slaEscalation.ts`

Suggested function:

```ts
export async function runSlaEscalation(params: {
  actorUserId: string;
  now?: Date;
}): Promise<SlaEscalationResult>
```

The helper should:

- Query unresolved tickets.
- Calculate SLA state.
- Attempt valid escalation transitions.
- Skip invalid transitions.
- Write audit events.
- Return a structured result.

The server action should handle permissions and call the helper.

## Analytics Design

Create `apps/web/lib/analytics.ts`.

Suggested functions:

- `getTicketAnalytics()`
- `getIncidentAnalytics()`
- `getJobAnalytics()`
- `getAgentAnalytics()`
- `getOperationsDashboardAnalytics()`

Keep page JSX focused on rendering. Analytics helpers should shape data into simple arrays or objects that UI components can display.

## CSV Export Design

Use a route handler for downloadable reports.

Suggested route:

- `apps/web/app/reports/tickets.csv/route.ts`

Report columns:

- `ticket_id`
- `title`
- `customer_name`
- `requester_email`
- `status`
- `priority`
- `category`
- `sla_state`
- `sla_due_at`
- `assigned_team`
- `assigned_user`
- `incident_title`
- `created_at`
- `updated_at`

Excluded fields:

- `description`
- comments
- raw log metadata
- agent input snapshots
- agent traces

## Governance UI

Create a simple configuration array.

Suggested file:

- `apps/web/lib/automationCatalog.ts`

Each item:

```ts
{
  name: string;
  trigger: string;
  action: string;
  requiredCapability: string;
  auditEvents: string[];
  rollback: string;
}
```

Render this on `/settings` or a new `/automation` page.

## Audit Design

Recommended action names:

- `automation.sla_escalation_started`
- `automation.sla_escalation_completed`
- `ticket.auto_escalated`
- `ticket.escalation_skipped`
- `agent.recommendation_created`
- `agent.recommendation_approved`
- `agent.recommendation_rejected`
- `agent.recommendation_applied`
- `report.exported`

Every automation run should have a summary event even if no records changed.

## Testing Strategy

Domain tests:

- Recommendation state transitions.
- Invalid recommendation transitions.
- SLA escalation selection helper if logic is extracted.

Integration-style tests where practical:

- SLA escalation result counts with mocked or seeded input.
- CSV escaping helper.

Manual tests:

- Run escalation twice and confirm the second run does not create misleading changes.
- Approve and reject recommendations.
- Export CSV and inspect columns.
- Check analytics counts against database records.

## Risk Notes

- Automated escalation can create noisy audit history if repeated too often.
- CSV export can leak sensitive data if fields are selected casually.
- Analytics can become slow if implemented by loading full tables.
- Recommendation application must remain narrow until each action is well-defined.

