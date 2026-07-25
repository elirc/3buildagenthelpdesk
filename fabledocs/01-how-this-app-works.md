# How This App Works

A guided tour of the Agentic Help Desk codebase for an engineer who has never seen it before. Read this top to bottom once. It should take about 45 minutes. After that, use it as a lookup table.

---

## 1. What the product is

It is an **internal operations console** for a software company. Five things live in one app, and the point of the app is that they are wired to each other:

| Surface | Route | What lives there |
| --- | --- | --- |
| Tickets | `/tickets` | Customer-reported problems, with status, priority, SLA clock, owner, comments |
| Incidents | `/incidents` | Service-impacting events with severity, an owner, and a status lifecycle |
| Logs | `/logs` | Structured application log entries, grouped by "fingerprint" |
| Jobs | `/jobs` | Background job queue: retries, failures, dead-letter review |
| Agent runs | `/agents` | Persisted output from automated analysis routines |
| Audit | `/audit` | Append-only history of who did what |

The interesting part is the **linking**. A ticket can point at an incident. Logs can point at both. A failed job can point at both. So when a customer says "I can't log in", a support agent can open the ticket, see the SEV2 incident it belongs to, see the seven `auth-service` error logs that share a fingerprint, and see that the escalation notification job failed — all without leaving the ticket page.

The "agentic" part is deliberately unglamorous. There are three **deterministic** analysis routines — no LLM, no API key, no network call. They are pure functions that read a snapshot of data and emit a summary, findings, recommendations, a confidence number, and a step-by-step trace. They exist so the app can model the *lifecycle* of an AI feature (queue it, run it, version it, store its input, show its reasoning, audit it) without the nondeterminism of a real model. Treat them as a placeholder that has the right shape.

**A useful mental model:** it is a small Zendesk and a small PagerDuty and a small Sentry, sharing one database, with a fake Copilot bolted on.

---

## 2. The shape of the repository

npm workspaces monorepo. One app, six packages.

```
apps/web            Next.js App Router application — every page, every server action
packages/shared     Enums, string labels, tiny utilities. Depends on nothing.
packages/domain     Business rules: validation, state machines, SLA math, permissions.
packages/observability  Log anomaly scoring, metadata redaction, audit action union.
packages/agents     The three deterministic agents + the registry that dispatches to them.
packages/db         Prisma schema, the Prisma client singleton, the seed script, the worker.
packages/ui         ~14 presentational React components + one CSS file. No app logic.
tests/              Vitest suites. Pure-logic only, no database.
docs/               Pre-existing curriculum and sprint material.
fabledocs/          These documents.
```

### The dependency rule

Packages depend **downward** only:

```
shared  ←  domain  ←  observability  ←  agents  ←  db  ←  apps/web
   ↑                                                        │
   └──────────────────  ui  ────────────────────────────────┘
```

Read that as: `shared` knows nothing about anyone. `domain` may import `shared`. `agents` may import `domain`, `observability`, `shared`. `apps/web` may import everything. `ui` imports only `shared` and never touches Prisma.

**This rule is the single most important convention in the repo.** If you put a Prisma query inside `packages/domain`, or an SLA calculation inside a page component, you have broken the design even if it compiles. Check `packages/*/package.json` — the dependency lists are the enforcement mechanism, such as it is.

### Why the packages exist at all

A junior reasonably asks why a single Next.js app was split into six packages. Two reasons:

1. **Testability.** `packages/domain` and `packages/agents` are pure TypeScript with no database and no React. `tests/` can import them directly and run in milliseconds. See `vitest.config.ts` — it aliases the package names straight at the source files and never loads Prisma or Next.
2. **Forced honesty about layering.** In a single `src/` folder, a page can quietly reach into anything. Here, importing `@agentdesk/db` from `packages/domain` would be an obvious, visible mistake in a package manifest.

Note that `packages/ui/package.json` exports `./src/index.tsx` directly — these are *source* packages, not built packages. `apps/web/next.config.mjs` lists them all in `transpilePackages`, which is what makes that work. There is no build step for the packages, which is why `npm run typecheck` at the root (a single `tsc --noEmit` over the whole workspace, using the `paths` in `tsconfig.json`) is the real type gate.

