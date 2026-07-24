# Production Enterprise Audit

Audit date: 2026-05-22

This audit reviews the current Agentic Help Desk codebase as a production-bound enterprise application. It focuses on architecture, system design, implemented strengths, potential issues, risks, and practical steps that would move the app closer to a reliable real-world internal platform.

## Executive Summary

The codebase is a strong learning-oriented modular monolith. It has clear package boundaries, realistic domain objects, deterministic agents, Prisma persistence, server-action mutations, audit events, seed data, and focused tests. That makes it unusually good for teaching how product features travel through UI, business rules, data modeling, and verification.

It is not production-ready yet. The biggest gaps are authentication, tenant isolation, resource-level authorization, background processing, migrations, operational observability, pagination, error handling, and integration test coverage. These are normal MVP gaps, but they would become serious risks if real customer or enterprise operational data entered the system.

Highest-value production moves:

1. Replace demo user switching with an authentication adapter and production identity provider.
2. Add organization or tenant scope to all core data and enforce it in every query and mutation.
3. Add resource-level authorization checks to server actions.
4. Move long-running agent and job execution behind a worker boundary.
5. Adopt committed Prisma migrations and CI quality gates.
6. Add request IDs, structured logs, audit correlation, and operational dashboards.
7. Add pagination, time windows, and retention policies for logs, audit events, jobs, and agent runs.

## Overall Architecture And System Design

The system is a TypeScript modular monolith. This is a good architecture choice for the current product stage because the domain is connected and the app benefits from one codebase, one database, and direct traceability.

Current modules:

| Area | Location | Responsibility |
| --- | --- | --- |
| Web app | `apps/web` | Next.js App Router pages, layouts, server actions, auth helpers, audit helper, formatting. |
| Database | `packages/db` | Prisma schema, Prisma client singleton, seed data. |
| Domain | `packages/domain` | Ticket, incident, job, log, SLA, validation, transition, and permission helpers. |
| Agents | `packages/agents` | Deterministic agent definitions, registry, outputs, traces, confidence scores. |
| Observability | `packages/observability` | Structured log types, audit action type, anomaly scoring, metadata redaction helper. |
| Shared | `packages/shared` | Shared enum constants, labels, small utilities. |
| UI | `packages/ui` | Reusable UI primitives and CSS tokens. |
| Tests | `tests` | Vitest coverage for domain behavior and agents. |

### System Flow

Typical mutation flow:

1. A server-rendered form posts to a server action in `apps/web/lib/actions.ts`.
2. The action loads the active user through `getCurrentUser`.
3. The action checks a coarse role capability through `requireCapability`.
4. Domain helpers validate status transitions, SLA behavior, retry eligibility, or input shape.
5. Prisma writes the business mutation.
6. `writeAuditEvent` records before and after state.
7. Next.js revalidates affected pages.

Typical agent flow:

1. A page action gathers a target snapshot from Prisma.
2. `persistAgentRun` creates an `AgentRun` row with `RUNNING`.
3. `runRegisteredAgent` executes a deterministic local agent synchronously.
4. The run is marked `SUCCEEDED` or `FAILED`.
5. Audit events record start, completion, or failure.

This is simple and teachable. For production, the agent flow should become asynchronous and queue-backed.

## What Has Been Implemented Well

### Clear Modular Boundaries

The repository separates product layers well for a learning platform. UI code does not own ticket transition rules. Agent implementations do not own persistence. Prisma schema and seed data are isolated in `packages/db`. This makes code reading and refactoring safer.

### Good Use Of Domain Helpers

Ticket transitions, SLA due dates, SLA state, tag normalization, retry eligibility, log fingerprinting, and anomaly scoring are represented as reusable helpers. These are exactly the kinds of rules that become bugs when hidden inside page components.

### Deterministic Agent Design

The agents are local and deterministic. That is a strong teaching and testing choice. Each agent returns:

