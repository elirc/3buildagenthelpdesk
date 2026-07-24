# Sprint One: Support Triage and Ownership

Sprint One improves the ticket workflow that already exists. The app can create, list, edit, comment on, and run an agent against tickets. This sprint makes the day-to-day support experience more realistic by adding triage views, ownership actions, status-change reasons, and clearer activity history.

## Sprint Goal

Support agents can quickly find the right tickets, claim or reassign work, and leave an auditable explanation for meaningful ticket changes.

## Feature Set

- Triage queue filters for unassigned tickets, tickets assigned to the current user, SLA state, category, and linked incident.
- One-click ownership actions: claim ticket, unassign ticket, and assign ticket to a team or user.
- Required status-change reason when a ticket moves to `ESCALATED`, `RESOLVED`, or `CLOSED`.
- Improved activity timeline that combines comments and ticket audit events into one readable stream.
- Tests for ticket triage helpers, status-change reason validation, and ownership permissions.

## Why This Sprint Comes First

This sprint mostly extends existing concepts:

- Existing ticket pages live under `apps/web/app/tickets`.
- Existing mutations live in `apps/web/lib/actions.ts`.
- Existing ticket rules live in `packages/domain/src/tickets.ts`.
- Existing audit writes already record ticket creation and update events.

That makes it a good first sprint because the junior engineer can practice a complete vertical slice without learning a brand-new domain area.

## Learning Outcomes

By the end of Sprint One, the learner should be able to:

- Explain how a form submission reaches a server action.
- Add a query filter to a server-rendered Next.js page.
- Decide whether logic belongs in a page, action, or domain package.
- Write a domain test for a business rule.
- Use audit events to explain who changed what and why.
- Review a PR for behavioral coverage rather than line coverage.

## Primary Files

- `apps/web/app/tickets/page.tsx`
- `apps/web/app/tickets/[id]/page.tsx`
- `apps/web/lib/actions.ts`
- `apps/web/lib/auth.ts`
- `apps/web/lib/audit.ts`
- `packages/domain/src/tickets.ts`
- `packages/domain/src/permissions.ts`
- `packages/db/prisma/schema.prisma`
- `tests/domain.test.ts`

## Sprint Ceremonies

Sprint planning:

- Read the user stories and split them into vertical slices.
- Identify schema changes before UI work begins.
- Agree on the smallest demo that proves the sprint goal.

Daily practice:

- Start each session by naming the current story, files touched, and risk.
- End each session by running one verification command.
- Keep notes on confusing code paths.

Review:

- Demo from the perspective of a support agent.
- Show the audit trail for a status change.
- Show tests that protect the new rule.

Retrospective:

- What was easier because the codebase had clear module boundaries?
- What was harder because server actions, Prisma, and UI are connected?
- Which story should have been split smaller?

## Sprint Definition Of Done

- Triage filters work with combinations of query params.
- Ownership actions respect permissions.
- Important status transitions require a reason.
- Activity history shows comments and audit events in time order.
- Tests cover the new domain helpers.
- `npm run typecheck` and `npm run test` pass.

