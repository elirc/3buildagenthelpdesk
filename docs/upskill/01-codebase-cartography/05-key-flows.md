# Key Flows

## Flow: Create Ticket

**Why this flow matters:** It is the cleanest CRUD path and teaches form input, validation, authorization, domain computation, persistence, audit, and redirect.

**Open these files first:**

- `apps/web/app/tickets/new/page.tsx` - form entry point.
- `apps/web/lib/actions.ts:41-89` - server action.
- `packages/domain/src/tickets.ts:13-24` - Zod contract.
- `packages/db/prisma/schema.prisma:137-164` - ticket model.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | UI | `apps/web/app/tickets/new/page.tsx` | renders form | HTML form fields | no inline error UI |
| 2 | action | `apps/web/lib/actions.ts:42-44` | loads user and checks capability | `User.role` | coarse RBAC only |
| 3 | domain | `apps/web/lib/actions.ts:46-57` | parses with `createTicketSchema` | typed ticket input | Zod errors surface roughly |
| 4 | domain | `apps/web/lib/actions.ts:59-74` | computes SLA and create input | Prisma unchecked input | foreign ids not resource-checked |
| 5 | db | `apps/web/lib/actions.ts:75-77` | creates ticket | `Ticket` row | no transaction with audit |
| 6 | audit | `apps/web/lib/actions.ts:79-86` | writes event | `AuditEvent` row | separate write can fail |
| 7 | app | `apps/web/lib/actions.ts:88-89` | revalidates and redirects | route path | no success toast |

**Validation and authorization:** Validation is `createTicketSchema` at `packages/domain/src/tickets.ts:13-24`; authorization is `requireCapability(user.role, "ticket:create")` at `apps/web/lib/actions.ts:44`.

**Persistence and side effects:** Prisma create at `apps/web/lib/actions.ts:75-77`; audit side effect at `apps/web/lib/actions.ts:79-86`.

**Tests that cover it:** No direct server-action integration coverage found. Domain schema is partially covered at `tests/domain.test.ts:42-54`.

**What juniors usually miss:**

- HTML `required` is not the security boundary.
- SLA is server-computed, not form-provided.
- Audit write is a second DB operation.

**What seniors notice:**

- No transaction wraps ticket create and audit event.
- `assignedTeamId`, `assignedUserId`, and `incidentId` are accepted without resource-level authorization.

**Drill:** Add an integration test design for invalid requester email.

**Self-grade:**

- Basic: points to the schema.
- Solid: predicts Zod rejection.
- Strong: explains expected user-facing error and audit behavior.

## Flow: Update Ticket Status

**Why this flow matters:** It demonstrates domain invariants.

**Open these files first:**

- `apps/web/app/tickets/[id]/page.tsx:93-171` - edit form.
- `apps/web/lib/actions.ts:92-161` - mutation.
- `packages/domain/src/tickets.ts:34-55` - transition map.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | UI | `apps/web/app/tickets/[id]/page.tsx:48-50` | allowed statuses are derived | `TicketStatus[]` | UI is helpful, not sufficient |
| 2 | action | `apps/web/lib/actions.ts:93-95` | user capability checked | role/capability | no resource ownership check |
| 3 | db | `apps/web/lib/actions.ts:97-99` | current ticket loaded | existing row | throws framework error if missing |
| 4 | domain | `apps/web/lib/actions.ts:100` | transition asserted | invariant | good boundary |
| 5 | db | `apps/web/lib/actions.ts:110-127` | row updated | full ticket update | large overwrite surface |
| 6 | audit | `apps/web/lib/actions.ts:129-157` | update/status/escalation events | before/after JSON | assignment audit is generic |

**Validation and authorization:** Transition validation is strong for tickets; resource authorization is not present.

**Persistence and side effects:** Updates ticket and writes audit events.

**Tests that cover it:** Basic transition tests at `tests/domain.test.ts:12-16`. No server-action test found.

**Drill:** Find one transition allowed by UI and prove it is also enforced server-side.

**Self-grade:** Strong answers mention UI options are not a trust boundary.

## Flow: Run Ticket Summarization Agent

**Why this flow matters:** It shows the agent architecture without external LLM calls.

**Open these files first:**

- `apps/web/app/tickets/[id]/page.tsx:55-63` - run button.
- `apps/web/lib/actions.ts:327-368` - input builder.
- `apps/web/lib/actions.ts:256-325` - persistence lifecycle.
- `packages/agents/src/ticket-summarization.ts:29-145` - heuristic.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | UI | `apps/web/app/tickets/[id]/page.tsx:59-62` | posts ticket id | form field | button visibility not role-checked in UI |
| 2 | action | `apps/web/lib/actions.ts:328-330` | checks `agent:run` | role capability | coarse only |
| 3 | db | `apps/web/lib/actions.ts:333-340` | loads ticket context | ticket, comments, logs, incident | context may omit older logs |
| 4 | action | `apps/web/lib/actions.ts:342-357` | builds input snapshot | JSON | no Zod input schema |
| 5 | db | `apps/web/lib/actions.ts:263-281` | creates running run and audit | `AgentRun` | audit separate from run |
| 6 | agent | `packages/agents/src/ticket-summarization.ts:40-140` | scores and summarizes | deterministic output | keyword limits |
| 7 | db | `apps/web/lib/actions.ts:289-305` | stores output and audit | JSON output | no output version |

