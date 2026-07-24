# Staff Engineering Audit

This document audits the current MVP as if it were the first production-bound slice of an internal enterprise platform. The goal is not to criticize the MVP for being small; it is to make the next engineering moves obvious.

## Executive Summary

The system has strong learning-oriented boundaries: UI, domain logic, persistence, observability helpers, and deterministic agents are separated well enough for a junior-to-mid engineer to trace real workflows. The largest risks are not architectural collapse risks yet. They are correctness, authorization, operational visibility, and agent trust risks.

Highest-priority improvements:

1. Add integration tests around server actions and Prisma persistence.
2. Harden role-based access control beyond UI affordances.
3. Add explicit error handling and user-facing mutation feedback.
4. Expand audit events into a coherent timeline model.
5. Add agent evaluation fixtures so heuristic changes cannot silently degrade behavior.

## Failure-Mode Inventory

### Authentication and Authorization

- Active user simulation is cookie-based and not cryptographically meaningful.
- Server actions rely on coarse role capability checks; there is no resource-level authorization.
- Viewer role can still reach server-rendered pages with sensitive operational data.
- There is no tenant/account boundary, so future multi-tenant data could leak if added casually.
- User switcher is available globally in development style; there is no environment guard.
- Role permissions are not tested across every mutation.
- A user may assign tickets or incidents to teams/users without membership validation.
- There is no protection against editing closed tickets beyond transition rules.
- Audit viewing is broad; there is no filtering by sensitivity or role.

### Ticket Workflow

- Ticket updates replace many fields at once, which can create accidental overwrites.
- Edit form does not handle domain errors gracefully, such as invalid transitions.
- SLA recalculates when priority changes based on original creation time; this is reasonable but undocumented in UI.
- There is no separate first-response SLA versus resolution SLA.
- Tags are plain strings without governance, color, ownership, or taxonomy.
- Ticket status transitions exist for tickets but are not mirrored by rich workflow metadata.
- Assignment changes create only generic ticket update audit events unless escalation occurs.
- Comment visibility is modeled, but customer/internal separation is not enforced by role.
- Ticket delete is not implemented, but the capability exists.
- Linked incident changes do not update incident counts directly; counts rely on relation queries.
- Ticket forms accept incident/team/user ids without checking entity existence before mutation.

### Incident Workflow

- Incident status update does not call the domain incident transition guard.
- Incident updates are status-only after creation; severity, owner, and description edit flows are missing.
- Incident severity changes would need stronger audit semantics before production use.
- There is no incident timeline assembled from tickets, logs, jobs, comments, and audit events.
- Resolved incidents can be linked to new tickets without warning.
- Agent findings on `Incident` are seeded but not updated by new anomaly runs.
- There is no postmortem workflow or action item model.
- No explicit incident commander, communications owner, or stakeholder update cadence exists.

### Logs and Observability Data

- Logs are persisted in the primary database; production-scale logs would need separate storage or retention policy.
- Metadata is JSON without schema validation by service or event type.
- Fingerprint grouping is deterministic but basic; normalization may over-group or under-group errors.
- Log filters are useful but lack time-window controls.
- Log anomaly runs operate only on selected rows, not on a rolling baseline.
- Request id exists but there is no trace/span model.
- User id is a string field on logs, not a relation to `User`.
- Sensitive metadata redaction helper exists but is not enforced during log creation.
- Log ingestion is seeded/static; no ingestion API or background producer exists.

### Background Jobs

- Retrying a job only updates database state; no worker executes the retry.
- Dead-lettering has no reason/comment field.
- Job payloads are JSON without Zod validation per job type.
- Retry eligibility is simple and does not account for error class or idempotency.
- There is no job scheduling, locking, concurrency, or worker heartbeat model.
- There is no job run history table separate from the current job row.
- Max attempts can be edited only through data, not policy.
- Related logs are inferred through ticket/incident links, which can miss worker-specific logs.
- `AGENT_RUN` job type exists but agent runs are executed synchronously in server actions.

### Agent System

- Agents are deterministic and testable, but inputs are assembled ad hoc in server actions.
- There is no shared input builder per target type.
- Agent outputs are stored as generic JSON with no persisted output schema version.
- Agent confidence is heuristic and not calibrated against fixtures or expected outcomes.
- No agent evaluation suite exists beyond a few unit tests.
- No parent/child run model exists for orchestration.
- No human approval model exists for recommendations.
- Agent run failure handling is persisted but not surfaced prominently in dashboards.
- Agent trace is JSON, but there is no first-class trace-step table for querying.
- Agent limitations are returned, but UI does not force users to acknowledge them before acting.
- There is no prompt/version/config registry because there are no LLMs yet; deterministic heuristic versions still need versioning.

### Data Integrity

- Several relationships are optional, which is useful for MVP flexibility but allows orphan operational data.
- Generic `targetType` plus `targetId` on `AgentRun` and `AuditEvent` enables extensibility but lacks referential integrity.
- Audit events store `entityId` as string without foreign keys.
- The seed reset deletes all data and is not safe against accidental production use.
- No migrations are checked in yet; schema evolution process is not demonstrated.
- There are no unique constraints for some natural identifiers like request ids.
- There is no optimistic concurrency control for edits.
- There is no soft-delete/archive model.

