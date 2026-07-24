# Production Improvement Implementation Plan

This document reviews the production audit, Claude's study guide in `docs/12-audit-change-study-guide.md`, and the response in `docs/13-claude-audit-response.md`. It turns the remaining gaps into a detailed implementation plan.

This is a planning document only. Do not treat any section below as already implemented. The examples are intentionally concrete so a junior software engineer can follow them while making the actual changes in later work.

## How To Use This Plan

Work through the changes in priority order. Each change includes:

- the outcome to create
- why the change matters
- likely files to edit
- step-by-step implementation notes
- example code or configuration
- tests to add
- a definition of done

Before starting any change:

1. Create a branch for only that change.
2. Read the listed files first.
3. Run the current checks so you know the baseline.
4. Make the smallest implementation that satisfies the definition of done.
5. Add tests before moving to the next change.

Suggested baseline commands:

```bash
npm run db:generate
npm run typecheck
npm run test
npm run lint
npm run build
```

If `DATABASE_URL` is not configured, database commands that need Postgres will fail. Start the local database with:

```bash
npm run db:start
```

Then copy `.env.example` to `.env` and confirm `DATABASE_URL` points at the local Postgres database.

## Priority Roadmap

| Priority | Change | Why It Comes Here |
| --- | --- | --- |
| P0 | Add CI quality gates | Prevents broken work from landing. |
| P0 | Commit Prisma migrations | Makes schema changes reviewable and deployable. |
| P0 | Add database-backed server-action tests | Proves the new production invariants actually work through Prisma. |
| P0 | Add a production auth provider seam | Turns the auth boundary into a real enterprise path. |
| P0 | Harden tenant isolation invariants | Reduces risk of cross-organization links. |
| P1 | Add update schemas and typed action results | Reduces unsafe form casts and raw thrown errors. |
| P1 | Add inline form error states | Makes expected failures recoverable for users. |
| P1 | Strengthen worker locking and retries | Makes background work safer under failure and concurrency. |
| P1 | Add security headers, CSRF notes, and rate limiting | Covers basic production web security posture. |
| P1 | Improve operational observability | Moves from correlated logs toward measurable operations. |
| P2 | Add retention policies and purge jobs | Prevents logs, audit rows, jobs, and agent runs from growing forever. |
| P2 | Add pagination to tickets and incidents | Completes the list-page scale story. |
| P2 | Tighten audit action contracts | Reduces drift between TypeScript and stored audit data. |
| P2 | Add agent governance and evaluation fixtures | Makes agent behavior safer as agents become more important. |
| P2 | Add operational runbooks and seed safety guards | Makes local/demo actions safer around real data. |

## Change 1: Add CI Quality Gates

### Outcome

Every pull request should automatically run install, Prisma client generation, typecheck, tests, lint, and build.

### Why This Matters

The audit and response both called out missing CI. Without CI, the team depends on each developer remembering to run the right commands locally. A production-bound project needs repeatable checks before code merges.

### Files To Add Or Edit

- `.github/workflows/ci.yml`
- `package.json`
- possibly `apps/web/package.json` if lint or build scripts need workspace-specific fixes

### Step-By-Step Implementation

1. Create the workflow directory:

```bash
mkdir -p .github/workflows
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .github\workflows
```

2. Create `.github/workflows/ci.yml`.

3. Use Node 20 or the current team-approved LTS version. The repo uses npm workspaces and has a `package-lock.json`, so use `npm ci`.

4. Run Prisma generate before typecheck and build. The app imports `@prisma/client`, so generated Prisma types must exist.

5. Add a PostgreSQL service only after tests need a real database. The first CI pass can run current non-database tests without a DB.

Example first CI workflow:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npm run db:generate

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
```

6. If `npm run lint` fails because the workspace lint setup is incomplete, fix the lint script rather than removing the CI step. For example, confirm `apps/web/package.json` has a lint command that works from the root.

7. After database-backed tests are added, extend CI with a Postgres service:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: agentdesk_test
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

Then set:

```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/agentdesk_test?schema=public
```

### Tests To Add

No new app tests are required for the first CI workflow. The workflow itself is the test. Open a pull request and verify every step is green.

### Definition Of Done

- A GitHub Actions workflow exists.
- The workflow runs on pull requests.
- The workflow uses `npm ci`.
- The workflow runs `db:generate`, `typecheck`, `test`, `lint`, and `build`.
- The README or a docs note tells contributors that CI is required before merge.

### Common Mistakes

- Do not use `npm install` in CI when a lockfile exists.
- Do not skip Prisma generation.
- Do not hide lint or build failures by adding `continue-on-error`.

## Change 2: Commit Prisma Migrations

### Outcome

The database schema should have committed migration files under `packages/db/prisma/migrations`.

### Why This Matters

`db:push` is fine for quick demos, but production teams need schema changes that are reviewable, repeatable, and deployable. Migrations are also how future engineers understand when and why database fields were added.

### Files To Add Or Edit

- `packages/db/prisma/migrations/**/migration.sql`
- `packages/db/prisma/schema.prisma`
- `README.md`
- optional: `docs/15-migration-runbook.md` later, but do not create that during this change unless assigned

### Step-By-Step Implementation

1. Make sure local Postgres is running:

```bash
npm run db:start
```

2. Confirm `.env` exists and contains:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentdesk?schema=public"
```

3. If the local database has disposable demo data, reset it before creating a clean baseline:

```bash
npm run db:migrate -- --name init
```

If Prisma reports drift because the database was created with `db:push`, use a fresh local database or reset the local schema. Do not reset any shared database.

4. Inspect the generated SQL. Look for:

- `Organization`
- `organizationId` columns
- indexes such as `organizationId, status`
- enums matching the Prisma schema
- required relations that match the intended model

5. Run:

```bash
npm run db:generate
npm run typecheck
npm run test
```

6. Update `README.md` so setup uses migrations:

```md
npm run db:migrate
npm run db:seed
```

Keep `db:push` documented only as a local prototype command, if at all.

### Example Migration Review Checklist

