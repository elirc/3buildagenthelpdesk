# Learning Rubrics

## Junior Readiness

Observable behaviors:

- Can run install/test/typecheck/build commands.
- Can describe repo packages from `package.json:6-9`.
- Can trace ticket creation from form to Prisma.
- Can add a unit test for pure domain logic.
- Can avoid changing unrelated files.

Checklist:

- [ ] I can explain `packages/domain/src/tickets.ts:13-89`.
- [ ] I can explain `apps/web/lib/actions.ts:41-89`.
- [ ] I can run `npm run test`.
- [ ] I can make one good-first ticket change.

## Mid-Level Readiness

Observable behaviors:

- Can design a cross-layer change.
- Can write tests at the right layer.
- Can identify authorization, validation, and persistence boundaries.
- Can debug by narrowing layers.
- Can review PRs for correctness, not just style.

Checklist:

- [ ] I can explain server actions as application services.
- [ ] I can identify when a rule belongs in domain.
- [ ] I can propose integration tests for audit behavior.
- [ ] I can explain agent input snapshots and limitations.
- [ ] I can identify query performance risks.

## Senior Readiness

Observable behaviors:

- Can critique architecture without rewriting everything.
- Can separate confirmed issues from hypotheses.
- Can design migrations and rollback plans.
- Can reason about blast radius and operational visibility.
- Can mentor others with precise review comments.

Checklist:

- [ ] I can prioritize the risk register.
- [ ] I can write an RFC for agent approval workflow.
- [ ] I can propose resource-level authorization migration.
- [ ] I can design observability for server actions.
- [ ] I can explain tradeoffs of generic entity references.

## Self-Assessment Scale

| Level | What it sounds like |
| --- | --- |
| Weak | "I found the file but I am not sure why it matters." |
| Basic | "This file creates tickets." |
| Solid | "This action validates input, checks permission, computes SLA, writes Prisma, audits, and redirects." |
| Strong | "This action has clear orchestration, but create and audit are not transactional, ids are not resource-scoped, and integration coverage is missing." |
