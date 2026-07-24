# Junior to Mid-Level Learning Plan

## Goal

Use this project to practice reading, modifying, debugging, and explaining a production-style TypeScript codebase.

## 14-Day Plan

Day 1: Read `README.md`, architecture overview, and Prisma schema. Draw the entity relationships.

Day 2: Trace ticket creation from UI to database. Add one field to the ticket list.

Day 3: Study ticket transitions and SLA logic. Add a test for a resolved ticket that breached SLA.

Day 4: Inspect ticket detail. Add a small UI improvement to the comments timeline.

Day 5: Trace incident pages. Add a filter to show only active incidents.

Day 6: Study structured logs. Add a new seeded log pattern and confirm grouping works.

Day 7: Study failed jobs. Add a new job error case and update the failed job agent test.

Day 8: Read the agent system guide. Add one heuristic to the ticket summarization agent.

Day 9: Trace agent run persistence. Add a new trace step and inspect it in `/agents/[id]`.

Day 10: Study audit events. Add an audit event to one mutation that currently lacks detail.

Day 11: Debug the auth incident from ticket to logs to failed job. Write a short incident summary.

Day 12: Add a small extension project, such as a stale ticket detector.

Day 13: Run tests, break one heuristic, watch tests fail, then fix it.

Day 14: Prepare an architecture review: explain modules, tradeoffs, limitations, and next steps.

## Daily Reading Tasks

- Read one page component.
- Read one server action.
- Read one domain helper.
- Read one test.
- Read one seed scenario.

## Small Code Modification Tasks

- Add a new ticket category.
- Add a new job type.
- Add a new dashboard metric.
- Add an incident status filter.
- Add an audit metadata field.
- Add a new agent limitation.

## Debugging Exercises

- Why is an SLA breached?
- Why did a ticket escalation fail?
- Which logs share the same fingerprint?
- Which jobs are safe to retry?
- Which audit events reconstruct the incident timeline?

## Agent Extension Exercises

- Add a security-risk keyword to ticket summarization.
- Add a payment-provider anomaly type.
- Add a missing-payload-field detector for jobs.
- Add confidence score tests.
- Add a future `POSTMORTEM_DRAFT` enum without implementing the agent.

## Architecture Review Exercises

- Explain why this is a modular monolith.
- Explain where business rules live.
- Explain how agent persistence is decoupled from agent execution.
- Explain how a real LLM adapter could replace deterministic heuristics.
- Explain what would need to change for multi-tenant support.

## Interview Talking Points

- You worked with a modular monolith rather than microservices.
- You separated UI, domain, data, agents, and observability.
- You implemented deterministic mock agents with persisted traces.
- You modeled auditability and operational debugging.
- You tested domain logic independently from the UI.
- You can trace customer impact from ticket to incident to logs to jobs.
