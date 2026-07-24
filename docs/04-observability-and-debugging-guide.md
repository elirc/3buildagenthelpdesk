# Observability and Debugging Guide

## Structured Logs

Structured logs are stored in `StructuredLog`. Each entry has service, environment, level, message, request id, optional ticket/incident links, metadata JSON, and a fingerprint.

Fingerprints group similar errors. `createLogFingerprint` normalizes ids and numbers before hashing.

## Audit Events

Audit events are generated for major actions:

- ticket created/updated/status changed/escalated
- incident created/updated
- job retried/dead-lettered
- agent run started/completed/failed

Audit events include actor, action, entity, before JSON, after JSON, metadata, and timestamp.

## Failed Jobs

Background jobs model queue-like work. Failed jobs include attempts, max attempts, payload, error message, and optional ticket/incident links. The job detail page is a debugging entry point.

## Incident Linkage

Tickets, logs, and jobs can all link to incidents. Incident detail pages provide a condensed view of customer impact, operational evidence, and agent results.

## Anomaly Detection

`scoreLogAnomaly` weights:

- log level
- environment
- repeated fingerprints
- fatal logs
- error bursts
- timeout language
- auth/permission language

The log anomaly agent wraps this score with likely root cause and next actions.

## Debugging Walkthrough

Scenario: several customers cannot log in.

1. Open `/tickets` and find critical/high access tickets.
2. Open the Acme ticket.
3. Confirm it is linked to the auth incident.
4. Read comments to see support and engineering handoff.
5. Open linked logs.
6. Filter `/logs` to `auth-service` and `production`.
7. Inspect repeated timeout fingerprint.
8. Run the anomaly agent.
9. Open `/incidents/[id]` and confirm linked tickets/logs/jobs.
10. Open failed SLA escalation job.
11. Run the failed job investigation agent.
12. Review `/audit` to see who escalated, retried, and ran agents.

## Debugging Habits to Practice

- Start from user impact.
- Move from ticket to incident to logs.
- Group repeated errors by fingerprint.
- Inspect failed jobs for hidden workflow failures.
- Check audit events for timeline reconstruction.
- Compare agent recommendations to raw evidence.
