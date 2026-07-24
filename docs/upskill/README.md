# Upskill Curriculum

This curriculum turns the Agentic Help Desk repository into a training lab for a junior engineer growing toward mid-level and senior judgment. It is for learners who want to read real code, make safe changes, explain tradeoffs, and practice interview-ready engineering thinking using this exact codebase.

## Repo Identity

This is a TypeScript modular monolith for an internal help desk and incident intelligence platform. The web app lives in `apps/web`, and shared packages live in `packages/*` through npm workspaces (`package.json:6-9`). The product surface includes tickets, incidents, structured logs, background jobs, audit events, and deterministic mock agents. Persistence is modeled in Prisma (`packages/db/prisma/schema.prisma:111-281`). Mutations happen mostly through Next.js server actions (`apps/web/lib/actions.ts:41-530`). Business invariants live in `packages/domain`, especially ticket transitions and SLA rules (`packages/domain/src/tickets.ts:34-89`). Agents are local heuristic systems, not real LLM calls (`packages/agents/src/types.ts:16-39`).

## How To Use This

One weekend:

1. Read [00-fast-track.md](00-fast-track.md).
2. Trace ticket creation and one agent run.
3. Run `npm run test`, `npm run typecheck`, and `npm run build`.
4. Attempt one good-first ticket from [06-contribution-practice/01-good-first-tickets.md](06-contribution-practice/01-good-first-tickets.md).

Two weeks:

1. Work through cartography and stack mastery.
2. Complete 4 annotation drills and 2 trace tables.
3. Add or improve 3 tests.
4. Write one PR description using the template in [07-career-and-collaboration/02-writing-prs-and-rfcs.md](07-career-and-collaboration/02-writing-prs-and-rfcs.md).

Eight weeks:

1. Complete every key flow and pattern card.
2. Implement 3 junior tickets and 1 mid-level feature ticket.
3. Run one senior design kata.
4. Practice the interview prompts in [07-career-and-collaboration/04-interview-prep-from-this-repo.md](07-career-and-collaboration/04-interview-prep-from-this-repo.md).

Ongoing contribution practice:

1. Keep a local learning log.
2. Read one new file with line annotations each session.
3. Avoid drive-by refactors.
4. Make changes that follow existing boundaries.
5. Add tests for behavior, not just implementation details.

## Major Learning Tracks

- Codebase cartography: where features, data, and contracts live.
- Stack mastery: TypeScript, JavaScript runtime, Next.js App Router, React Server Components, Prisma, Zod, Vitest.
- Architecture: modular monolith boundaries, persistence, validation, permissions, side effects, reliability.
- Code reading gym: annotation drills, trace tables, fake-code contrasts, review katas.
- Quality engineering: testing, debugging, performance, security, observability.
- Contribution practice: realistic small tickets, mid-level features, senior projects.
- Career and collaboration: code review, PRs, RFCs, maintainer communication, interview prep.

## Recommended Paths

Brand-new junior:

1. [00-fast-track.md](00-fast-track.md)
2. [01-codebase-cartography/02-file-reading-order.md](01-codebase-cartography/02-file-reading-order.md)
3. [04-code-reading-gym/01-annotation-drills.md](04-code-reading-gym/01-annotation-drills.md)
4. [06-contribution-practice/01-good-first-tickets.md](06-contribution-practice/01-good-first-tickets.md)

Junior with basic stack familiarity:

1. [01-codebase-cartography/05-key-flows.md](01-codebase-cartography/05-key-flows.md)
2. [02-stack-and-language-mastery/03-type-system-and-contracts.md](02-stack-and-language-mastery/03-type-system-and-contracts.md)
3. [05-quality-engineering/02-writing-tests-here.md](05-quality-engineering/02-writing-tests-here.md)

Mid-level engineer new to this repo:

1. [03-architecture-and-patterns/01-boundaries-and-layers.md](03-architecture-and-patterns/01-boundaries-and-layers.md)
2. [03-architecture-and-patterns/05-pattern-catalog.md](03-architecture-and-patterns/05-pattern-catalog.md)
3. [06-contribution-practice/02-mid-level-feature-tickets.md](06-contribution-practice/02-mid-level-feature-tickets.md)

Senior engineer doing architecture review:

1. [03-architecture-and-patterns/06-architecture-critique.md](03-architecture-and-patterns/06-architecture-critique.md)
2. [08-reference/risk-register.md](08-reference/risk-register.md)
3. [06-contribution-practice/03-senior-build-projects.md](06-contribution-practice/03-senior-build-projects.md)

## Conventions

- File anchors use `path:line-line`. Some are plain text rather than clickable because the docs live at different nesting depths.
- Fake code is always labeled as illustrative.
- Drills are active reading or implementation exercises.
- Self-grading uses Basic, Solid, and Strong levels.
- Verification notes list commands run, files inspected, and uncertainties.

## Senior Mindset

A junior asks, "How do I make it work?" A mid-level engineer asks, "Is this the right pattern for this codebase?" A senior asks, "What does this commit us to, who pays the cost, what breaks under load or misuse, and how do we reduce risk before the blast radius grows?"

## Verification Notes

- Inspected file inventory with `rg --files -g '!node_modules' -g '!.next'`.
- Inspected root scripts in `package.json:10-24`.
- Inspected Prisma schema in `packages/db/prisma/schema.prisma:111-281`.
- Inspected server actions in `apps/web/lib/actions.ts:41-530`.
- Inspected domain rules in `packages/domain/src/*.ts`.
- Inspected agent files in `packages/agents/src/*.ts`.
- Prior verification from this repo showed `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass. Current docs pass adds documentation only.
- Uncertainty: Docker daemon was previously unavailable even though Docker CLI existed, so database seed was not re-run during this documentation pass.