When reviewing `migration.sql`, answer:

- Does every new required column have a safe path for existing data?
- Are indexes added for common scoped reads?
- Are enum changes compatible with existing data?
- Are destructive operations clearly intentional?
- Is the migration small enough to review?

### Tests To Add

No unit test is required for the migration itself. The proof is:

```bash
npm run db:migrate
npm run db:seed
npm run typecheck
npm run test
```

After CI gets a Postgres service, add CI steps for:

```bash
npm run db:migrate
```

### Definition Of Done

- A migration directory exists.
- The migration is committed.
- A fresh database can be created from migrations.
- Seed data works after migration.
- README setup uses migrations instead of `db:push`.

### Common Mistakes

- Do not commit a migration generated from a dirty or experimental schema.
- Do not rely on `db:push` for shared environments.
- Do not reset a non-local database.

## Change 3: Add Database-Backed Server-Action Tests

### Outcome

Tests should prove that server actions enforce organization scope, related-record scope, audit writes, and expected failures against a real test database.

### Why This Matters

Current integration tests cover helper contracts. That is useful, but not enough. The biggest risks happen when real Prisma queries and server actions interact.

### Files To Add Or Edit

- `tests/server-actions.test.ts`
- `tests/test-db.ts`
- `vitest.config.ts`
- `apps/web/lib/actions.ts` if actions need small testability seams
- `package.json`

### Step-By-Step Implementation

1. Add a test database helper. It should create known organizations, users, teams, tickets, incidents, and jobs.

Example helper shape:

```ts
import { prisma } from "@agentdesk/db";

export async function resetTestDb() {
  await prisma.auditEvent.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.structuredLog.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.organization.deleteMany();
}

export async function createTestTenant() {
  const organization = await prisma.organization.create({
    data: { name: "Test Org", slug: `test-org-${Date.now()}` }
  });

  const team = await prisma.team.create({
    data: { organizationId: organization.id, name: "Support", slug: "support" }
  });

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: "Test Support",
      email: `support-${organization.id}@example.test`,
      role: "SUPPORT_AGENT",
      teamId: team.id
    }
  });

  return { organization, team, user };
}
```

2. Server actions currently call `requireCurrentUser()`, which reads cookies. For tests, add a narrow test seam rather than mocking many Next internals.

One option is to refactor the core logic into functions that accept a user:

```ts
export async function updateTicketForUser(user: CurrentUser, formData: FormData) {
  // existing updateTicketAction logic after requireActionUser
}

export async function updateTicketAction(formData: FormData) {
  const { user } = await requireActionUser("ticket.update", "ticket:update");
  return updateTicketForUser(user, formData);
}
```

Do this carefully. Keep the server action wrapper small and leave route behavior unchanged.

3. Write tests for cross-organization denial.

Example test:

```ts
it("prevents updating a ticket from another organization", async () => {
  const orgA = await createTestTenant();
  const orgB = await createTestTenant();

  const ticketInB = await prisma.ticket.create({
    data: {
      organizationId: orgB.organization.id,
      title: "Other org ticket",
      description: "Private issue",
      customerName: "Beta",
      requesterEmail: "beta@example.test",
      priority: "HIGH",
      category: "BUG",
      status: "NEW",
      slaDueAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  const form = new FormData();
  form.set("ticketId", ticketInB.id);
  form.set("title", "Changed");
  form.set("description", "Changed description");
  form.set("customerName", "Changed customer");
  form.set("requesterEmail", "changed@example.test");
  form.set("status", "TRIAGE");
  form.set("priority", "HIGH");
  form.set("category", "BUG");
  form.set("tags", "");

  await expect(updateTicketForUser(orgA.user, form)).rejects.toThrow(
    "Ticket was not found or is outside the active organization."
  );
});
```

4. Add tests that prove related records are scoped:

- org A ticket cannot be assigned to org B team
- org A ticket cannot be assigned to org B user
- org A ticket cannot link to org B incident

5. Add tests that prove audit writes happen:

```ts
const events = await prisma.auditEvent.findMany({
  where: { organizationId: orgA.organization.id, entityType: "Ticket", entityId: ticket.id }
});

expect(events).toHaveLength(1);
expect(events[0].action).toBe("ticket.status_changed");
expect(events[0].requestContextId).toBeTruthy();
```

6. Add tests for agent queue behavior:

- running a ticket agent creates an `AgentRun` with `PENDING`
- it creates a `BackgroundJob` with `AGENT_RUN`
- both rows share the same `requestContextId`

### Tests To Add

Minimum first batch:

- `updateTicketForUser` rejects cross-org ticket
- `updateTicketForUser` rejects cross-org assigned team
- `updateIncidentStatusForUser` rejects cross-org incident
- `retryJobForUser` rejects cross-org job
- successful ticket update writes audit event
- successful agent queue writes agent run and background job with shared request context

### Definition Of Done

- Tests use a real Postgres test database.
- Tests do not depend on seed data.
- Tests clean up after themselves.
- The test suite can run locally and in CI.
- Server-action core logic is testable without weakening production behavior.

### Common Mistakes

- Do not test only helper functions and call it server-action coverage.
- Do not use production or developer seed data in automated tests.
- Do not remove `requireCurrentUser()` from actual server action exports.

## Change 4: Add A Production Auth Provider Seam

### Outcome

The app should keep local demo auth for development but support a real production identity provider path, starting with an OIDC-shaped provider interface.

### Why This Matters

Doc 12 correctly says an auth boundary exists. Doc 13 clarified that the boundary is not production auth yet. This change turns the seam into a practical implementation path.

### Files To Add Or Edit

- `apps/web/lib/auth.ts`
- `apps/web/lib/auth-providers.ts`
- `apps/web/lib/auth-types.ts`
- `.env.example`
- `README.md`
- `packages/db/prisma/schema.prisma` if external identity fields are added
- `packages/db/src/seed.ts`

### Step-By-Step Implementation

1. Split auth types out of `auth.ts`.

Example:

