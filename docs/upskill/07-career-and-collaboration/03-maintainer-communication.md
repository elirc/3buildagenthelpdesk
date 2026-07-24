# Maintainer Communication

## Ask For Help Without Outsourcing Thinking

Weak:

> It does not work. What do I do?

Stronger:

> I am tracing ticket update. The UI allows statuses from `apps/web/app/tickets/[id]/page.tsx:48-50`, and the server enforces transitions at `apps/web/lib/actions.ts:97-100`. My test for `CLOSED -> IN_PROGRESS` fails because the domain map has `CLOSED: []` at `packages/domain/src/tickets.ts:41`. Is the intended behavior to require reopening through `RESOLVED`, or should closed tickets stay immutable?

## Bug Report Template

```md
## Symptom

## Reproduction steps

## Expected behavior

## Actual behavior

## Files inspected

## Hypothesis

## Logs/screenshots
```

## Feature Proposal Template

```md
## User problem

## Proposed behavior

## Existing anchors

## Smallest useful version

## Risks

## Test plan
```

## Responding To Requested Changes

Good response:

> Good catch. I moved the transition rule into domain, added a unit test for the rejected transition, and left the UI as a helper only.

Avoid:

> Fixed.

## Respectful Disagreement

Use evidence:

> I see why a page-local helper feels faster. My concern is that `updateTicketAction` accepts raw form data at `apps/web/lib/actions.ts:97-125`, so server-side domain enforcement gives us a safer boundary. Would you be open to keeping the helper in domain and importing it into the page?
