# Sprint Three Implementation Playbook

## Before Coding

Run:

```bash
npm run test
npm run typecheck
```

Read:

- `packages/domain/src/tickets.ts`
- `packages/domain/src/jobs.ts`
- `packages/agents/src/ticket-summarization.ts`
- `apps/web/lib/actions.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/agents/page.tsx`
- `apps/web/app/audit/page.tsx`

Write down:

- Which operations are safe to automate immediately.
- Which operations should require human approval.
- Which fields are sensitive and should not be exported.

## Slice 1: Recommendation State Domain

1. Add Prisma enum and model for agent recommendations.
2. Add relation fields to `AgentRun` and `User`.
3. Create domain helper for allowed recommendation transitions.
4. Export it from the domain package.
5. Add domain tests.

Checkpoint:

```bash
npm run db:generate
npm run test
```

## Slice 2: Recommendation Review UI

1. Add recommendations to the agent run detail page or agent list page.
2. Add approve and reject server actions.
3. Require a review note for rejection.
4. Write audit events.
5. Add filters for pending and reviewed recommendations.

Review questions:

- Can a reviewer see why the agent suggested the action?
- Can they trace back to the original agent run?
- Does rejection preserve history?

## Slice 3: SLA Escalation Helper

1. Create `apps/web/lib/slaEscalation.ts`.
2. Query unresolved tickets.
3. Use `getSlaState`.
4. Escalate only eligible tickets.
5. Skip ineligible tickets with a reason.
6. Return structured counts and per-ticket outcomes.

Suggested result shape:

```ts
type SlaEscalationResult = {
  checked: number;
  escalated: number;
  skipped: number;
  failed: number;
  outcomes: Array<{
    ticketId: string;
    status: "escalated" | "skipped" | "failed";
    reason: string;
  }>;
};
```

## Slice 4: Manual Automation Action

1. Add `runSlaEscalationAction` in `apps/web/lib/actions.ts`.
2. Restrict to admin or manager capability.
3. Call the helper.
4. Write start and completed audit events.
5. Render the result on a page, or redirect to audit with a clear event trail.

Manual QA:

- Run once with seeded breached tickets.
- Run again and confirm results are stable.
- Confirm resolved and closed tickets are skipped.

## Slice 5: Analytics Dashboard

1. Create `apps/web/lib/analytics.ts`.
2. Add grouped ticket counts.
3. Add SLA counts.
4. Add incident counts.
5. Add job failure counts.
6. Add agent run success and confidence metrics.
7. Render on the home dashboard or a new analytics page.

Implementation tip:

- Start with simple cards and tables.
- Avoid chart libraries unless the product explicitly needs charts.

## Slice 6: CSV Export

1. Add a route handler under `apps/web/app/reports`.
2. Query ticket report fields.
3. Compute SLA state.
4. Escape CSV cells.
5. Return `text/csv`.
6. Write `report.exported`.

Review prompt:

- Ask a teammate to identify any field that should not leave the app.

## Slice 7: Automation Governance Page

1. Create `apps/web/lib/automationCatalog.ts`.
2. Add entries for SLA escalation and recommendation review.
3. Render the catalog on `/settings` or `/automation`.
4. Link relevant audit actions.

The purpose is trust. Users should understand what automation can and cannot do.

## Final Verification

Run:

```bash
npm run db:generate
npm run test
npm run typecheck
npm run build
```

Manual QA:

- Review pending recommendations.
- Approve one recommendation.
- Reject one recommendation with a note.
- Run SLA escalation automation.
- Confirm audit summary events.
- Open analytics dashboard.
- Export CSV and inspect headers and sensitive fields.

## PR Description Template

```md
## Summary
- Added agent recommendation review workflow.
- Added manual SLA escalation automation.
- Added operations analytics dashboard.
- Added ticket CSV export.
- Added automation governance catalog.

## Tests
- npm run db:generate
- npm run test
- npm run typecheck
- npm run build

## Risk
- Automation is manual in this sprint. Scheduling should wait until run results are reviewed in real usage.
```