```ts
export type AuthProviderName = "local-demo" | "oidc" | "disabled";

export type AuthenticatedIdentity = {
  provider: AuthProviderName;
  externalSubject: string;
  email: string;
  name?: string;
};
```

2. Add provider interface:

```ts
export type AuthProvider = {
  name: AuthProviderName;
  getIdentity(): Promise<AuthenticatedIdentity | null>;
};
```

3. Keep demo provider explicit:

```ts
export function createLocalDemoProvider(): AuthProvider {
  return {
    name: "local-demo",
    async getIdentity() {
      // Read activeUserId cookie and map to seeded user.
    }
  };
}
```

4. Add an OIDC placeholder provider. The first version can validate required configuration and return `null` until login/session handling is implemented.

Example:

```ts
export function assertOidcConfig() {
  const required = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing OIDC config: ${missing.join(", ")}`);
  }
}
```

5. Add fields for external identity mapping if needed:

```prisma
model User {
  id              String @id @default(cuid())
  organizationId  String
  externalSubject String?
  email           String @unique
  // ...

  @@unique([organizationId, externalSubject])
}
```

Use a migration for this.

6. Decide how org membership maps:

- Option A: user email domain maps to one organization.
- Option B: OIDC group claim maps to organization.
- Option C: user must already exist in the database.

For this project, start with Option C. It is safer and easier:

```ts
const user = await prisma.user.findUnique({
  where: { email: identity.email },
  include: { team: true, organization: true }
});
```

7. Update `.env.example`:

```env
AUTH_PROVIDER="local-demo"
ALLOW_DEMO_AUTH="true"

# For future production OIDC:
OIDC_ISSUER=""
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""
OIDC_REDIRECT_URI=""
```

8. Update settings UI to show `oidc` as a provider when configured.

### Tests To Add

- `isDemoAuthEnabled` is false in production unless explicitly enabled.
- OIDC config validation reports missing keys.
- email identity maps to a known user.
- unknown identity returns `null` or a safe error.
- local demo user switching is unavailable when provider is `oidc`.

### Definition Of Done

- `auth.ts` no longer directly owns every provider detail.
- Demo auth still works locally.
- Production mode does not fall back to seeded users.
- OIDC configuration has a documented path.
- Tests prove provider selection behavior.

### Common Mistakes

- Do not auto-create users from arbitrary identity claims in the first pass.
- Do not let `ALLOW_DEMO_AUTH=true` be the default for production docs.
- Do not scatter provider checks throughout pages.

## Change 5: Harden Tenant Isolation Invariants

### Outcome

Cross-organization relationships should be harder to create accidentally. The app should continue checking scope before mutation, and tests should prove those checks.

### Why This Matters

Current scoping is useful but mostly app-enforced. The database has `organizationId`, but foreign keys such as `assignedTeamId` do not prove the team belongs to the same organization as the ticket.

### Files To Add Or Edit

- `packages/db/prisma/schema.prisma`
- `apps/web/lib/actions.ts`
- `apps/web/lib/access.ts`
- `tests/server-actions.test.ts`
- migration files

### Step-By-Step Implementation

1. List every cross-record relationship that needs same-organization protection:

- `User.teamId`
- `Ticket.assignedTeamId`
- `Ticket.assignedUserId`
- `Ticket.incidentId`
- `StructuredLog.ticketId`
- `StructuredLog.incidentId`
- `BackgroundJob.relatedTicketId`
- `BackgroundJob.relatedIncidentId`
- `Incident.ownerId`
- `AgentRun.createdByUserId`
- `AuditEvent.actorUserId`

2. Keep app-level checks in server actions. These are still the clearest business-rule enforcement layer.

3. Add reusable related-record helpers.

Example:

```ts
export async function assertRelatedRecordInOrganization(params: {
  organizationId: string;
  entityName: string;
  id: string | null;
  load: (id: string, organizationId: string) => Promise<{ id: string } | null>;
}) {
  if (!params.id) return;
  const record = await params.load(params.id, params.organizationId);
  if (!record) {
    throw new ActionError(`${params.entityName} is outside the active organization.`);
  }
}
```

4. Replace duplicated helpers like `assertScopedTeam`, `assertScopedUser`, and `assertScopedIncident` with wrappers around the shared helper only if it makes the code clearer.

5. Consider database-level composite constraints. Prisma can model compound unique fields, but cross-table same-organization foreign keys may require careful schema design. A common approach is to add compound unique constraints:

```prisma
model Team {
  id             String
  organizationId String

  @@unique([id, organizationId])
}
```

Then a related table can use both fields when Prisma supports the relation shape you need. Do this only after testing the generated migration locally. If it creates too much complexity, prefer app checks plus database-backed tests.

6. Add a test for every cross-org relationship in a server action:

- assigning a ticket to another org's team fails
- assigning a ticket to another org's user fails
- linking a ticket to another org's incident fails
- creating an incident with another org's owner fails

### Example Test Case

```ts
it("does not allow a ticket to link to another organization's incident", async () => {
  const orgA = await createTestTenant();
  const orgB = await createTestTenant();
  const ticket = await createTicketInOrg(orgA.organization.id);
  const incident = await createIncidentInOrg(orgB.organization.id);

  const form = validTicketUpdateForm(ticket);
  form.set("incidentId", incident.id);

  await expect(updateTicketForUser(orgA.user, form)).rejects.toThrow(
    "Selected incident is outside the active organization."
  );
});
```

### Definition Of Done

- Every mutable related ID is checked server-side.
- Every cross-org related ID has a failing test.
- Any database-level constraints are covered by migrations.
- Error messages do not reveal whether the other organization's record exists.

### Common Mistakes

- Do not rely on dropdown options alone.
- Do not check only the parent record and forget related submitted IDs.
- Do not expose "record exists but belongs to another organization" in user-facing errors.

## Change 6: Add Update Schemas And Typed Action Results

### Outcome

Mutation inputs should use Zod schemas for both create and update paths, and expected action failures should return typed results where forms can recover.

### Why This Matters

`createTicketAction` uses a schema, but some update paths manually cast form values. Manual casts can let invalid enum values or malformed fields reach business logic.

### Files To Add Or Edit

- `packages/domain/src/tickets.ts`
- `packages/domain/src/incidents.ts`
- `packages/domain/src/jobs.ts`
- `apps/web/lib/actions.ts`
- `apps/web/lib/errors.ts`
- `tests/domain.test.ts`
- `tests/server-actions.test.ts`

### Step-By-Step Implementation

1. Add update schemas next to create schemas.

Example:

```ts
export const updateTicketSchema = z.object({
  ticketId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(10),
  customerName: z.string().min(1),
  requesterEmail: z.string().email(),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
  assignedTeamId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  incidentId: z.string().optional().nullable(),
  tags: z.array(z.string()).default([])
});
```

2. Parse form data with the schema:

```ts
const parsed = updateTicketSchema.parse({
  ticketId: stringValue(formData, "ticketId"),
  title: stringValue(formData, "title"),
  description: stringValue(formData, "description"),
  customerName: stringValue(formData, "customerName"),
  requesterEmail: stringValue(formData, "requesterEmail"),
  status: stringValue(formData, "status"),
  priority: stringValue(formData, "priority"),
  category: stringValue(formData, "category"),
  assignedTeamId: optionalStringValue(formData, "assignedTeamId"),
  assignedUserId: optionalStringValue(formData, "assignedUserId"),
  incidentId: optionalStringValue(formData, "incidentId"),
  tags: normalizeTags(stringValue(formData, "tags"))
});
```

3. Add a typed action result:

```ts
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
```

4. Add a helper to convert Zod errors:

```ts
export function zodErrorToActionResult(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
}
```

5. Keep redirecting server actions for successful creates if that is the app pattern. Use typed results first for update forms, where staying on the page matters most.

6. Convert expected errors to `ActionError` or `ActionResult`. Leave unexpected bugs as thrown errors so they still reach error boundaries and logs.

### Tests To Add

- invalid update status fails schema parsing
- invalid email fails schema parsing
- valid update input parses correctly
- Zod error conversion returns field errors
- permission failure returns or throws a safe expected error

### Definition Of Done

- Ticket update uses a schema.
- Incident status update uses a schema.
- Job retry/dead-letter actions validate IDs.
- Expected validation failures are representable as typed action results.
- Domain tests cover update schemas.

### Common Mistakes

- Do not cast `as never` to quiet TypeScript when a schema can validate the value.
- Do not return stack traces in action results.
- Do not convert unexpected programmer bugs into friendly success-looking results.

## Change 7: Add Inline Form Error States

### Outcome

Users should see recoverable validation and permission errors near the form instead of falling into a generic error page for expected failures.

### Why This Matters

The audit called out raw errors. The current app has a first-pass error boundary, but production operators need to correct form mistakes without losing context.

### Files To Add Or Edit

- `apps/web/app/tickets/[id]/page.tsx`
- `apps/web/app/tickets/new/page.tsx`
- `apps/web/app/incidents/[id]/page.tsx`
- `apps/web/app/incidents/new/page.tsx`
- `apps/web/lib/actions.ts`
- `apps/web/lib/errors.ts`
- `packages/ui/src/index.tsx`
- `packages/ui/src/styles.css`

### Step-By-Step Implementation

1. Add UI primitives for field errors.

Example:

```tsx
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="field-error">{children}</p>;
}
```

CSS example:

```css
.field-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin: 4px 0 0;
}
```

2. Convert update forms to client components only if necessary. Next server actions can work with `useActionState`, but that requires a small client wrapper around the form.

Example structure:

```tsx
// apps/web/app/tickets/[id]/TicketEditForm.tsx
"use client";

