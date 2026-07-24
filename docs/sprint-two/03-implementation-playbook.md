# Sprint Two Implementation Playbook

## Before Coding

Run:

```bash
npm run test
npm run typecheck
```

Read:

- `packages/db/prisma/schema.prisma`
- `packages/domain/src/incidents.ts`
- `apps/web/app/incidents/[id]/page.tsx`
- `apps/web/lib/actions.ts`
- `packages/agents/src/registry.ts`
- `packages/agents/src/types.ts`

Write down:

- How incidents currently relate to tickets, logs, and jobs.
- How the log anomaly agent is run from an incident.
- Where incident status currently changes.

## Slice 1: Incident Transition Rules

1. Open `packages/domain/src/incidents.ts`.
2. Add allowed transition map and helper functions.
3. Export helpers from `packages/domain/src/index.ts`.
4. Add tests to `tests/domain.test.ts`.
5. Use the helper inside `updateIncidentStatusAction`.

Checkpoint:

```bash
npm run test
```

## Slice 2: Incident Updates Data Model

1. Add `IncidentUpdate` to `packages/db/prisma/schema.prisma`.
2. Add relation fields to `Incident` and `User`.
3. Run Prisma generate.
4. Push or migrate the schema.
5. Add seed updates.
6. Re-seed the database.

Commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Checkpoint:

- Open Prisma Studio or the incident page.
- Confirm updates exist in the database.

## Slice 3: Add Incident Update Action And UI

1. Add `addIncidentUpdateAction`.
2. Validate message length.
3. Store `status` and `severity` if provided.
4. Write `incident.update_added`.
5. Revalidate the incident detail page.
6. Render updates in the incident detail page.

Review questions:

- Is an update different from an audit event?
- Does the UI show who wrote the update?
- Can internal visibility be understood at a glance?

## Slice 4: Owner Assignment

1. Add `assignIncidentOwnerAction`.
2. Load the incident before updating.
3. Update only `ownerId`.
4. Write `incident.owner_changed`.
5. Add a compact owner form to incident detail.

Manual QA:

- Assign owner.
- Change owner.
- Clear owner if product allows it.
- Confirm audit history.

## Slice 5: Link And Unlink Evidence

Implement one entity type first, then repeat.

Recommended order:

1. Ticket link and unlink.
2. Log link and unlink.
3. Job link and unlink.

For each action:

- Require incident update capability.
- Validate incident exists.
- Validate linked entity exists.
- Update only the relation field.
- Write a specific audit event.
- Revalidate incident detail and the linked entity detail page.

Do not over-abstract until at least two actions are implemented and the duplication is obvious.

## Slice 6: Incident Summary Agent

1. Add a new agent implementation file.
2. Add input and output types if the current types file needs them.
3. Register the agent.
4. Add a server action to collect incident context.
5. Persist the agent run using the existing pattern.
6. Add tests for deterministic output.

Implementation reminder:

- The agent should summarize evidence.
- It should not claim certainty when evidence is incomplete.
- Include limitations in the result.

## Final Verification

Run:

```bash
npm run db:generate
npm run test
npm run typecheck
npm run build
```

Manual QA:

- Create or open a seeded incident.
- Add three updates.
- Change status in a valid sequence.
- Attempt an invalid status jump.
- Assign a commander.
- Link and unlink a ticket.
- Link and unlink a job.
- Generate a post-incident summary.
- Open the agent run detail page.

## PR Description Template

```md
## Summary
- Added incident timeline updates.
- Added incident status transition validation.
- Added incident commander assignment.
- Added incident evidence linking.
- Added deterministic incident summary agent.

## Tests
- npm run db:generate
- npm run test
- npm run typecheck
- npm run build

## Risk
- Link-by-ID is intentionally simple for this sprint and should become searchable later.
```

