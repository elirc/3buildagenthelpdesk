# Writing PRs and RFCs

## PR Description Template

```md
## What changed

## Why

## How tested

- [ ] npm run test
- [ ] npm run typecheck
- [ ] npm run lint
- [ ] npm run build

## Risks

## Screenshots or logs

## Follow-ups
```

## Good Commit Messages

Use:

- `test: cover job retry eligibility`
- `docs: add upskill code reading gym`
- `feat: add incident transition guard`

Avoid:

- `fix stuff`
- `updates`
- `refactor everything`

## When To Write An RFC

Write an RFC when:

- schema changes affect several flows,
- auth rules change,
- agent recommendations will mutate data,
- background worker behavior changes,
- migration/rollback matters.

## RFC Template For This Repo

```md
# RFC: [Title]

## Problem

## Current behavior

Anchors:
- `path:line-line`

## Proposal

## Alternatives considered

## Data model changes

## Permission and security impact

## Observability impact

## Test plan

## Rollout and rollback

## Open questions
```

## Drill

Write a one-page RFC for adding `agentVersion` to `AgentRun`. Use `packages/db/prisma/schema.prisma:244-264` and `packages/agents/src/registry.ts:15-34`.