import { useActionState } from "react";

export function TicketEditForm({ ticket, teams, users, incidents }) {
  const [state, action, pending] = useActionState(updateTicketAction, { ok: true });

  return (
    <form action={action}>
      {state.ok === false ? <div className="form-error">{state.message}</div> : null}
      {/* fields */}
      <button disabled={pending}>Save Changes</button>
    </form>
  );
}
```

3. Adjust action signature for forms using `useActionState`:

```ts
export async function updateTicketAction(previousState: ActionResult, formData: FormData): Promise<ActionResult> {
  // parse, validate, mutate
  return { ok: true, message: "Ticket updated." };
}
```

If you do this, update every form that calls that action. Do not break existing server action forms accidentally.

4. Start with one form, probably ticket update, and make the pattern solid before applying it everywhere.

5. Preserve audit writes and revalidation on success:

```ts
revalidatePath(`/tickets/${ticketId}`);
revalidatePath("/tickets");
return { ok: true, message: "Ticket updated." };
```

6. For create forms that redirect, decide whether to keep redirect-on-success. A common pattern:

- validation failure stays on page
- success redirects to the created record

### Tests To Add

- action returns field errors for invalid input
- action does not mutate when validation fails
- action does not audit failed validation as a business update
- successful action still writes audit and revalidates paths

### Definition Of Done

- Expected validation errors render inline.
- Permission or scope failures show safe messages.
- Successful updates still revalidate pages.
- No form loses user-entered data on a validation failure where preservation is feasible.

### Common Mistakes

- Do not turn every page into a client component.
- Do not remove server-side validation just because the UI validates.
- Do not show raw Zod messages if they are confusing or too technical.

## Change 8: Strengthen Worker Locking, Attempts, And Recovery

### Outcome

The database-backed worker should be safe enough for multiple workers and common failure cases.

### Why This Matters

The current worker is a useful learning step, but it needs leases, attempt accounting, retry scheduling, and stuck-job recovery before production-style use.

### Files To Add Or Edit

- `packages/db/prisma/schema.prisma`
- `packages/db/src/worker.ts`
- `packages/domain/src/jobs.ts`
- `tests/worker.test.ts`
- migration files

### Step-By-Step Implementation

1. Add fields to `BackgroundJob`:

```prisma
model BackgroundJob {
  id             String   @id @default(cuid())
  status         JobStatus
  attempts       Int      @default(0)
  maxAttempts    Int      @default(3)
  lockedAt       DateTime?
  lockedBy       String?
  lockExpiresAt  DateTime?
  runAfter       DateTime?
  lastHeartbeatAt DateTime?
  // existing fields

  @@index([status, runAfter])
  @@index([lockExpiresAt])
}
```

2. Update job claiming so a worker only claims jobs that are ready:

- status is `QUEUED` or `RETRYING`
- `runAfter` is null or in the past
- no active unexpired lock

3. Use a transaction for claim. Prisma `updateMany` is already used, but add `lockExpiresAt` to the condition.

Example:

```ts
const now = new Date();
const lockExpiresAt = new Date(now.getTime() + 60_000);