---

## 3. The data model

All of it is in `packages/db/prisma/schema.prisma`. PostgreSQL. Ten models.

```
Organization ──┬── User ──── Team
               │
               ├── Ticket ────── TicketComment
               │     │
               │     ├──── Incident
               │     ├──── StructuredLog
               │     └──── BackgroundJob
               │
               ├── AgentRun
               └── AuditEvent
```

### Things to notice

**Everything hangs off `Organization`.** Every one of the nine other models carries an `organizationId`, and nearly every index starts with it. This is the multi-tenancy boundary. The seed creates two orgs (`agentdesk-internal` and `beta-enterprise`) specifically so you can catch leaks — if you write a query that forgets the org filter, the Beta Enterprise ticket shows up where it shouldn't.

**Tickets and incidents are separate concepts and that is intentional.** A ticket is *one customer's report*. An incident is *the underlying failure*. Many tickets, one incident. The `Ticket.incidentId` foreign key is nullable because most tickets are not part of an outage.

**`StructuredLog.fingerprint` is the clever bit.** It is a 12-character hash computed in `packages/domain/src/logs.ts:14` from the service, level, and a *normalized* message — numbers replaced with `<n>`, hex ids replaced with `<id>`. So `"Webhook delivery timed out after 10000ms"` and `"...after 9500ms"` collapse to the same fingerprint. That is how the log explorer groups thousands of near-identical errors into a handful of rows. This is exactly how Sentry-style grouping works.

**`AgentRun` stores its own input.** `inputSnapshot` is a frozen copy of what the agent was given, `output` is what it produced, `trace` is how it got there, and `agentVersion` records which version of the heuristic ran. That combination means a run stays explainable forever, even after the underlying ticket changes. Keep this property — several stories in document 02 depend on it.

**`AuditEvent` is append-only.** Nothing ever updates or deletes one. `before` and `after` are JSON snapshots of just the fields that changed. `requestContextId` ties together every event produced by a single user action, including events written later by the worker.

**Two schema details that will bite you:**
- `Ticket.tags` is a Postgres `String[]`, not a join table. Cheap to read, awkward to query or rename globally.
- `AuditEvent.action` is a plain `String` in the database, but TypeScript treats it as the union `AuditAction` in `packages/observability/src/index.ts:16`. The database will happily accept a typo. Add new action names to that union.

---

## 4. How a request actually flows

Every page in `apps/web/app/` is an async React Server Component that declares `export const dynamic = "force-dynamic"`. There is no caching and no client-side data fetching. The page runs on the server, queries Prisma directly, and returns HTML.

There is almost no client-side JavaScript in this app. `apps/web/app/error.tsx` is the only `"use client"` file. Every form is a plain HTML form posting to a server action. This is a deliberate constraint, and it is why every filter bar is a `<form method="get">` with an "Apply" button rather than an on-change handler.

### Reading path (e.g. `/tickets/abc123`)

`apps/web/app/tickets/[id]/page.tsx`

1. `requireCurrentUser()` — resolves the active user from a cookie.
2. One `Promise.all` fires six parallel queries: the ticket with its relations, plus teams, users, incidents (for the dropdowns), agent runs, and audit events.
3. Every query is filtered by `organizationId: currentUser.organizationId`. By hand. Every time.
4. `notFound()` if the ticket is missing *or belongs to another org* — the two cases are indistinguishable to the caller, which is correct: you should not be able to probe for the existence of another tenant's records.
5. Render with `packages/ui` components.

### Writing path (e.g. saving a ticket edit)

All mutations live in **one file**: `apps/web/lib/actions.ts` (~600 lines, 10 exported actions). It starts with `"use server"`, so every exported function becomes a POST endpoint that Next.js wires to the form.

Every action follows the same seven steps. `updateTicketAction` at `actions.ts:199` is the canonical example:

```
1. requireActionUser("ticket.update", "ticket:update")   → auth + capability + request context + start log
2. Read the row that is about to change, scoped by organizationId
3. assertCanAccessRecord(...)                            → throws if missing or cross-org
4. Validate: Zod schema, and/or a domain state-machine assert
5. prisma.<model>.update(...)
6. writeAuditEvent({ before, after, requestContextId })
7. revalidatePath(...) and sometimes redirect(...)
```

Learn those seven steps. **Every feature you add in document 02 is a variation on them.**

`requireActionUser` (`actions.ts:35`) is worth reading closely — it does four jobs in five lines: loads the user, checks the capability, mints a `requestContextId` (a UUID), and emits a JSON line to stdout announcing the action started.

Actions take `FormData`, not typed objects, because they are called directly from `<form action={...}>`. The helpers `stringValue` and `optionalStringValue` at the top of the file handle the trimming and empty-string-to-null conversion. There is no `useFormState`, no optimistic UI, and no field-level error display: a validation failure throws, and `error.tsx` catches it. That is a real limitation, not a subtlety you are missing.

---

## 5. Authentication, authorization, and tenancy

Three separate ideas. Keep them separate in your head — interviewers ask about this, and the code models it cleanly.

**Authentication — who are you?** `apps/web/lib/auth.ts`. There are no passwords. A cookie named `activeUserId` names the current user, and `/settings` lets you switch. The whole mechanism is behind `isDemoAuthEnabled()` (`auth.ts:12`), which is true when `AUTH_PROVIDER=local-demo`, or `ALLOW_DEMO_AUTH=true`, or nothing is configured and `NODE_ENV !== "production"`. In production with no config, `getCurrentUser()` returns `null` and `requireCurrentUser()` throws. That gate is the seam where a real identity provider would be dropped in.

One quirk worth knowing: with no cookie set, `auth.ts:34` falls back to the first user ordered by `role: "asc"`. Prisma sorts enums by *declaration order*, and `ADMIN` is declared first, so **a fresh browser session is an admin**. If you are testing permissions, switch users explicitly rather than trusting the default.

**Authorization — what may you do?** `packages/domain/src/permissions.ts`. A capability table maps each of the five roles to a list of strings like `"ticket:update"` or `"job:retry"`. `requireCapability(role, capability)` throws if the role lacks it. Actions declare their capability in the `requireActionUser` call. Note that `VIEWER` holds exactly one capability, `audit:view`.

Also note `canMutateTickets` / `canResolveTickets` in `packages/domain/src/tickets.ts:110` — an *older*, coarser mechanism that predates the capability table and is still used to disable buttons in the ticket detail page. Two overlapping permission systems is a wart. Prefer capabilities for anything new.

**Tenancy — which rows are yours?** `apps/web/lib/access.ts`. Enforced by adding `organizationId: currentUser.organizationId` to every query, plus `assertCanAccessRecord` after every fetch-before-write, plus the three `assertScoped*` helpers in `actions.ts:52-68` that verify a submitted team/user/incident id belongs to your org before you can point at it. That last one matters: without it, a user could edit the raw HTML of a `<select>` and assign their ticket to another tenant's team.

The critical property: **none of this is automatic.** There is no Prisma middleware, no row-level security. If you write a new query and forget the org filter, nothing stops you. Cross-tenant leakage is the highest-severity bug you can introduce in this codebase, and reviewers should look for it first.

---

## 6. The background worker

`packages/db/src/worker.ts`. Run it with `npm run worker` (loop) or `npm run worker:once` (single job).

It is a polling loop, not a real queue — no Redis, no BullMQ. `main()` calls `processNextBackgroundJob()`, sleeps 2 seconds if there was nothing to do, repeats.

**Claiming a job** (`worker.ts:40`) is the piece worth studying:

```ts
const candidate = await prisma.backgroundJob.findFirst({ where: { status: { in: ["QUEUED", "RETRYING"] } }, ... });
const claimed  = await prisma.backgroundJob.updateMany({ where: { id: candidate.id, status: { in: ["QUEUED", "RETRYING"] } }, data: { status: "RUNNING", lockedBy: workerId, ... } });
if (claimed.count !== 1) return null;
```