### UI and UX

- Forms are mostly server-action forms without inline validation feedback.
- Mutation errors will render framework error states instead of polished product states.
- Tables have limited pagination; large datasets would be slow or noisy.
- The top-bar user switcher requires a submit button rather than immediate switching.
- Search/filter state is URL-based, which is good, but filters are incomplete.
- There is no loading or pending state for server actions.
- No empty-state guidance exists for many seeded-data-dependent views.
- Dashboard metrics are useful but not configurable.

### Deployment and Operations

- Build can pass without database access, but runtime requires `DATABASE_URL`.
- Docker Compose exists, but there is no health wait script before `db:push`.
- No production environment configuration guide exists.
- No CI workflow is defined.
- No logging sink, metrics sink, or alerting integration exists.
- npm audit currently reports transitive vulnerabilities after install.
- No backup/restore or retention strategy is documented.
- No performance budgets or load expectations are documented.

## Missing Tests List

### Domain Unit Tests

- All ticket transition pairs, including no-op transitions.
- Invalid transition error messages.
- SLA state for resolved late, resolved early, closed late, and closed early.
- Priority change SLA recalculation policy.
- `shouldEscalateTicket` keyword and linked-incident behavior.
- `inferCategoryFromText` keyword coverage for every category.
- `normalizeTags` max-length and duplicate behavior.
- Incident transition rules.
- Incident severity weighting.
- Job retry and dead-letter edge cases.
- Permission matrix for every role/capability pair.
- Log fingerprint stability and normalization behavior.
- Log level and environment weighting.

### Validation Tests

- Create ticket schema rejects short title, invalid email, empty description, too many tags.
- Update ticket schema rejects unknown status/category/priority.
- Create incident schema rejects invalid severity, missing service, short description.
- Job schema rejects invalid attempts and max attempts.
- Log filter schema rejects invalid enum values.

### Agent Unit Tests

- Ticket agent recommends Support for simple non-incident access questions.
- Ticket agent recommends Revenue Operations for billing issues.
- Ticket agent decreases confidence when required context is missing.
- Ticket agent detects broad customer impact.
- Log anomaly agent handles empty log windows.
- Log anomaly agent classifies integration/webhook failures.
- Log anomaly agent classifies database timeout failures.
- Log anomaly agent avoids incident creation for development-only errors.
- Failed job agent classifies permission failures.
- Failed job agent classifies rate limits.
- Failed job agent treats timeout failures as retryable.
- Failed job agent escalates when linked to SEV1/SEV2 incidents.
- Agent trace contains expected steps for each major heuristic.
- Confidence scores remain within 0-100.

### Server Action Integration Tests

- Create ticket persists ticket and `ticket.created` audit event.
- Update ticket enforces transition rules.
- Update ticket writes `ticket.status_changed`.
- Escalating ticket writes `ticket.escalated`.
- Add comment writes comment and audit event.
- Create incident writes audit event.
- Update incident status enforces valid incident transitions after guard is added.
- Retry job checks capability and eligibility.
- Dead-letter job checks capability.
- Running each agent creates `RUNNING`, then `SUCCEEDED`, with output and audit events.
- Agent failure path records `FAILED` and `agent.run_failed`.

### Database and Seed Tests

- Seed creates all demo users and roles.
- Seed creates coherent ticket/incident/log/job links.
- Seeded auth incident has repeated auth-service production fingerprints.
- Seeded failed jobs cover timeout, invalid payload, permission, malformed JSON, and rate limit.
- Prisma schema supports expected relation traversals for dashboard queries.

### UI and Route Tests

- Dashboard renders with seeded data.
- Ticket list filters by status, priority, and search query.
- Ticket detail shows linked incident, logs, jobs, comments, audit events, and agent panel.
- New ticket form renders all required controls.
- Incident detail shows linked evidence.
- Logs explorer groups fingerprints.
- Job detail disables retry when not eligible.
- Agent detail displays input, output, trace, limitations, findings, and recommendations.
- Settings page switches active user.

### Authorization Tests

- Viewer cannot create tickets.
- Viewer cannot update tickets.
- Viewer cannot retry jobs.
- Support Agent cannot dead-letter jobs.
- Engineering can retry and dead-letter jobs.
- Manager can create incidents but cannot retry jobs unless intentionally allowed.
- Admin can perform all mutations.

### Regression and Contract Tests

- Agent output JSON shapes are backward-compatible.
- Audit event action names do not drift.
- Label maps cover every shared enum value.
- Prisma enum values match shared TypeScript constants.
- Server action input builders include required agent context.

## Observability Gaps

### Structured Application Logging

- Add request-scoped structured logs for every server action.
- Include actor user id, role, action, entity id, success/failure, duration, and request id.
- Log validation failures separately from unexpected exceptions.
- Log agent input size, output size, duration, status, and confidence.
- Redact sensitive metadata before persistence.

### Metrics