const claimed = await prisma.backgroundJob.updateMany({
  where: {
    id: candidate.id,
    status: { in: ["QUEUED", "RETRYING"] },
    OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }]
  },
  data: {
    status: "RUNNING",
    lockedAt: now,
    lockedBy: workerId,
    lockExpiresAt,
    lastHeartbeatAt: now,
    startedAt: now,
    attempts: { increment: 1 }
  }
});
```

4. Fix failure status logic. If attempts are incremented on claim, compare the updated attempt count to `maxAttempts`.

Example:

```ts
const exhausted = job.attempts >= job.maxAttempts;
const nextStatus = exhausted ? "DEAD_LETTERED" : "RETRYING";
```

5. Add exponential backoff:

```ts
function nextRunAfter(attempts: number): Date {
  const delaySeconds = Math.min(60 * 15, 2 ** attempts * 10);
  return new Date(Date.now() + delaySeconds * 1000);
}
```

6. Add a recovery function for stale running jobs:

```ts
export async function recoverExpiredJobs(now = new Date()) {
  return prisma.backgroundJob.updateMany({
    where: {
      status: "RUNNING",
      lockExpiresAt: { lt: now }
    },
    data: {
      status: "RETRYING",
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null
    }
  });
}
```

7. Run recovery at worker startup and periodically in the loop.

8. Write audit events when jobs are retried due to stale locks.

### Tests To Add

- two workers cannot claim the same job
- attempts increments when a job starts
- failed job becomes `RETRYING` until max attempts
- exhausted job becomes `DEAD_LETTERED`
- expired running job is recovered
- non-expired running job is not recovered

### Definition Of Done

- Worker has lock expiration.
- Attempts are counted consistently.
- Failed jobs retry with backoff.
- Dead-lettering happens only after attempts are exhausted.
- Stale jobs can be recovered.
- Worker behavior has tests.

### Common Mistakes

- Do not increment attempts both on claim and failure.
- Do not leave failed jobs in `FAILED` forever if the worker is supposed to retry them.
- Do not retry non-retryable errors without an explicit decision.

## Change 9: Add Security Headers, CSRF Notes, And Rate Limiting

### Outcome

The web app should have baseline security headers, documented CSRF posture, and simple server-side rate limiting for mutation-heavy actions.

### Why This Matters

The audit called out missing security headers and rate limits. Internal tools still hold sensitive operational data and need web security basics.

### Files To Add Or Edit

- `apps/web/next.config.mjs`
- `apps/web/middleware.ts`
- `apps/web/lib/rate-limit.ts`
- `apps/web/lib/actions.ts`
- `README.md`
- `docs/security-posture.md` or similar future doc

### Step-By-Step Implementation

1. Add security headers in Next config.

Example:

```js
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
```

2. Add a Content Security Policy later, after checking all inline styles/scripts. Start in report-only mode if needed.

3. Document CSRF posture for server actions:

- cookies use `sameSite: "lax"`
- server actions must authenticate server-side
- state-changing actions must not rely on hidden fields alone
- future production auth should use framework/session CSRF protections where applicable

4. Add a simple rate limiter. For a learning app, an in-memory limiter can be a first step, but document that production needs Redis or another shared store.

Example first-pass helper:

```ts
const buckets = new Map<string, { count: number; resetAt: number }>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    throw new ActionError("Too many attempts. Please wait and try again.");
  }
  bucket.count += 1;
}
```

5. Apply rate limits to expensive or mutation-heavy actions:

- agent run actions
- job retry
- ticket create
- incident create

Example:

```ts
assertRateLimit(`agent:${user.organizationId}:${user.id}`, 10, 60_000);
```

6. Add a TODO or later task to replace in-memory rate limiting with a shared store before multi-instance deployment.

### Tests To Add

- security headers appear in Next config output if easily testable
- rate limiter allows requests under the threshold
- rate limiter blocks requests over the threshold
- rate limiter resets after the window

### Definition Of Done

- Baseline headers are configured.
- CSRF posture is documented.
- Expensive actions have server-side rate limits.
- Tests cover the rate limiter.
- Docs clearly say in-memory rate limiting is not enough for multi-instance production.

### Common Mistakes

- Do not depend on UI disabled buttons for security.
- Do not add a strict CSP without testing the app.
- Do not treat an in-memory limiter as production-ready for multiple server instances.

## Change 10: Improve Operational Observability

### Outcome

The app should move from correlated console logs to clearer operational events, metrics points, and alert-ready signals.

### Why This Matters

`requestContextId` is good. Operators also need counts, durations, failure rates, and alert thresholds.

### Files To Add Or Edit

- `packages/observability/src/index.ts`
- `apps/web/lib/request-context.ts`
- `apps/web/lib/audit.ts`
- `packages/db/src/worker.ts`
- `docs/04-observability-and-debugging-guide.md`
- new tests in `tests/observability.test.ts`

### Step-By-Step Implementation

1. Define an operational event shape.

Example:

```ts
export type OperationalEvent = {
  event: string;
  requestContextId?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  durationMs?: number;
  outcome?: "started" | "succeeded" | "failed";
  errorCode?: string;
};
```

2. Update `logOperationalEvent` to accept that type and still allow extra metadata if needed.

3. Add timing around server actions:

```ts
const startedAt = Date.now();
try {
  // mutation
  logOperationalEvent({ event: "ticket.update", outcome: "succeeded", durationMs: Date.now() - startedAt });
} catch (error) {
  logOperationalEvent({ event: "ticket.update", outcome: "failed", durationMs: Date.now() - startedAt });
  throw error;
}
```

4. Add worker duration logs:

- job claim latency
- job execution duration
- agent execution duration
- retry/dead-letter outcome

5. Define metric names even if they are only logged at first:

- `ticket.created.count`
- `ticket.updated.count`
- `incident.active.count`
- `job.failed.count`
- `job.dead_lettered.count`
- `agent.run.failed.count`
- `agent.run.low_confidence.count`
- `sla.breached.count`

6. Document alert thresholds:

- active SEV1 incident exists for more than 15 minutes
- dead-letter jobs increase by 5 in 10 minutes
- agent failure rate greater than 20 percent in 15 minutes
- production fatal logs greater than 0 in 5 minutes

7. Keep sensitive data out of logs. Use redaction helpers for any metadata.

### Tests To Add

- operational event logger includes timestamp
- redaction is applied before logging sensitive metadata
- action timing helper records duration on success
- action timing helper records duration on failure

### Definition Of Done

- Operational event shape is typed.
- Server actions and worker logs include durations and outcomes.
- Metrics names are documented.
- Alert thresholds are documented.
- Sensitive metadata is not logged raw.

### Common Mistakes

- Do not log full form data.
- Do not log tokens, cookies, passwords, or authorization headers.
- Do not create metric names that change dynamically per entity ID.

## Change 11: Add Retention Policies And Purge Jobs

### Outcome

Logs, audit events, jobs, and agent runs should have retention decisions and a safe purge or archive mechanism.

### Why This Matters

Operational data grows quickly. Without retention, tables become slow and storage grows without a plan. Audit data may need longer retention than logs.

### Files To Add Or Edit

- `packages/db/prisma/schema.prisma`
- `packages/db/src/worker.ts`
- `packages/db/src/retention.ts`
- `package.json`
- `README.md`
- tests in `tests/retention.test.ts`

### Step-By-Step Implementation

1. Decide retention windows:

- structured logs: 30 or 90 days
- background jobs: 30 days after terminal state
- agent runs: 90 days
- audit events: 1 year or more, depending on compliance needs

2. Add documentation before deleting anything. A junior engineer should not guess retention rules.

3. Add helper functions:

```ts
export function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
```

4. Add purge functions:

```ts
export async function purgeOldStructuredLogs(retainDays: number) {
  return prisma.structuredLog.deleteMany({
    where: { timestamp: { lt: daysAgo(retainDays) } }
  });
}
```

5. For audit events, prefer archive-before-delete or do not delete in the first pass. If deleting audit rows, require an explicit environment variable:

```ts
if (process.env.ALLOW_AUDIT_PURGE !== "true") {
  throw new Error("Audit purge is disabled.");
}
```

6. Add a command:

```json
"retention:run": "tsx packages/db/src/retention.ts"
```

7. Add dry-run mode:

```bash
npm run retention:run -- --dry-run
```

Dry-run should print counts but not delete.

### Tests To Add

- `daysAgo` calculates expected cutoff
- dry-run does not delete records
- purge deletes only records older than cutoff
- audit purge refuses to run unless explicitly enabled
- terminal job purge does not delete running jobs

### Definition Of Done

- Retention windows are documented.
- Purge functions exist with tests.
- Dry-run mode exists.
- Audit deletion is protected.
- No running or pending operational work is purged.

### Common Mistakes

- Do not use retention to hide bugs.
- Do not delete audit events casually.
- Do not purge based only on `createdAt` when a job may still be running.

## Change 12: Add Pagination To Tickets And Incidents

### Outcome

Ticket and incident list pages should use bounded database pagination like logs, jobs, agents, and audit.

### Why This Matters

Doc 13 called out that pagination is partial. Tickets and incidents will grow in real use.

### Files To Add Or Edit

- `apps/web/app/tickets/page.tsx`
- `apps/web/app/incidents/page.tsx`
- `apps/web/lib/pagination.ts`
- `tests/integration.test.ts`

### Step-By-Step Implementation

1. Update page search params:

```ts
searchParams: {
  status?: string;
  priority?: string;
  q?: string;
  page?: string;
  pageSize?: string;
}
```

2. Parse pagination:

```ts
const pagination = parsePagination(searchParams);
```

3. Extract the `where` object so both `findMany` and `count` use the same filters:

```ts
const where = {
  organizationId: currentUser.organizationId,
  status: searchParams.status ? (searchParams.status as never) : undefined,
  priority: searchParams.priority ? (searchParams.priority as never) : undefined,
  OR: searchParams.q ? [...] : undefined
};
```

4. Query rows and count together:

```ts
const [tickets, totalTickets] = await Promise.all([
  prisma.ticket.findMany({
    where,
    include: { assignedUser: true, assignedTeam: true, incident: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  }),
  prisma.ticket.count({ where })
]);
```

5. Add Previous and Next buttons using `pageHref`.

Example:

```tsx
<div className="actions" style={{ marginTop: 12 }}>
  <span className="muted">
    Page {pagination.page} of {Math.max(1, Math.ceil(totalTickets / pagination.pageSize))}
  </span>
  <Button href={pageHref("/tickets", searchParams, pagination.page - 1)} disabled={pagination.page <= 1}>
    Previous
  </Button>
  <Button
    href={pageHref("/tickets", searchParams, pagination.page + 1)}
    disabled={pagination.page * pagination.pageSize >= totalTickets}
  >
    Next
  </Button>
</div>
```

6. Repeat for incidents.

7. Consider adding a page size control later. The existing parser already supports `pageSize`.

### Tests To Add

- `pageHref` preserves ticket filters
- ticket page query uses `skip` and `take`
- incident page query uses `skip` and `take`
- invalid page/page size clamps to safe values

### Definition Of Done

- Tickets list is paginated.
- Incidents list is paginated.
- Filters are preserved when moving pages.
- Page size is bounded.
- Tests cover link preservation.

### Common Mistakes

- Do not count with different filters than the row query.
- Do not fetch all rows and slice in JavaScript.
- Do not drop search filters from pagination links.

## Change 13: Tighten Audit Action Contracts

### Outcome

Audit action names should be harder to mistype and easier to compare across TypeScript and stored data.

### Why This Matters

`AuditEvent.action` is currently a string in the database while TypeScript has an `AuditAction` union. That can drift over time.

### Files To Add Or Edit

- `packages/observability/src/index.ts`
- `packages/shared/src/index.ts`
- `packages/db/prisma/schema.prisma`
- `apps/web/lib/audit.ts`
- `packages/db/src/worker.ts`
- tests in `tests/audit-contract.test.ts`

### Step-By-Step Implementation

1. Centralize audit actions as a constant array:

```ts
export const AUDIT_ACTIONS = [
  "ticket.created",
  "ticket.updated",
  "ticket.status_changed",
  "ticket.assigned",
  "ticket.escalated",
  "incident.created",
  "incident.updated",
  "job.retried",
  "job.dead_lettered",
  "job.worker_started",
  "job.worker_completed",
  "job.worker_failed",
  "agent.run_queued",
  "agent.run_started",
  "agent.run_completed",
  "agent.run_failed",
  "security.access_denied"
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
```

2. Use that type everywhere instead of duplicating string unions.

3. Add runtime validation in `writeAuditEvent`:

```ts
export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
```

4. Decide whether to add a Prisma enum. A Prisma enum makes invalid database values harder, but changing existing string data requires migration care.

Example:

```prisma
enum AuditAction {
  ticket_created
  ticket_updated
}
```

Prisma enum names cannot contain dots, so this may be awkward. If the dot-based action strings are useful, keep the DB field as string and enforce with tests/runtime validation.

5. Add tests that ensure all code paths use known action names.

### Tests To Add

- `AUDIT_ACTIONS` contains every action used by app code
- `writeAuditEvent` rejects unknown actions if runtime validation is added
- worker audit action names are in the shared list

### Definition Of Done

- Audit actions are defined in one place.
- App and worker imports use that central definition.
- Unknown audit actions cannot be written silently.
- Tests protect the contract.

### Common Mistakes

- Do not define one list in `shared` and another in `observability`.
- Do not convert dot names to enum names without a clear mapping.
- Do not make audit validation so strict that old data cannot be read.

## Change 14: Add Agent Governance And Evaluation Fixtures

### Outcome

Agent behavior should be versioned, testable with fixtures, and safe for future recommendations that might affect business workflows.

### Why This Matters

The agents are deterministic today, which is good. As agents become more powerful, the app needs governance: versioning, evaluation fixtures, confidence expectations, and human approval for high-risk recommendations.

### Files To Add Or Edit

- `packages/agents/src/registry.ts`
- `packages/agents/src/types.ts`
- `packages/agents/src/*.ts`
- `tests/agents.test.ts`
- `tests/fixtures/agents/*.json`
- `packages/db/prisma/schema.prisma` for recommendation review records later

### Step-By-Step Implementation

1. Confirm every agent definition includes a stable version:

```ts
export type AgentDefinition = {
  type: AgentType;
  name: string;
  version: string;
  run: AgentRunner;
};
```

2. Store agent version on every `AgentRun`. The schema already has `agentVersion`, so make tests prove it is set by the worker.

3. Add fixture files.

Example fixture:

```json
{
  "name": "critical-sso-ticket",
  "agentType": "TICKET_SUMMARIZATION",
  "targetType": "TICKET",
  "targetId": "fixture-ticket-1",
  "input": {
    "title": "SSO login outage",
    "description": "Users cannot log in through SSO",
    "priority": "CRITICAL",
    "category": "ACCESS",
    "comments": [],
    "linkedIncident": null,
    "linkedLogs": []
  },
  "expectations": {
    "minConfidence": 60,
    "requiredFindingTerms": ["SSO", "login"]
  }
}
```

4. Add fixture runner tests:

```ts
it("meets ticket summarization fixture expectations", () => {
  const result = runRegisteredAgent(fixture.agentType, {
    targetType: fixture.targetType,
    targetId: fixture.targetId,
    input: fixture.input
  });

  expect(result.confidenceScore).toBeGreaterThanOrEqual(fixture.expectations.minConfidence);
  expect(result.findings.join(" ")).toContain("SSO");
});
```

5. Add output schemas with Zod:

```ts
export const agentOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()),
  recommendations: z.array(z.string()),
  limitations: z.array(z.string()),
  confidenceScore: z.number().min(0).max(100),
  trace: z.array(z.object({ step: z.string(), detail: z.string() }))
});
```

6. For future high-risk actions, add a recommendation review model instead of letting agents mutate business state directly.

Example future model:

```prisma
model AgentRecommendationReview {
  id          String @id @default(cuid())
  agentRunId  String
  status      String
  reviewerId  String?
  decision    String?
  createdAt   DateTime @default(now())
  decidedAt   DateTime?
}
```

### Tests To Add

- every agent has a version
- worker persists the agent version
- fixture expectations pass
- output schema validates every agent result
- low-confidence cases include limitations

### Definition Of Done

- Agent versions are tested.
- Fixture-based evaluations exist.
- Agent outputs are schema-validated.
- High-risk recommendation review is designed before agents mutate business data.

### Common Mistakes

- Do not make tests depend on exact full summary text if small wording changes are acceptable.
- Do not allow agents to silently mutate tickets, incidents, or jobs.
- Do not hide limitations when confidence is low.

## Change 15: Add Operational Runbooks And Seed Safety Guards

### Outcome

Developers should have clear runbooks for local setup, migrations, worker operation, retention, and seed data safety. Destructive seed behavior should be clearly local-only.

### Why This Matters

The audit called out data-loss risk from seed reset behavior. A learning repo can reset data easily, but production-bound habits should make destructive commands hard to run accidentally.

### Files To Add Or Edit

- `README.md`
- `packages/db/src/seed.ts`
- `docs/operations-runbook.md`
- `.env.example`
- `package.json`

### Step-By-Step Implementation

1. Add an environment guard to seed:

```ts
function assertSeedAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run seed in production.");
  }
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error("Set ALLOW_DESTRUCTIVE_SEED=true to reset and seed local data.");
  }
}
```

2. Call it at the start of `seed.ts` before any `deleteMany`.

3. Update `.env.example`:

```env
ALLOW_DESTRUCTIVE_SEED="true"
```

Add a comment that this is for local development only.

4. Create a runbook with sections:

- local setup
- database migration
- database seed
- worker operation
- common failure: missing `DATABASE_URL`
- common failure: Docker not running
- common failure: Prisma client out of date
- rollback posture: forward-fix migrations, not manual database edits

5. Add worker commands:

```bash
npm run worker:once
npm run worker
```

Explain when to use each.

6. Add "never run against production" warnings for seed and destructive retention commands.

### Tests To Add

- seed guard throws when `NODE_ENV=production`
- seed guard throws when destructive seed flag is missing
- seed guard allows local seed when flag is present

If `seed.ts` is hard to test, extract the guard into a small exported function.

### Definition Of Done

- Destructive seed reset is guarded.
- Local setup docs are current.
- Worker operation is documented.
- Migration workflow is documented.
- Common failures have fixes.

### Common Mistakes

- Do not bury destructive warnings at the bottom of docs.
- Do not make production seed possible by default.
- Do not document `db:push` as the normal shared-environment path.

## Change 16: Improve UI Enforcement And Disabled Actions

### Outcome

Disabled UI controls should be accessible and should not imply enforcement. Server checks remain the real enforcement.

### Why This Matters

The audit noted that disabled links are not enforcement. This is a product polish and security clarity issue.

### Files To Add Or Edit

- `packages/ui/src/index.tsx`
- `packages/ui/src/styles.css`
- pages using `Button href=... disabled`
- `apps/web/lib/actions.ts`

### Step-By-Step Implementation

1. Inspect the `Button` component. Determine how it renders:

- button with `type`
- anchor with `href`
- disabled anchor with `aria-disabled`

2. For disabled links, prefer rendering a `<span>` or a button without navigation instead of an anchor that can still navigate.

Example:

```tsx
if (href && disabled) {
  return (
    <span className={className} aria-disabled="true">
      {children}
    </span>
  );
}
```

3. Make sure keyboard behavior is correct. Disabled controls should not be focusable unless there is a clear accessibility reason.

4. Add tooltips or muted text only where users need explanation. Do not clutter every disabled button.

5. Confirm server actions still enforce permissions. UI disabled state is guidance only.

### Tests To Add

- disabled link button does not render an `href`
- enabled link button renders an anchor
- disabled submit button remains a button with disabled attribute
- server action still rejects unauthorized mutation

### Definition Of Done

- Disabled link buttons are not navigable.
- UI behavior is accessible.
- Server-side permission checks remain in place.
- Tests cover the UI primitive.

### Common Mistakes

- Do not remove server-side checks because the button is disabled.
- Do not render an anchor with `href` and assume `aria-disabled` prevents navigation.
- Do not hide actions without giving operators enough context.

## Suggested Implementation Sequence

Use this order if one engineer is doing the work:

1. CI quality gates.
2. Prisma migrations.
3. Database-backed server-action tests.
4. Tenant invariant hardening.
5. Update schemas and typed action results.
6. Inline form errors.
7. Production auth provider seam.
8. Worker locking and retries.
9. Security headers and rate limiting.
10. Operational observability.
11. Retention policies.
12. Tickets/incidents pagination.
13. Audit action contracts.
14. Agent governance fixtures.
15. Runbooks and seed safety.
16. UI disabled action cleanup.

The reason to start with CI and migrations is simple: they make every later change safer. The reason to add database-backed action tests early is that many later changes depend on proving scoping and mutation behavior.

## Suggested PR Breakdown

Keep pull requests small enough to review:

| PR | Contents |
| --- | --- |
| PR 1 | CI workflow only |
| PR 2 | Initial Prisma migration and README setup update |
| PR 3 | Test DB helper and first server-action tests |
| PR 4 | Tenant related-record tests and helper cleanup |
| PR 5 | Ticket/incident update schemas |
| PR 6 | Inline errors for ticket update form |
| PR 7 | Auth provider interface and OIDC config validation |
| PR 8 | Worker leases, attempts, and recovery |
| PR 9 | Security headers and rate limiter |
| PR 10 | Observability event typing and duration logs |
| PR 11 | Retention dry-run and purge commands |
| PR 12 | Ticket and incident pagination |
| PR 13 | Audit action constant contract |
| PR 14 | Agent fixture evaluations |
| PR 15 | Operations runbook and seed guard |
| PR 16 | Disabled link/button cleanup |

## Final Acceptance Checklist

After all planned changes are complete, the project should satisfy this checklist:

- CI blocks broken typecheck, tests, lint, and build.
- A fresh database can be built from committed migrations.
- Server-action tests prove cross-organization denials.
- Related IDs cannot be used to connect records across organizations through app actions.
- Demo auth is local-only, and production auth has a documented provider path.
- Update inputs are schema-validated.
- Expected form errors are shown inline.
- Worker jobs have leases, retries, attempt accounting, and stale-job recovery.
- Security headers are configured.
- Mutation-heavy paths have rate limits.
- Operational events include request context, outcome, and duration.
- Retention rules are documented and tested.
- Tickets and incidents have bounded pagination.
- Audit action names come from one contract.
- Agent behavior is versioned and fixture-tested.
- Destructive seed/reset behavior is guarded.
- Disabled UI actions are accessible and non-navigable.

## Closing Note

The audit and response both point to the same theme: the project has the right shape, but many guarantees are still early. The work above turns those early seams into enforceable, tested, and operable production habits.