That is **optimistic concurrency control**. Two workers can both `findFirst` the same row, but the conditional `updateMany` only succeeds for whichever one gets there first, because the second one's `status` condition no longer matches. The loser sees `count === 0` and backs off. This is the standard pattern for claiming work without `SELECT ... FOR UPDATE`, and being able to explain it is genuinely useful in interviews.

**Two job paths:**
- `type === "AGENT_RUN"` → `processAgentRunJob` (`worker.ts:128`): loads the `AgentRun` row, flips it to `RUNNING`, calls `runRegisteredAgent`, writes the output/confidence/trace back, and audits at each step.
- everything else → `processDemoJob` (`worker.ts:202`), which is a **simulation**. It throws if the stored error message matches `/malformed|invalid payload|permission|unauthorized|forbidden/`, and otherwise does nothing and reports success. No email is sent. No webhook is delivered. Don't be confused when a `WEBHOOK_DELIVERY` job "succeeds" without any network traffic.

**The gotcha that will cost you an hour:** clicking "Run Ticket Agent" only *queues* an `AgentRun` and a `BackgroundJob`, then redirects you to the run page. If the worker is not running, that page sits at `PENDING` forever and nothing indicates why. Keep `npm run worker` open in a second terminal.

---

## 7. The agent framework

`packages/agents/`. Four files matter.

`types.ts` defines the contract every agent implements:

```ts
type AgentDefinition = {
  type, displayName, description, version,
  supportedTargets: AgentTargetType[],
  run: (request) => AgentRunResult
}

type AgentRunResult = {
  summary, findings[], recommendations[], limitations[],
  confidenceScore, output, trace: AgentTraceStep[]
}
```

`registry.ts` holds a `Map<AgentType, AgentDefinition>` and `runRegisteredAgent` (`registry.ts:29`), which looks up the agent and refuses to run it against an unsupported target type. **Adding a new agent is: write the file, add it to the `agents` array, add the enum value in three places** (`schema.prisma`, `packages/shared/src/index.ts` `AGENT_TYPES` and `labelMaps.agentType`). Document 02 story B3 walks through exactly this.

The three implementations:

| Agent | File | What it does |
| --- | --- | --- |
| `TICKET_SUMMARIZATION` | `ticket-summarization.ts` | Scores urgency from priority, escalation keywords, linked incident, linked error logs; infers a category from text; lists missing triage context; recommends an owner team |
| `LOG_ANOMALY_DETECTION` | `log-anomaly.ts` | Delegates numeric scoring to `scoreLogAnomaly` in observability, then pattern-matches the messages into one of three named failure modes, and decides whether to recommend opening an incident |
| `FAILED_JOB_INVESTIGATION` | `failed-job-investigation.ts` | Classifies an error message as timeout / malformed payload / permission / rate limit, and — importantly — refuses to recommend a retry for the payload class |

Every agent is a **pure synchronous function**. Same input, same output, no clock reads, no I/O. That is why `tests/agents.test.ts` can assert on exact score thresholds, and why the seed script can call `runRegisteredAgent` directly at `packages/db/src/seed.ts:34` to manufacture realistic historical runs.

The `trace` array is the design detail to preserve. Each step records what was observed and how much it moved the score, so the `/agents/[id]` page can show the reasoning rather than just a verdict. When you add heuristics, push a trace step.

Also note every result carries `limitations` — a hardcoded honest statement of what the agent cannot see. That is a product decision about not overselling automation, and it is worth keeping.

---

## 8. UI conventions

`packages/ui/src/index.tsx` — about 14 components, all presentational, all server-safe: `PageHeader`, `Card`, `Button`, `Badge`, `DataTable`, `DescriptionList`, `Field`, `TextInput`, `TextArea`, `Select`, `EmptyState`, `Metric`, `JsonBlock`.

`packages/ui/src/styles.css` — plain CSS with custom properties. No Tailwind, no CSS modules, no styled-components. Available class names include `.grid`/`.grid--2`/`.grid--3`/`.grid--4`, `.filter-bar`, `.form-grid`/`.form-grid--2`, `.detail-grid`, `.timeline`/`.timeline-item`, `.pill-list`, `.actions`, `.muted`, `.mt`.

