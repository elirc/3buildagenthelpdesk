# Validation, Auth, and Permissions

## Validation Layers

| Layer | Example | What it protects |
| --- | --- | --- |
| HTML | required fields in forms, e.g. `apps/web/app/tickets/[id]/page.tsx:96-108` | user convenience |
| Zod | `packages/domain/src/tickets.ts:13-24` | runtime input shape |
| Domain invariant | `packages/domain/src/tickets.ts:34-55` | business transitions |
| Database | required fields and relations in `packages/db/prisma/schema.prisma:137-164` | durable constraints |
| Tests | `tests/domain.test.ts:11-55` | regression behavior |

## Authentication Simulation

The active user is read from a cookie at `apps/web/lib/auth.ts:5-9`. The user switcher writes that cookie at `apps/web/lib/actions.ts:31-39`. This is a development simulation, not production authentication.

## Authorization

Capability definitions live at `packages/domain/src/permissions.ts:3-12`. Role mapping is `packages/domain/src/permissions.ts:14-30`. Server actions call `requireCapability`, for example:

- create ticket: `apps/web/lib/actions.ts:42-44`
- update ticket: `apps/web/lib/actions.ts:93-95`
- retry job: `apps/web/lib/actions.ts:419-421`

## IDOR-Style Risks

IDOR means insecure direct object reference: a user supplies an id and the server mutates a resource they should not control.

Possible risks to investigate:

- `ticketId` is trusted after capability check in `apps/web/lib/actions.ts:97-100`.
- `assignedUserId`, `assignedTeamId`, and `incidentId` are accepted from form data at `apps/web/lib/actions.ts:53-55`.
- `jobId` is trusted after role check at `apps/web/lib/actions.ts:423-427`.

## What A Junior Might Miss

- Disabled buttons do not enforce authorization.
- HTML `required` does not replace Zod.
- Role capability is not the same as resource permission.

## What A Senior Checks

- Is every mutation protected server-side?
- Does the permission check include resource ownership or tenant scope?
- Does a failed authorization write logs or audit events?
- Are generic entity ids safe enough?
- Are sensitive read pages protected, not just writes?

## Drill

Design a policy: support agents can update only tickets assigned to their team unless they are managers. Where should that rule live?

Self-grade:

- Basic: adds an `if` in a page.
- Solid: adds a domain policy and server-action enforcement.
- Strong: adds tests, audit metadata, and a migration path for team ownership rules.
