# Trace Tables

## Trace 1: UI To Server Action To DB

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| form submit | `apps/web/app/tickets/new/page.tsx` | HTML form | UI | user fills fields | browser validation only |
| read form | `apps/web/lib/actions.ts:46-57` | `FormData` to object | action | trim strings, normalize tags | missing user-facing errors |
| validate | `packages/domain/src/tickets.ts:13-24` | Zod parsed object | domain | runtime contract | update path uses manual casts |
| compute | `apps/web/lib/actions.ts:59-74` | Prisma create input | action/domain | SLA from priority | foreign ids not scoped |
| persist | `apps/web/lib/actions.ts:75-77` | `Ticket` row | DB | insert | not transactional with audit |
| audit | `apps/web/lib/actions.ts:79-86` | `AuditEvent` row | observability | before/after metadata | audit write can fail |

## Trace 2: Auth/Permission

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| cookie | `apps/web/lib/auth.ts:5-9` | `activeUserId` | auth simulation | selects user | not real auth |
| role | `packages/shared/src/index.ts:1-2` | `UserRole` | shared | union type | Prisma enum drift |
| capability | `packages/domain/src/permissions.ts:14-30` | role to capabilities | domain | matrix lookup | coarse scope |
| enforcement | `apps/web/lib/actions.ts:93-95` | role + action | action | throws if unauthorized | no resource check |

## Trace 3: Agent Run

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| button | `apps/web/app/tickets/[id]/page.tsx:59-62` | ticket id | UI | form submit | role visibility not enforced here |
| load context | `apps/web/lib/actions.ts:333-340` | ticket/comments/logs/incident | action | Prisma include | may omit context |
| snapshot | `apps/web/lib/actions.ts:342-357` | JSON input | action | shape for agent | no Zod schema |
| create run | `apps/web/lib/actions.ts:263-272` | running run | DB | insert | no transaction with audit |
| execute | `packages/agents/src/ticket-summarization.ts:40-140` | output + trace | agent | heuristic scoring | keyword limitations |
| persist output | `apps/web/lib/actions.ts:289-305` | JSON output | DB | update run | no schema version |

## Trace 4: Error Trace For Invalid Ticket Transition

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| malicious form | `apps/web/lib/actions.ts:97-100` | `status` string | untrusted input | cast to status type | cast does not validate enum |
| transition assert | `packages/domain/src/tickets.ts:51-55` | from/to statuses | domain | throws error | user sees framework error |
| test | `tests/domain.test.ts:12-16` | invalid transition | tests | expects throw | no server-action test |

## Trace 5: Log Group

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| query params | `apps/web/app/logs/page.tsx:14-21` | strings | UI route | filter object | enum casts |
| db query | `apps/web/app/logs/page.tsx:23-35` | log rows | DB | include links | fixed cap |
| grouping | `apps/web/app/logs/page.tsx:37-60` | grouped records | UI | reduce by fingerprint | logic in page |
| agent run | `apps/web/lib/actions.ts:381-415` | selected logs | action/agent | score/analyze | selected window only |

## Trace 6: Job Retry

| Step | File/line | Value shape | Owner | Transformation | Risk |
| --- | --- | --- | --- | --- | --- |
| button | `apps/web/app/jobs/[id]/page.tsx:65-68` | job id | UI | form submit | double submit possible |
| load job | `apps/web/lib/actions.ts:423-424` | job row | DB | find unique | no ownership scope |
| domain check | `packages/domain/src/jobs.ts:14-16` | status/attempts | domain | boolean | simple policy |
| update | `apps/web/lib/actions.ts:429-437` | job row | DB | status retrying, attempts + 1 | no worker |
| audit | `apps/web/lib/actions.ts:439-446` | audit row | observability | before/after | no reason |
