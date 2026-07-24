# Sprint One Quality And Review Guide

## Test Plan

Automated tests:

- Domain tests for status-reason rules.
- Existing ticket transition tests still pass.
- Existing SLA tests still pass.
- Existing tag normalization tests still pass.

Manual tests:

- New ticket list filters preserve URL query params.
- Combining filters returns believable results.
- Claiming a ticket updates owner and writes audit.
- Major status changes require reason.
- Minor edits do not require reason.
- Viewer role cannot mutate.

## Review Checklist

Behavior:

- The code matches every acceptance criterion.
- Ownership actions update only assignment fields.
- Required reason logic is not duplicated in multiple places.
- Audit event names are specific enough to search later.

Architecture:

- Business rule is in `packages/domain`.
- UI remains in `apps/web/app`.
- Server action owns mutation and audit side effects.
- Prisma queries are readable and intentionally scoped.

UX:

- Filter controls are understandable.
- The ticket table does not become hard to scan.
- The status reason field does not dominate the form.
- Disabled actions still make permission boundaries visible.

Tests:

- Tests fail for the right reason if the rule changes.
- Test names read like behavior statements.
- No snapshot tests are added for markup that changes often.

## Common Junior Mistakes

- Adding status-reason logic only in the UI.
- Forgetting that server actions can be called without the visible form.
- Updating a whole ticket object for a claim action.
- Writing audit metadata with too much customer text.
- Adding a new table before proving audit metadata is insufficient.
- Filtering SLA state incorrectly for resolved tickets.

## Debugging Prompts

If the filter returns unexpected tickets:

- What does the final Prisma `where` object contain?
- Is the active user loaded before the query?
- Is SLA filtering happening before or after pagination?

If a status change succeeds without a reason:

- Does `updateTicketAction` read the same field name used by the form?
- Is the helper checking the transition target?
- Is the form submitting the intended status value?

If audit history looks wrong:

- Is the action name specific?
- Are `before` and `after` fields minimal but useful?
- Is the timeline sorting by the right timestamp?

## Demo Script

1. Start as `maya.support@agentdesk.local`.
2. Open `/tickets`.
3. Filter to unassigned tickets.
4. Open one ticket and claim it.
5. Return to `/tickets` and filter to tickets assigned to me.
6. Open the claimed ticket and move it to `ESCALATED` with a reason.
7. Show the unified activity timeline.
8. Switch to `victor.viewer@agentdesk.local` and confirm mutation actions are disabled.

## Retrospective Questions

- Which story was easiest to test?
- Which behavior was accidentally hidden inside UI code?
- What would need to change if there were 100,000 tickets?
- Did audit events answer the operational questions a manager would ask?
- What should Sprint Two reuse from this work?

