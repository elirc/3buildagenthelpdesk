# Annotation Drills

For each excerpt, annotate inputs, outputs, dependencies, invariants, side effects, and failure modes.

## Drill 1: Ticket Creation

Anchor: `apps/web/lib/actions.ts:41-89`

Questions:

- What input is trusted?
- What is validated by Zod?
- What permission is checked?
- What side effects happen after ticket creation?

Self-grade:

- Basic: identifies form input and Prisma create.
- Solid: names Zod, SLA, audit, redirect.
- Strong: notes lack of transaction and resource-level checks for ids.

## Drill 2: Ticket Transition Map

Anchor: `packages/domain/src/tickets.ts:34-55`

Questions:

- What invariant is encoded?
- How is no-op transition handled?
- Which test covers invalid transition?

Self-grade: Strong answer points to `tests/domain.test.ts:12-16`.

## Drill 3: SLA State

Anchor: `packages/domain/src/tickets.ts:57-89`

Questions:

- How does resolved status change SLA interpretation?
- What does "approaching" mean?
- What edge cases are untested?

Self-grade: Strong answer mentions resolved-late and closed-early tests.

## Drill 4: Incident Transition Gap

Anchors: `packages/domain/src/incidents.ts:20-29`, `apps/web/lib/actions.ts:227-254`

Questions:

- Which rule exists?
- Where is it not enforced?
- What test would catch this?

Self-grade: Strong answer labels this confirmed gap, not speculation.

## Drill 5: Log Fingerprint

Anchor: `packages/domain/src/logs.ts:14-23`

Questions:

- What normalization happens before hashing?
- What values stay in the fingerprint input?
- What could over-group?

Self-grade: Strong answer proposes tests for numbers, ids, and service/level differences.

## Drill 6: Log Anomaly Scoring

Anchor: `packages/observability/src/index.ts:64-115`

Questions:

- What raises score?
- What caps score?
- Which weights are domain choices rather than facts?

Self-grade: Strong answer distinguishes heuristic from truth.

## Drill 7: Ticket Agent Heuristic

Anchor: `packages/agents/src/ticket-summarization.ts:40-140`

Questions:

- How is urgency initialized?
- What evidence increases urgency?
- What missing info lowers confidence?

Self-grade: Strong answer notes confidence is not calibrated to real outcomes.

## Drill 8: Agent Persistence

Anchor: `apps/web/lib/actions.ts:256-325`

Questions:

- What is stored before running?
- What is stored on success?
- What is stored on failure?

Self-grade: Strong answer identifies missing transaction and no output schema version.

## Drill 9: Job Retry

Anchors: `packages/domain/src/jobs.ts:14-20`, `apps/web/lib/actions.ts:418-450`

Questions:

- What makes a retry legal?
- What state changes happen?
- Is a real worker triggered?

Self-grade: Strong answer says no real worker is triggered; this is state simulation.

## Drill 10: Agent Detail JSON Narrowing

Anchor: `apps/web/app/agents/[id]/page.tsx:9-21`

Questions:

- Why is `unknown` safer than assuming shape?
- What gets silently dropped?
- How would schema validation improve this?

Self-grade: Strong answer mentions backward compatibility for old runs.
