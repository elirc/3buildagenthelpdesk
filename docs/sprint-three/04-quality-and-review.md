# Sprint Three Quality And Review Guide

## Test Plan

Automated tests:

- Recommendation transition rules.
- SLA escalation selection behavior.
- CSV escaping helper.
- Existing ticket transition tests.
- Existing agent tests.

Manual tests:

- Run SLA escalation with a manager.
- Confirm viewer cannot run automation.
- Run escalation twice and compare audit history.
- Approve a recommendation.
- Reject a recommendation with a note.
- Export CSV.
- Compare analytics counts against visible list pages.

## Review Checklist

Automation:

- Automation has a clear trigger and permission.
- Automation writes start and completion audit events.
- Re-running automation does not create misleading duplicate state changes.
- Skipped records explain why they were skipped.

Recommendations:

- Recommendation state transitions are validated.
- Recommendation review is linked to a user and timestamp.
- Rejected recommendations cannot be applied.
- Applied recommendations remain traceable to the original agent run.

Analytics:

- Queries aggregate in the database where practical.
- Page components do not contain complex query logic.
- Empty data states render cleanly.
- Metrics match product definitions in the user stories.

Export:

- CSV output escapes commas, quotes, and newlines.
- Sensitive fields are excluded.
- Export action is audited.
- File name and content type are clear.

Governance:

- Each automation lists trigger, action, permission, audit event, and rollback.
- The page describes current behavior, not aspirational behavior.
- A reviewer can use it to audit the system.

## Common Junior Mistakes

- Letting an agent mutate records directly.
- Building analytics by loading every row into memory.
- Forgetting that CSV is a data leak risk.
- Adding automation without a summary audit event.
- Allowing rejected recommendations to be applied later.
- Building a scheduler before a manual run proves the behavior.

## Debugging Prompts

If SLA escalation escalates the wrong tickets:

- Is `getSlaState` being called with the same `now` for the whole run?
- Are resolved and closed tickets excluded?
- Is `assertTicketTransition` used before update?

If recommendation review gets stuck:

- Does the current state allow the requested transition?
- Is the reviewer ID being stored?
- Is the UI refreshing after the server action?

If CSV output looks broken:

- Are quotes escaped by doubling them?
- Are cells containing commas wrapped in quotes?
- Are date values consistently formatted?

If analytics are slow:

- Which query loads full records where a count would work?
- Does the page fetch more relations than it renders?
- Should date-range filtering be added before launch?

## Demo Script

1. Open the analytics dashboard and explain current operational health.
2. Run the SLA escalation automation.
3. Show the run summary.
4. Open audit history and find the automation events.
5. Open the agent recommendation queue.
6. Approve one recommendation and reject another.
7. Export the ticket CSV.
8. Open the governance page and explain what automation is allowed to do.

## Retrospective Questions

- Which automation was safe because previous sprints created good signals?
- What still needs a human reviewer?
- Which metric was hardest to define?
- What sensitive data almost made it into the export?
- What would need to change before scheduled automation?

