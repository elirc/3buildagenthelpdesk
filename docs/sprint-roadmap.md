# Five-Sprint Feature Roadmap

This roadmap turns the Agentic Help Desk app into a realistic training project for a junior software engineer. The point is not just to add features. The point is to practice how real product work moves from user stories to design, implementation, tests, review, release, and retrospective learning.

The app is already a TypeScript modular monolith with Next.js App Router pages, Prisma persistence, domain packages, deterministic agents, audit events, and Vitest coverage. The sprint docs below build on those existing boundaries instead of inventing a new architecture.

## Sprint Sequence

| Sprint | Theme | Product Outcome | Engineering Focus |
| --- | --- | --- | --- |
| [Sprint One](sprint-one/README.md) | Support Triage and Ownership | Support agents can find, claim, assign, and explain ticket changes faster. | UI filters, server actions, domain rules, audit events, permissions, focused tests. |
| [Sprint Two](sprint-two/README.md) | Incident Response Collaboration | Engineering and support can coordinate incidents with updates, links, and post-incident context. | New data model, relational workflows, incident state, agent extension, cross-page consistency. |
| [Sprint Three](sprint-three/README.md) | Automation, Insights, and Governance | The platform starts acting like an operations system with escalation automation, analytics, and reviewable agent recommendations. | Background jobs, analytics queries, governance workflows, reliability, performance, risk controls. |
| [Sprint Four](sprint-four/README.md) | Enterprise Security and Access Control | Users authenticate through a provider boundary and can access only scoped records. | Auth adapters, organization scoping, resource authorization, redaction, security testing. |
| [Sprint Five](sprint-five/README.md) | Production Reliability and Platform Operations | The app gains delivery, worker, observability, and runbook practices needed for production. | CI, migrations, worker boundaries, request correlation, pagination, operational runbooks. |

## How To Use These Docs

Treat each sprint folder like a lightweight internal delivery packet:

1. Read the sprint `README.md` to understand why the work matters.
2. Read `01-user-stories.md` and restate each story in your own words.
3. Read `02-technical-design.md` before touching code.
4. Use `03-implementation-playbook.md` while implementing.
5. Use `04-quality-and-review.md` before opening a PR.

For learning, implement one vertical story at a time. A vertical story means schema, domain logic, server action, UI, audit, and tests all move together for one visible behavior.

## Suggested Timeline

Each sprint is designed for 1 to 2 weeks of part-time learning, or 3 to 5 focused days for a stronger engineer.

Sprint One should feel concrete and approachable. It mostly improves existing ticket workflows.

Sprint Two introduces broader coordination. It requires new tables and more careful relational thinking.

Sprint Three is intentionally more senior. It adds automation and analytics, where the cost of bad assumptions is higher.

Sprint Four turns the product inward toward enterprise security. It asks who can access each record and how that is enforced.

Sprint Five turns the product outward toward operations. It asks how the team deploys, monitors, debugs, and recovers the system.

## Definition Of Done For Every Sprint

- User stories have clear acceptance criteria.
- Database schema changes are intentional and documented.
- Mutations use server actions and write audit events when business state changes.
- Business rules live in `packages/domain` when they are not purely presentational.
- Tests cover domain behavior, agent heuristics, or action-level behavior where practical.
- The UI remains consistent with `packages/ui` and existing page patterns.
- `npm run typecheck` and `npm run test` pass before review.
- Risks and follow-up work are written down instead of hidden.

## Junior Engineer Practice Goals

By the end of the five sprints, a junior engineer should be able to:

- Trace a product request across UI, server action, domain package, Prisma schema, and tests.
- Explain why a change belongs in `apps/web`, `packages/domain`, `packages/agents`, or `packages/db`.
- Write acceptance criteria that are specific enough to test.
- Add a Prisma model without breaking existing seed data.
- Use audit events as an operational debugging tool.
- Recognize when an agent recommendation should be advisory rather than automatic.
- Prepare a PR description that explains behavior, test evidence, risks, and screenshots.
- Explain how authentication differs from authorization and resource access.
- Add production-facing reliability practices such as CI, migrations, request IDs, pagination, and runbooks.

## Product Narrative

The platform begins as a help desk with operational context. After these sprints, it becomes a more complete internal operations system:

1. Support agents get a better triage queue and clearer ticket ownership.
2. Incident responders get a shared timeline and better linking between tickets, logs, jobs, and incidents.
3. Managers and operators get automation, analytics, and governance over agent-suggested actions.
4. Enterprise admins get stronger identity, access control, tenant boundaries, and redaction.
5. Platform operators get CI, migrations, background workers, request correlation, pagination, and runbooks.

That arc mirrors a common real-world path: teams first improve the human workflow, then improve collaboration, then automate repeated decisions once the workflow is understood, then harden security and operations before production dependency grows.