- summary
- findings
- recommendations
- limitations
- confidence score
- structured output
- trace steps

This creates a realistic agent workflow without introducing external API cost, latency, nondeterminism, or prompt drift.

### Audit Events Exist From The Beginning

The app records audit events for major ticket, incident, job, and agent actions. Many MVPs add audit too late. Starting with audit gives the codebase a production-shaped mental model.

### Coherent Seed Data

The seed file creates users, teams, tickets, incidents, logs, jobs, audit events, and agent runs that relate to each other. This is valuable because demos and manual QA can exercise realistic workflows immediately.

### Server-Rendered Pages And URL Filters

List pages use server-rendered queries and URL-based filters. This keeps behavior debuggable and shareable. It also avoids unnecessary client state for simple operational workflows.

### Internal UI System

The UI package provides consistent primitives such as `Card`, `DataTable`, `Badge`, `Metric`, `Field`, and form controls. The CSS is restrained and appropriate for an internal operations tool.

### Focused Tests

The existing Vitest tests cover important domain and agent behavior: ticket transitions, SLA calculations, validation, anomaly scoring, failed-job recommendations, and core agent heuristics. The test suite is not broad enough yet, but it is pointed in the right direction.

## Potential Issues

### Authentication Is Demo-Only

`getCurrentUser` reads an `activeUserId` cookie and falls back to the first seeded user. The top bar includes a global user switcher. This is excellent for learning but not acceptable for production. A production app needs a real identity provider, no silent fallback user, session validation, logout, and environment-specific demo controls.

### Authorization Is Too Coarse

The role capability matrix is a good start, but it answers only questions like "can this role update tickets?" It does not answer "can this user update this ticket?" There is no organization, tenant, team ownership, or record-level access boundary.

### No Tenant Or Organization Isolation

Core tables do not include `organizationId` or tenant scope. If the app ever stores data for multiple customers, departments, or business units, data leakage becomes a major risk.

### Server Actions Trust IDs Too Broadly

Actions load records by submitted IDs and enforce role capability, but they do not consistently validate resource ownership, team membership, organization scope, or whether a linked entity belongs to the same scope.

### Incident Transition Rules Are Not Enforced

The domain package defines incident transition helpers, but `updateIncidentStatusAction` directly updates the incident status. That creates drift between documented domain policy and actual mutation behavior.

### Update Actions Mutate Many Fields At Once

`updateTicketAction` updates title, description, customer, requester, status, priority, category, team, user, incident, tags, resolved time, and SLA due date in one action. This is convenient, but larger production systems often split high-risk changes into narrower actions to reduce accidental overwrites and improve audit quality.

### Error Handling Is Not Productized

Server actions throw errors for missing users, invalid permissions, invalid transitions, and job retry failures. There is no consistent user-facing error pattern. In production, users need recoverable form errors, not framework error pages.

### Audit Action Type Is Not A Database Contract

`AuditEvent.action` is a string in Prisma, while TypeScript has an `AuditAction` union in observability. That gives partial compile-time help but no database-level enforcement and can drift as new action names are added.

### Redaction Helper Is Not Enforced

`redactSensitiveMetadata` exists, but `writeAuditEvent` does not apply it. Structured logs in seed data also write metadata directly. A production app should redact at the write boundary so callers cannot forget.

### Logs Are Stored In The Primary OLTP Database

This is fine for a demo, but production logs usually need retention policies, cheaper storage, ingestion controls, and indexing strategies separate from transactional application data.

### Synchronous Agent Execution Can Block Requests

Agents run inside server actions. The current agents are fast, but the architecture teaches a path that would become risky if agents call external services, inspect larger datasets, or run multi-step workflows.

### Background Jobs Are State Records, Not A Worker System

The app models background jobs and supports retry/dead-letter state changes, but no worker actually executes queued or retrying jobs. Retry changes database state only.

### No Committed Migration Workflow