Tone is the shared visual vocabulary: `neutral | info | success | warning | danger | critical`. The mapping from domain values to tones lives in `apps/web/lib/format.ts` — `ticketStatusTone`, `priorityTone`, `logLevelTone`, `slaTone`. Use those rather than inventing colors at the call site.

Page structure is consistent, and you should match it:

```tsx
<PageHeader title=... eyebrow=... actions={<form action={someAction}>...</form>}>
  <p>One sentence explaining what this page is for.</p>
</PageHeader>
<Card title="...">
  <DataTable> ... </DataTable>
</Card>
```

`Button` renders an `<a>` when given `href` and a `<button>` otherwise. Note that the `href` variant only sets `aria-disabled` — a "disabled" link Button is still clickable. Relevant if you use it for pagination controls.

---

## 9. Tests

Three files, all pure logic, no database:

- `tests/domain.test.ts` — ticket transitions, SLA due-date math, SLA state, tag normalization, incident transitions
- `tests/agents.test.ts` — one behavioral assertion per agent
- `tests/integration.test.ts` — org scoping helpers, redaction, pagination bounds. **The name is misleading**; these are unit tests of pure helper functions, not integration tests. There is no test anywhere that touches Postgres, exercises a server action, or renders a page.

`vitest.config.ts` aliases four packages at their source. Note it does **not** alias `@agentdesk/db` or `@agentdesk/ui` — deliberately, since importing them would drag in Prisma and React.

When you add a feature, the practical rule is: **if the logic can be tested without a database, it belongs in `packages/domain` and it must have a test.** That single rule is what keeps this codebase testable, and it is why so many stories in document 02 ask you to add a pure function first and wire it up second.

---

## 10. Running it

```bash
npm install
cp .env.example .env
npm run db:start      # docker compose up postgres on :5432
npm run db:generate   # prisma generate
npm run db:push       # create tables (no migration files — see below)
npm run db:seed       # wipe and reload the demo dataset
npm run dev           # http://localhost:3000
npm run worker        # SECOND TERMINAL — required for agent runs to complete
```

Verification loop while developing: `npm run typecheck` then `npm run test`.

Demo users (switch in the top bar or `/settings`): `admin@` (Admin), `maya.support@` (Support Agent), `ethan.eng@` (Engineering), `nina.manager@` (Manager), `victor.viewer@` (Viewer).

`npm run db:seed` **deletes everything first** (`seed.ts:12`). It is a reset, not an upsert. Never point it at data you care about.

Read the seed script early. It is the best single document about how the entities are meant to relate: an auth incident with two tickets and eight logs and two failed jobs and three pre-computed agent runs, all consistent with each other.

---

## 11. Known rough edges

> **Note (updated after the backlog shipped):** the 20 stories in document 02
> have all been implemented, and several of the issues below were fixed in the
> process — CI now exists, the ticket and incident queues paginate, the worker
> reclaims abandoned jobs, retry accounting has a single owner, and the test
> suite runs on Windows. The list is kept as written because it is an accurate
> description of the baseline the stories were written against, and because
> each PR references the specific rough edge it closed. Items still true today
> are marked **(still open)**.

These are real, verified by reading the code. Some are deliberate scope cuts and some are latent bugs. Knowing them will save you from "fixing" something that is intentional, and from assuming something works that doesn't.

**Not built yet (despite `docs/` describing them):**
- ~~No CI.~~ Fixed in PR #1.
- **(still open)** No migration history. `packages/db/prisma/` contains only `schema.prisma`; the workflow is `db push`. Any schema change you make is unversioned, and there is no way to roll one back.
- ~~No REST or GraphQL API.~~ A read-only `/api/v1` arrived in PR #19; server actions remain the only *mutation* path.
- **(still open)** No realtime anything. Every page is a full server render behind a link click.
- **(still open)** No `loading.tsx` and no `not-found.tsx` anywhere. `notFound()` renders the framework default.
- Partly fixed: in-app notifications arrived in PR #22. Email and webhook delivery are **(still open)** — `processDemoJob` simulates them.