- Count tickets created, updated, escalated, resolved, and breached.
- Track SLA breach rate by priority and team.
- Track active incidents by severity and service.
- Track failed jobs by type, status, and error class.
- Track agent run count, failure rate, duration, and confidence distribution.
- Track log anomaly scores over time by service/environment.

### Tracing

- Introduce a generated request id for every server action.
- Carry request id into audit metadata and structured logs.
- Add a lightweight trace context for agent runs.
- Link ticket update, audit event, agent run, and job mutation under the same request id.

### Auditability

- Add audit event reason fields for human-triggered status changes.
- Add before/after diffs for assignment and incident linkage changes.
- Add first-class audit timeline views per ticket and incident.
- Add actor role and request id into audit metadata.
- Add audit tests to prevent untracked mutations.

### Operational Dashboards

- Add dashboard panels for agent failures and low-confidence runs.
- Add failed job error-class breakdown.
- Add SLA breach trend rather than only current count.
- Add production error burst trend by service.
- Add recent high-severity audit events.

### Alerting

- Define alert thresholds for SEV1/SEV2 active incidents.
- Alert when critical tickets breach SLA.
- Alert when production fatal logs appear.
- Alert when job dead-letter count rises.
- Alert when agent run failure rate rises.
- Alert when repeated fingerprint score crosses threshold.

## Agent-Extension Plan

### Phase 1: Stabilize Current Agents

Goal: make deterministic agents trustworthy and regression-resistant.

Work items:

- Add Zod schemas for each agent input and output.
- Add `agentVersion` to agent definitions and persisted runs.
- Extract input snapshot builders from server actions into reusable services.
- Add fixture-based evaluation tests for each agent.
- Add confidence calibration notes in agent docs.
- Add dashboard widgets for failed and low-confidence runs.
- Add a visible limitations panel to every agent output view.

### Phase 2: Add Human Approval

Goal: separate recommendation from action.

Work items:

- Add `AgentRecommendation` records.
- Add approval status: pending, approved, rejected, applied.
- Add reviewer id, decision notes, and timestamps.
- Require approval before any future agent mutates tickets, incidents, or jobs.
- Add audit events for approval decisions.
- Add UI for approval queue.

### Phase 3: Add Postmortem and RCA Agents

Goal: convert incident evidence into useful operational narrative.

Agents:

- Incident Postmortem Agent
- Root Cause Analysis Agent
- Customer Impact Summary Agent

Inputs:

- Incident record
- Linked tickets
- Linked logs and fingerprints
- Failed jobs
- Audit events
- Agent run history

Outputs:

- Timeline
- Customer impact
- Suspected root cause
- Contributing factors
- Detection gaps
- Follow-up actions
- Confidence and limitations

### Phase 4: Add Audit and Risk Agents

Goal: teach engineers to inspect system risk and missing safeguards.

Agents:

- Recursive Audit Agent
- Regression Risk Agent
- Security Review Agent
- Test Gap Analysis Agent

Work items:

- Add code/module inventory metadata.
- Add risk scoring conventions.
- Add findings severity: info, low, medium, high, critical.
- Add owner/team recommendation.
- Add suppression/accepted-risk workflow.

### Phase 5: Add Orchestration and Subagents

Goal: model agentic workflows without introducing external LLM dependencies.

Work items:

- Add `parentRunId` to `AgentRun`.
- Add child run ordering and dependency metadata.
- Add orchestration policies.
- Add cancellation and retry.
- Add run graph UI.
- Add approval gates between subagent phases.

Example orchestration:

1. Log Anomaly Detection Agent identifies production auth error burst.
2. Root Cause Analysis Agent gathers linked tickets, jobs, and audit events.
3. Failed Job Investigation Agent inspects related SLA notification failure.
4. Postmortem Agent drafts timeline and follow-up tasks.
5. Human reviewer approves customer-facing summary.

### Phase 6: Optional LLM Adapter Boundary

Goal: prepare for a future real LLM without adding one now.

Work items:

- Keep deterministic agents as baseline adapters.
- Define an `AgentAdapter` interface separate from `AgentDefinition`.
- Persist adapter type and version.
- Add cost, token, and latency fields only when a real adapter exists.
- Keep all LLM calls behind explicit configuration and tests.
- Preserve deterministic fixtures as safety rails.

## Recommended Next Engineering Sprint

Sprint objective: improve correctness and trust without expanding product scope.

Suggested backlog:

1. Add incident transition enforcement.
2. Add server action integration tests for ticket create/update and agent run.
3. Add Zod schemas for agent outputs.
4. Add `agentVersion` to agent definitions and `AgentRun`.
5. Add request id propagation into audit metadata.
6. Add role/capability test matrix.
7. Add user-facing error states for invalid form submissions.
8. Add time-window filters to logs explorer.
9. Add dead-letter reason field.
10. Add dashboard widget for low-confidence agent runs.

## Staff-Level Review Questions

- Which invariants belong in the domain package versus database constraints?
- Which server actions can currently mutate too much at once?
- Which audit events would be insufficient during a real incident review?
- Which agent recommendations could be harmful if followed blindly?
- Which data should have retention policies before scale?
- Which pages reveal operational data to roles that should not see it?
- Which tests would fail first if a future refactor broke core workflows?