The project has Prisma schema and scripts for `db:push` and `db:migrate`, but there are no migration files in the current inventory. Shared or production environments need migrations and deploy-time migration discipline.

### High-Volume Pages Need Pagination And Time Windows

Logs, audit events, jobs, and agent runs use bounded `take` values such as 150 or 200, but they do not provide true pagination or time-window controls everywhere. This will become limiting as records grow.

### Generic Target References Lack Referential Integrity

`AgentRun` uses `targetType` and `targetId`. `AuditEvent` uses `entityType` and `entityId`. This is flexible, but the database cannot enforce that targets exist.

### Form Validation Is Incomplete In Update Paths

Create schemas are used for creation, but some update actions manually cast values from form data. Production mutation paths should parse and validate full inputs with schemas.

### UI Disabled Links Are Not Enforcement

The `Button` component renders disabled links with `aria-disabled`, but links remain navigable. Server-side checks are the real enforcement. UI disabled state should be treated only as guidance.

### Security Headers And Rate Limits Are Missing

The Next config does not define production security headers. There is no rate limiting, request throttling, CSRF strategy documentation, content security policy, or brute-force protection.

### CI/CD Is Missing

There is no workflow that runs install, Prisma generation, typecheck, tests, lint, and build for every pull request.

## Potential Risks

| Risk | Severity | Why It Matters | Recommended Mitigation |
| --- | --- | --- | --- |
| Cross-tenant data leakage | Critical | No organization boundary exists. | Add organization scope and enforce it in queries and actions. |
| Unauthorized mutations | High | Role checks are coarse and submitted IDs are trusted too broadly. | Add resource-level authorization helpers and integration tests. |
| Production auth bypass | Critical | Demo cookie switcher and fallback user are unsafe. | Add auth provider boundary and disable demo provider in production. |
| Incomplete audit history | High | Some changes are generic or missing context such as request ID and actor role. | Add audit conventions, correlation IDs, and tests. |
| Secret leakage in metadata | High | Redaction helper is not enforced at write boundaries. | Redact audit and log metadata by default. |
| Request blocking from agent runs | Medium | Synchronous agents will not scale to real external calls. | Queue agent work through background jobs. |
| Data loss from seed reset | High | Seed reset deletes all records and is easy to run locally. | Label local-only, guard production environment, use migrations and backups. |
| Operational blind spots | High | No structured server-action logs, metrics, traces, alerts, or request IDs. | Add observability and alerting plan. |
| Schema drift | Medium | Shared enum constants and Prisma enums must stay aligned manually. | Add contract tests comparing shared constants to Prisma enums. |
| Slow list pages | Medium | Logs and audit will grow quickly. | Add pagination, time windows, indexes, and retention. |

## Production Enterprise Improvements

### 1. Identity And Access

Recommended work:

- Add an auth provider interface.
- Keep local demo auth as one provider.
- Add production provider support for OIDC or SAML.
- Remove fallback-to-first-user behavior outside local demo mode.
- Add organization scope to core data.
- Add resource-level access checks for every server action.
- Add permission tests for every role and major mutation.

Target outcome:

Users can authenticate through enterprise identity and can only view or mutate records they are allowed to access.

### 2. Database And Data Integrity

Recommended work:

- Commit Prisma migrations.
- Add production migration deployment docs.
- Add organization indexes.
- Add unique constraints where natural identifiers matter, such as request IDs when appropriate.
- Add soft-delete or archive strategy for business records.
- Add retention policies for logs, audit events, jobs, and agent runs.
- Add backup and restore runbooks.

Target outcome:

Schema changes are reviewable, reversible through forward-fix discipline, and operationally safe.

### 3. Background Processing

Recommended work:

- Add a worker process.
- Add job claiming semantics.
- Execute retries through worker handlers.
- Move agent runs behind `AGENT_RUN` jobs.
- Add job locking, heartbeat, and timeout fields if multiple workers are expected.
- Record worker audit events and structured logs.

Target outcome:

Long-running or retryable work is observable, retryable, and decoupled from web requests.

### 4. Observability And Operations

Recommended work:

- Generate request IDs for server actions.
- Include request IDs in audit metadata, logs, jobs, and agent runs.
- Add structured logs for mutation start, success, failure, duration, actor, and entity.
- Add metrics for ticket creation, SLA breach, incident severity, failed jobs, agent failures, and low-confidence runs.
- Add alert thresholds for critical SLA breaches, active SEV1 incidents, fatal production logs, and dead-letter spikes.
- Add dashboards for operational health and agent reliability.

Target outcome:

An engineer can debug a production issue by following one correlated trail instead of searching unrelated tables.

### 5. Agent Trust And Governance

Recommended work:

- Add `agentVersion` to agent definitions and persisted runs.
- Add Zod schemas for agent inputs and outputs.
- Extract reusable input snapshot builders.
- Add fixture-based evaluation tests.
- Add recommendation review records before agent suggestions mutate business state.
- Add confidence calibration notes and visible limitations.
- Add approval workflow for high-risk recommendations.

Target outcome:

Agents remain useful assistants while humans retain control over risky operational changes.

### 6. Testing Strategy

Recommended work:

- Add integration tests for server actions with Prisma test database.
- Add authorization tests for every role and mutation.
- Add contract tests that shared TypeScript enum constants match Prisma enums.
- Add audit tests to ensure important mutations write events.
- Add UI route smoke tests for seeded data.
- Add worker tests for success, retry, dead-letter, and failure paths.

Target outcome:

The test suite protects behavior across layers, not just pure helper functions.

### 7. User Experience Hardening

Recommended work:

- Add user-facing validation errors for form submissions.
- Add pending states for actions.
- Add pagination controls.
- Add empty states for unseeded or filtered views.
- Add accessible disabled behavior for links or avoid link-style disabled actions.
- Add clearer status reason and audit timeline views.

Target outcome:

Operators can recover from mistakes and understand system state without reading server errors.

### 8. Security And Compliance

Recommended work:

- Add security headers.
- Document CSRF posture for server actions.
- Add rate limits for mutation-heavy paths.
- Redact sensitive metadata by default.
- Add audit export controls.
- Add data classification notes for descriptions, comments, logs, metadata, and agent snapshots.
- Add dependency scanning in CI.

Target outcome:

The platform can hold sensitive operational data with stronger guardrails.

## Suggested Production Readiness Roadmap

### Phase 1: Correctness And Safety

- Enforce incident transitions in server actions.
- Validate update inputs with Zod.
- Add audit metadata redaction.
- Add role/capability tests.
- Add request IDs to audit events.
- Add user-facing mutation errors.

### Phase 2: Enterprise Access

- Add auth provider boundary.
- Add organization scope.
- Add resource-level authorization.
- Add scoped list and detail queries.
- Add cross-organization denial tests.

### Phase 3: Operations Backbone

- Add CI.
- Add migrations.
- Add worker boundary.
- Queue agent runs.
- Add pagination and time windows.
- Add runbooks.

### Phase 4: Observability And Scale

- Add structured logs and metrics.
- Add alerting thresholds.
- Add retention policies.
- Move high-volume logs to purpose-built storage if needed.
- Add performance budgets and load testing.

### Phase 5: Agent Governance

- Add agent versioning.
- Add recommendation review.
- Add evaluation fixtures.
- Add approval workflow.
- Add run graph or orchestration metadata.

## Bottom Line

The app is well designed as a production-shaped learning system. Its architecture is clear, its domain is coherent, and its deterministic agents are a smart choice for safe practice. The next maturity step is not adding more screens. The next step is making every existing workflow secure, scoped, observable, testable, and operable.

If this were moving toward a real enterprise deployment, I would prioritize identity, tenant isolation, server-action authorization, migrations, CI, request correlation, and worker-backed execution before putting real customer data into it.

