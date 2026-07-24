# Extension Projects

## Recursive Audit Agent

Build an agent that inspects tickets, incidents, logs, jobs, and audit events together. It should identify missing links, stale statuses, missing owner assignments, and contradictory evidence.

## Incident Postmortem Generator

Use incident timeline, logs, jobs, tickets, comments, and audit events to generate a deterministic postmortem draft with impact, timeline, root cause hypothesis, contributing factors, and follow-up tasks.

## Agent Approval Workflow

Add an approval state before agent recommendations mutate production data. Model approvals with reviewer, status, decision notes, and approved action payload.

## Regression Risk Detector

Seed deploy records and test results. Build an agent that correlates incidents with recent deploys and highlights risky changes.

## Automatic Test Gap Analyzer

Add a module inventory and test coverage map. Create an agent that recommends missing tests for risky domain logic.

## Real-Time Log Streaming Simulation

Create a local log producer that writes structured logs every few seconds. Add a live dashboard panel and anomaly watch mode.

## Agent Orchestration Dashboard

Show parent/child runs, dependency order, approval gates, and run status. Add retry and cancellation controls.

## Multi-Tenant Support

Add tenant/account models and scope tickets, logs, incidents, jobs, and users. Practice data isolation and tenant-aware authorization.

## RBAC Hardening

Move from coarse capabilities to resource-specific policies. Add tests for each role and each mutation.

## Notification System

Implement mock notifications for status changes, SLA escalation, incident updates, and job failures. Store delivery attempts as background jobs.
