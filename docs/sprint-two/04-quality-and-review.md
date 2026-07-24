# Sprint Two Quality And Review Guide

## Test Plan

Automated tests:

- Incident status transition helper allows normal lifecycle.
- Incident status transition helper rejects invalid jumps.
- Resolved incidents can reopen to investigating.
- Incident summary agent produces stable output.
- Existing agent tests still pass.

Manual tests:

- Add an incident update.
- Add an internal update and confirm it is labeled.
- Change owner.
- Link ticket, log, and job.
- Unlink ticket, log, and job.
- Generate incident summary.
- Confirm audit history records each business change.

## Review Checklist

Data model:

- `IncidentUpdate` has the right indexes.
- Relations use the correct delete behavior.
- Optional fields are optional for a reason.
- Seed data demonstrates the feature.

Domain:

- Transition rules are centralized.
- Error messages are clear.
- Tests describe product behavior.

Actions:

- Each action mutates the smallest possible set of fields.
- Each action checks permissions.
- Each action writes useful audit events.
- Revalidation covers source and target pages.

Agent:

- Output is deterministic.
- Confidence reflects evidence quality.
- Limitations are included.
- Tests do not depend on random ordering.

UI:

- Incident detail remains scannable.
- Timeline is readable when many updates exist.
- Linked evidence is easy to inspect.
- Empty states tell the user what is missing.

## Common Junior Mistakes

- Treating audit events as a substitute for collaboration notes.
- Updating incident status without checking the domain transition.
- Forgetting to update Prisma relations on both sides.
- Adding a new agent enum in one package but not another.
- Making the incident summary sound too confident.
- Revalidating only `/incidents` and forgetting `/incidents/[id]`.

## Debugging Prompts

If Prisma generate fails:

- Are both sides of the relation declared?
- Does the relation name conflict with an existing one?
- Did the enum change in Prisma but not TypeScript shared constants?

If linked evidence does not show up:

- Is the incident detail query including the relation?
- Did the action update the correct foreign key?
- Did the page revalidate after mutation?

If the agent output is missing evidence:

- Is the server action collecting the related records?
- Are logs ordered and limited in a sensible way?
- Does the agent input shape match the test input shape?

## Demo Script

1. Open `/incidents`.
2. Open an active incident.
3. Assign an incident commander.
4. Add a timeline update.
5. Change status from `INVESTIGATING` to `IDENTIFIED`.
6. Link a related ticket.
7. Link a failed job.
8. Generate a post-incident summary.
9. Open the agent run and explain confidence and limitations.

## Retrospective Questions

- Did the new model earn its complexity?
- Which mutation should have been split smaller?
- Did the incident page become too dense?
- What would make evidence linking easier for users?
- Which parts of Sprint Two should Sprint Three automate?

