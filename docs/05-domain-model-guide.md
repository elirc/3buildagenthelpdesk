# Domain Model Guide

## Users and Roles

Users represent internal operators. Roles are:

- Admin
- Support Agent
- Engineering
- Manager
- Viewer

The active user is simulated with a local cookie. Capabilities live in `packages/domain/src/permissions.ts`.

## Tickets

Tickets represent customer issues. They include customer context, requester email, status, priority, category, team/user assignment, SLA due date, optional incident link, tags, comments, logs, jobs, and audit events.

Status transitions are controlled by `allowedTicketTransitions`.

## SLA Rules

SLA duration is priority based:

- Critical: 2 hours
- High: 8 hours
- Medium: 36 hours
- Low: 72 hours

`getSlaState` returns healthy, approaching, breached, or resolved.

## Incidents

Incidents represent service-impacting events. They include status, severity, affected service, owner, linked tickets, linked logs, linked jobs, and optional agent findings.

Statuses:

- Investigating
- Identified
- Monitoring
- Resolved

Severities:

- SEV1
- SEV2
- SEV3
- SEV4

## Logs

Logs are structured operational events. They include service, environment, level, request id, metadata, fingerprint, and optional ticket/incident links.

## Jobs

Jobs model background work. They include type, status, attempts, max attempts, payload, error message, timestamps, and optional ticket/incident links.

Retry eligibility lives in `packages/domain/src/jobs.ts`.

## Agent Runs

Agent runs persist deterministic analyses. They are linked by generic target type/id rather than direct foreign keys so future agents can target new entity types.

## Audit Events

Audit events provide operational history. They use a generic entity type/id model so any domain object can emit audit records.

## Relationships

- A ticket may link to one incident.
- An incident can have many tickets, logs, and jobs.
- Logs may link to a ticket and/or incident.
- Jobs may link to a ticket and/or incident.
- Agent runs target tickets, incidents, log groups, or jobs.
- Audit events target any entity by type/id.