**Tests that cover it:** Heuristic behavior at `tests/agents.test.ts:5-25`; no persisted run integration test found.

**Drill:** Add a fixture where a billing ticket recommends Revenue Operations.

## Flow: Explore Logs and Run Anomaly Detection

**Why this flow matters:** It teaches operational debugging and grouping.

**Open these files first:**

- `apps/web/app/logs/page.tsx:14-35` - log query.
- `apps/web/app/logs/page.tsx:37-60` - fingerprint grouping.
- `apps/web/lib/actions.ts:371-415` - anomaly run action.
- `packages/observability/src/index.ts:64-115` - scoring.
- `packages/agents/src/log-anomaly.ts:29-108` - classification.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | UI | `apps/web/app/logs/page.tsx:14-21` | builds filter object | query params | enum casts bypass validation |
| 2 | db | `apps/web/app/logs/page.tsx:23-35` | loads logs and services | up to 200 logs | fixed window only |
| 3 | UI | `apps/web/app/logs/page.tsx:37-60` | groups fingerprints | derived groups | grouping in UI layer |
| 4 | action | `apps/web/lib/actions.ts:381-390` | reloads filtered logs | up to 80 logs | selected window only |
| 5 | agent | `packages/observability/src/index.ts:75-115` | computes anomaly score | score + reasons | heuristic thresholds |
| 6 | agent | `packages/agents/src/log-anomaly.ts:52-74` | classifies root cause | output JSON | order of regex rules matters |

**Tests that cover it:** Production repeated auth anomaly at `tests/agents.test.ts:27-47`.

**Drill:** Create a test for development-only fatal logs that should not recommend incident creation.

## Flow: Retry or Dead-Letter A Job

**Why this flow matters:** It introduces reliability, idempotency, and side-effect modeling.

**Open these files first:**

- `apps/web/app/jobs/[id]/page.tsx:56-72` - job action buttons.
- `packages/domain/src/jobs.ts:14-20` - retry/dead-letter rules.
- `apps/web/lib/actions.ts:418-478` - job mutations.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | UI | `apps/web/app/jobs/[id]/page.tsx:65-71` | renders retry/dead-letter forms | job id | UI disabled state is not enough |
| 2 | action | `apps/web/lib/actions.ts:419-421` | checks role | capability | no job ownership scope |
| 3 | domain | `apps/web/lib/actions.ts:424-427` | validates retry eligibility | status/attempts | dead-letter has less guard |
| 4 | db | `apps/web/lib/actions.ts:429-437` | marks retrying | job row | no worker executes |
| 5 | audit | `apps/web/lib/actions.ts:439-446` | records retry | before/after | no reason input |

**Tests that cover it:** `canRetryJob` lacks direct tests in current suite.

**Drill:** Design an idempotency key for retry actions.

## Flow: Inspect Agent Run Detail

**Why this flow matters:** It teaches traceability and the difference between recommendation and action.

**Open these files first:**

- `apps/web/app/agents/[id]/page.tsx:9-21` - output extraction.
- `apps/web/app/agents/[id]/page.tsx:24-101` - run display.
- `packages/db/prisma/schema.prisma:244-264` - run persistence shape.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | db | `apps/web/app/agents/[id]/page.tsx:25-28` | loads run | `AgentRun` | generic target id |
| 2 | UI | `apps/web/app/agents/[id]/page.tsx:9-21` | narrows JSON output | unknown to strings | silent fallback |
| 3 | UI | `apps/web/app/agents/[id]/page.tsx:44-96` | displays overview/input/output/trace | JSON blocks | no schema version |

**Tests that cover it:** No UI route test found.

**Drill:** Add an agent output schema and explain what breaks if old runs have older shapes.

## Flow: Seed Demo Data

**Why this flow matters:** Seed data is a teaching fixture and a dangerous operation.

**Open these files first:**

- `packages/db/src/seed.ts:12-22` - reset order.
- `packages/db/src/seed.ts:55-107` - users and incidents.
- `packages/db/src/seed.ts:259-369` - logs.
- `packages/db/src/seed.ts:371-467` - jobs.
- `packages/db/src/seed.ts:469-586` - seeded agent/audit history.

**Trace:**

| Step | Owner | File | What happens | Data shape | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | script | `packages/db/src/seed.ts:12-22` | deletes all domain rows | tables | unsafe outside local |
| 2 | script | `packages/db/src/seed.ts:58-77` | creates teams/users | users/roles | fixed demo users |
| 3 | script | `packages/db/src/seed.ts:79-224` | creates incidents/tickets | linked domain story | time-relative data |
| 4 | script | `packages/db/src/seed.ts:259-369` | creates logs with fingerprints | structured logs | no ingestion validation |
| 5 | script | `packages/db/src/seed.ts:371-467` | creates jobs | failed/running/dead-lettered | not executed workers |
| 6 | script | `packages/db/src/seed.ts:469-586` | creates agent/audit history | JSON outputs | seeded events are illustrative |

**Tests that cover it:** No seed integration tests found.

**Drill:** Add a safety guard that refuses to seed when `NODE_ENV=production`. Write the test first.
