# Sprint Three: Automation, Insights, and Governance

Sprint Three turns the platform from a record-keeping app into a more proactive operations system. The first two sprints improved human workflows. This sprint adds automation and analytics, but keeps human review where automated decisions could be risky.

## Sprint Goal

Managers and operators can see operational trends, run SLA escalation automation, and review agent recommendations before they become business actions.

## Feature Set

- SLA escalation runner that identifies breached or approaching tickets.
- Agent recommendation review queue with approve, reject, and apply states.
- Operations analytics dashboard for tickets, incidents, jobs, and agents.
- CSV export for manager-facing operational reports.
- Governance checklist for automation safety and auditability.

## Why This Sprint Comes Third

Automation is safest after the workflow is understood. Sprint One clarified ticket ownership and reasons. Sprint Two clarified incident collaboration and evidence. Sprint Three uses those signals to automate repetitive work while preserving review and audit.

## Learning Outcomes

By the end of Sprint Three, the learner should be able to:

- Design automation that is observable and reversible.
- Separate recommendations from actions.
- Write analytics queries without mixing them into page components.
- Understand when background jobs are enough and when a real queue is needed.
- Add export functionality without leaking sensitive metadata.
- Explain automation risks in a PR.

## Primary Files

- `packages/db/prisma/schema.prisma`
- `packages/domain/src/jobs.ts`
- `packages/domain/src/tickets.ts`
- `packages/agents/src/*`
- `packages/observability/src/index.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/agents/page.tsx`
- `apps/web/app/audit/page.tsx`
- `apps/web/lib/actions.ts`
- `tests/domain.test.ts`
- `tests/agents.test.ts`

## Sprint Definition Of Done

- SLA escalation automation can be run manually in the app.
- Escalation decisions are logged and auditable.
- Agent recommendations can be reviewed before application.
- Analytics dashboard answers manager-level questions.
- CSV export includes only approved report fields.
- Tests cover automation selection and recommendation state transitions.
- `npm run test`, `npm run typecheck`, and `npm run build` pass.