**Latent bugs and inconsistencies:**
- **(still open)** `scopedWhere` (`access.ts:23`) is exported and unit-tested but **used by zero pages**. Every page spells the org filter out by hand. The helper is a good idea that never landed.
- ~~`/tickets` and `/incidents` have no pagination~~ Fixed in PR #3, along with the dashboard counts.
- Formerly:, while `/logs`, `/jobs`, `/audit`, and `/agents` do. The dashboard is worse: `page.tsx:21` loads *every* open ticket with no `take` and then counts them in memory.
- ~~The worker never reclaims a stalled job.~~ Fixed in PR #7. `lockedAt` and `lockedBy` are written but never read. If a worker dies mid-job, that row stays `RUNNING` forever.
- **(still open)** `claimNextJob` does not filter by organization. Fine for a single-tenant worker; wrong if you ever want per-tenant workers or fairness.
- ~~Retry accounting is split in two~~ Fixed in PR #12; the worker now owns `attempts`. Formerly: `retryJobAction` (`actions.ts:487`) increments `attempts` when a human clicks Retry, and the worker separately decides `attempts >= maxAttempts → DEAD_LETTERED` on failure. Two writers, one counter.
- `updateTicketAction` recomputes `slaDueAt` from the *original* `createdAt` when priority changes (`actions.ts:242`). Raising a 3-day-old LOW ticket to CRITICAL produces an SLA that was due two days ago and is instantly breached. Arguably correct, arguably a bug — decide deliberately before you touch it.
- **(still open)** Nothing validates that `assignedUserId` is a member of `assignedTeamId`.
- **(still open)** `error.tsx` renders `error.message` verbatim, which in production would surface internal messages to the user.
- **(still open)** The user switcher `<select>` has `onChange={undefined}` — a leftover. You must click "Switch".
- **(still open)** `Incident.agentFindings` is written only by the seed. No action ever populates it.

None of these block the stories in document 02. Several of the stories fix them on purpose, and each one says so.

---

## 12. Glossary

| Term | Meaning here |
| --- | --- |
| **SLA** | The deadline by which a ticket should be resolved. Derived from priority alone: CRITICAL 2h, HIGH 8h, MEDIUM 36h, LOW 72h (`domain/src/tickets.ts:57`). |
| **SLA state** | `healthy` / `approaching` (< 4h left) / `breached` / `resolved`. Computed, never stored (`tickets.ts:70`). |
| **Fingerprint** | 12-char hash grouping near-identical log messages (`domain/src/logs.ts:14`). |
| **Capability** | A permission string like `ticket:update`, granted per role (`domain/src/permissions.ts`). |
| **Request context id** | A UUID minted per server action and stamped on every audit event and job it produces, so one user click is traceable end to end (`web/lib/request-context.ts`). |
| **Agent run** | One persisted execution of a deterministic analysis routine, with its input snapshot, output, trace, and confidence. |
| **Trace step** | One line of an agent's reasoning: what it observed and how much it moved the score. |
| **Dead-lettered** | A job that has exhausted retries and needs a human. Terminal state. |
| **Tone** | The UI's severity vocabulary: neutral / info / success / warning / danger / critical. |
| **Target type** | What an agent run points at: `TICKET`, `INCIDENT`, `LOG_GROUP`, or `JOB`. Note `LOG_GROUP` targets are strings (a fingerprint or service name), not rows in a table. |

---

## 13. Suggested first day

1. `npm install && npm run db:start && npm run db:generate && npm run db:push && npm run db:seed && npm run dev`, plus `npm run worker` in a second terminal.
2. Click through every page as `maya.support@`, then as `victor.viewer@`. Notice what disappears.
3. Read `packages/db/src/seed.ts` end to end and match what you read against what you clicked.
4. Read `apps/web/lib/actions.ts:199-284` (`updateTicketAction`) and trace all seven steps.
5. Change an SLA threshold in `packages/domain/src/tickets.ts:57`, run `npm run test`, watch it fail, revert.
6. Open `/tickets/[id]`, click "Run Ticket Agent", then open the run and read the trace.
7. Then, and only then, pick a story from `02-feature-backlog-user-stories.md`. Start with A1.
