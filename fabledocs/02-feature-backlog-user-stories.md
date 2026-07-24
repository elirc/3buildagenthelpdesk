# Feature Backlog — 20 User Stories

New product work for the Agentic Help Desk, specified in enough detail for a junior engineer to implement without further design input.

Read [01-how-this-app-works.md](01-how-this-app-works.md) first. These stories assume you know the seven-step server action shape, the package dependency rule, and where domain logic belongs.

---

## How to use this document

Each story is self-contained and states its own schema changes, files, acceptance criteria, and tests. Sizes are rough:

- **S** — half a day. One file or two, no schema change.
- **M** — one to three days. Usually one new model or field, one action, one page.
- **L** — a week. New subsystem, multiple models, or a change that ripples across pages.

**Do them one at a time and finish each one vertically.** A story is not done when the happy path renders; it is done when the schema, the domain rule, the action, the page, the audit event, and the test all exist and `npm run typecheck && npm run test` passes.

### The recipe

Almost every story below is the same nine moves. Internalize this and the stories become mechanical:

1. **Schema** — edit `packages/db/prisma/schema.prisma`, then `npm run db:generate && npm run db:push`.
2. **Seed** — add representative rows to `packages/db/src/seed.ts` so the feature is visible immediately after `npm run db:seed`.
3. **Enums** — a new enum value must be added in *three* places: the Prisma enum, the `as const` array in `packages/shared/src/index.ts`, and `labelMaps` in the same file.
4. **Domain** — put the rule in `packages/domain/src/` as a pure function. No Prisma, no React.
5. **Test the domain function** — in `tests/domain.test.ts` or a new file under `tests/`. This is not optional.
6. **Action** — add to `apps/web/lib/actions.ts` following the seven steps. Declare a capability.
7. **Capability** — if the action needs a new one, add it to the `Capability` union and to every role in `capabilitiesByRole` (`packages/domain/src/permissions.ts`).
8. **Audit** — call `writeAuditEvent`, and add the new action name to the `AuditAction` union in `packages/observability/src/index.ts:16`.
9. **UI** — build with `packages/ui` components and the existing CSS classes. Call `revalidatePath` for every route whose content changed.

### Definition of done (applies to every story)

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes, including at least one new test
- [ ] Every new query filters by `organizationId`
- [ ] Every new mutation checks a capability and writes an audit event
- [ ] Seed data exercises the feature
- [ ] `VIEWER` cannot mutate anything you added
- [ ] You have manually clicked the feature as two different roles

### Suggested order

| # | Story | Size | Why here |
| --- | --- | --- | --- |
| 1 | A1 Paginate and sort the queues | S | No schema. Learn the page/UI layer safely. |
| 2 | C1 Pause the SLA clock | M | Pure domain logic with real subtlety. Best first taste of `packages/domain`. |
| 3 | A4 Canned replies | M | Your first new model, and a simple one. |
| 4 | B1 Link related tickets | M | Self-referencing relation — a genuinely useful thing to have done once. |
| 5 | D2 Stale job reaper | M | Teaches the worker and concurrency. |
| 6 | A3 Bulk triage actions | M | Multi-record transactions and partial failure. |
| 7 | B3 Duplicate detection agent | M | Extends the agent registry end to end. |
| 8 | anything else | | Pick by interest. |

Stories marked **⚠ overlaps** touch the same area as an existing story in `docs/sprint-*/`. Read that sprint story before starting so you don't build the same thing twice.

---

# Epic A — Ticket queue productivity

*Support agents live in the queue all day. Right now the queue is a single unsorted, unpaginated list with three filters and no way to act on more than one ticket at a time.*

---

## Story A1: Paginate and sort the ticket and incident queues

**Size:** S · **Touches:** `apps/web/app/tickets/page.tsx`, `apps/web/app/incidents/page.tsx`, `apps/web/app/page.tsx`

**Story:** As a support agent, I want to page through and sort the ticket and incident lists, so that the queue stays usable when there are thousands of records and I can order it by what I care about right now.

**Why this matters here:** `/logs`, `/jobs`, `/audit`, and `/agents` already paginate using `parsePagination` and `pageHref` from `apps/web/lib/pagination.ts`. `/tickets` and `/incidents` do not — they fetch every matching row. The dashboard (`apps/web/app/page.tsx:21`) is worse: it loads every open ticket with no limit and then counts and filters in JavaScript. This is the cheapest possible introduction to the codebase and it fixes a real inconsistency.

**Schema changes:** None.

**Domain work:** None, but add a sort-key allowlist somewhere shared rather than interpolating user input into an `orderBy`:

```ts
// apps/web/lib/pagination.ts
export const TICKET_SORT_KEYS = ["updatedAt", "createdAt", "priority", "slaDueAt", "status"] as const;
export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number];

export function parseSort<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T
): { key: T; direction: "asc" | "desc" } { /* ... */ }
```

**UI:** Add `page`/`pageSize`/`sort`/`direction` to each page's `searchParams` type. Add Previous/Next controls copied from `apps/web/app/jobs/page.tsx:106-110`. Make the `<th>` cells links that toggle sort direction, using `pageHref` so existing filters survive.

**Acceptance criteria:**
1. `/tickets` shows at most 50 rows by default and displays "Page N of M".
2. Previous is non-functional on page 1; Next is non-functional on the last page.
3. Changing page preserves the `q`, `status`, and `priority` filters.
4. Clicking a sortable column header sorts by it; clicking again reverses direction.
5. A `sort` value not in the allowlist falls back to the default instead of throwing or reaching Prisma.
6. `/incidents` gets the same treatment.
7. The dashboard's "Open Tickets" and "SLA Watch" numbers come from `prisma.ticket.count()` / a bounded query, not from loading every row.

**Tests required:** In `tests/integration.test.ts`, cover `parseSort`: a valid key, an unknown key, a SQL-ish injection string, and an empty string.

**Edge cases:** Total count of 0 (`Math.ceil(0/50)` is 0 — clamp to page 1 of 1). A `page` beyond the last page should render an empty table, not crash. Remember `Button` with `href` is still clickable when `disabled`; if that bothers you, render a `<span className="muted">` instead when there is no page to go to.

**Out of scope:** Cursor pagination. Saving the sort preference (that's A2).

---

## Story A2: Saved queue views

**Size:** M · **Depends on:** A1

**Story:** As a support agent, I want to save a filter and sort combination under a name and pin it to the sidebar, so that I can return to "my critical unassigned tickets" in one click instead of re-selecting four dropdowns.

**Why this matters here:** Filters currently live only in the URL. Agents rebuild the same query dozens of times a day. This is also the first story where you own a small CRUD surface end to end.

**Schema changes:**

```prisma
model SavedView {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  ownerId        String
  owner          User         @relation("SavedViews", fields: [ownerId], references: [id])
  name           String
  resource       String       // "tickets" | "incidents" | "logs" | "jobs"
  queryString    String       // serialized URLSearchParams, e.g. "status=NEW&priority=CRITICAL"
  isShared       Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([ownerId, resource, name])
  @@index([organizationId, resource])
}
```

Add the back-relations to `Organization` and `User`.

**Domain work:** `packages/domain/src/views.ts`

```ts
export const savedViewSchema = z.object({
  name: z.string().min(2).max(60),
  resource: z.enum(["tickets", "incidents", "logs", "jobs"]),
  queryString: z.string().max(500),
  isShared: z.boolean().default(false)
});

// Strip page, pageSize, and any key not in the allowlist for that resource.
export function sanitizeViewQuery(resource: string, raw: string): string;

export function canEditSavedView(
  user: { id: string; role: UserRole },
  view: { ownerId: string; isShared: boolean }
): boolean;
```

`sanitizeViewQuery` is the security-relevant part: never store and replay arbitrary query strings. Parse, allowlist the keys, re-serialize.

**Server actions:** `createSavedViewAction`, `deleteSavedViewAction`, `toggleSavedViewSharedAction`. Capability: reuse `ticket:update` for now, or add `view:manage` if you prefer (then update all five roles).

**UI:** A "Save this view" button in the filter bar of `/tickets` that posts the current `searchParams`. A "Views" `Card` above the filter bar listing your views plus shared views from your org, each a link to `/tickets?<queryString>`. Owner-only delete button.

**Acceptance criteria:**
1. Saving with the current filters applied creates a view whose link reproduces exactly those filters.
2. Two views with the same name for the same user and resource is rejected with a readable message, not a Prisma unique-constraint stack trace.
3. Shared views are visible to everyone in the organization and to no one outside it.
4. Only the owner (or an `ADMIN`) can delete or rename a view.
5. `page` and `pageSize` are stripped before saving.
6. A view containing a filter key you later remove from the page degrades gracefully — unknown keys are ignored, not crashed on.

**Tests required:** `sanitizeViewQuery` drops `page`, drops unknown keys, preserves allowed keys, and handles an empty string. `canEditSavedView` for owner, non-owner, and admin.

**Audit events:** `view.created`, `view.deleted`.

**Edge cases:** A shared view created by a user who is later deleted. Deciding whether `isShared` views should be editable by an admin — pick one and write it down.

---

## Story A3: Bulk triage actions

**Size:** M · **Depends on:** A1

**Story:** As a support agent, I want to select several tickets in the queue and assign, re-prioritize, or transition them together, so that a morning triage pass takes one action instead of thirty.

**Why this matters here:** This is where you learn transactional multi-record writes and, more importantly, **partial failure**. Some of the selected tickets will fail their status transition check while others succeed. How you handle that is the whole story.

**Schema changes:** None.

**Domain work:** `packages/domain/src/tickets.ts`

```ts
export type BulkTransitionResult = {
  applied: string[];
  rejected: Array<{ ticketId: string; reason: string }>;
};

export function planBulkStatusChange(
  tickets: Array<{ id: string; status: TicketStatus }>,
  target: TicketStatus
): BulkTransitionResult;
```

Keep this pure — it takes the current statuses and returns the plan. The action executes the plan.

**Server actions:** `bulkUpdateTicketsAction(formData)` reading a repeated `ticketIds` field (`formData.getAll("ticketIds")`), plus one of `status` / `assignedUserId` / `priority`.

Wrap the writes in `prisma.$transaction`. Decide and document: **all-or-nothing, or best-effort?** The recommendation here is *best-effort* — apply the valid ones, report the rejected ones — because a support agent selecting 20 tickets does not want one closed ticket to block the other 19. Say so in a comment.

**UI:** A checkbox column on `/tickets` inside a single form wrapping the table. A sticky action bar with "Assign to", "Set priority", "Set status", and "Apply". After submission, `revalidatePath` and render a summary: "14 updated, 2 skipped (invalid transition from CLOSED)."

**Acceptance criteria:**
1. Selecting zero tickets and submitting is a no-op, not an error.
2. A bulk status change applies only to tickets whose current status permits the transition; the rest are reported by title with a reason.
3. One audit event is written **per ticket**, not one for the batch — the audit trail must stay queryable by `entityId`.
4. Each audit event's metadata records that it came from a bulk operation and carries the shared `requestContextId`.
5. Tickets from another organization included by hand-editing the form are rejected outright.
6. `VIEWER` cannot see the checkboxes or trigger the action.
7. A bulk assignment to a user outside the org is rejected (reuse `assertScopedUser`).

**Tests required:** `planBulkStatusChange` with a mixed set — some legal, some illegal, an empty list, and a target equal to the current status.

**Audit events:** Existing `ticket.updated` / `ticket.status_changed`, with `metadata: { bulk: true, batchSize: n }`.

**Edge cases:** 500 selected tickets — cap the batch size (200 is reasonable) and say so in the UI. A ticket modified by someone else between page render and submit.

---

## Story A4: Canned replies

**Size:** M

**Story:** As a support agent, I want to insert a saved response template into a ticket comment and have it fill in the customer and ticket details automatically, so that common replies are consistent and fast.

**Why this matters here:** A simple, satisfying model-plus-form story, and it introduces safe variable substitution — a small but real security surface.

**Schema changes:**

```prisma
model CannedReply {
  id             String          @id @default(cuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id])
  title          String
  body           String
  category       TicketCategory?
  isActive       Boolean         @default(true)
  createdById    String?
  createdBy      User?           @relation("CannedReplies", fields: [createdById], references: [id])
  usageCount     Int             @default(0)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([organizationId, title])
  @@index([organizationId, category, isActive])
}
```

**Domain work:** `packages/domain/src/canned-replies.ts`

```ts
export const CANNED_REPLY_VARIABLES = [
  "customerName", "ticketTitle", "ticketId", "agentName", "slaDueAt"
] as const;

export const cannedReplySchema = z.object({
  title: z.string().min(3).max(80),
  body: z.string().min(10).max(4000),
  category: z.enum(TICKET_CATEGORIES).optional().nullable(),
  isActive: z.boolean().default(true)
});

// Replaces {{customerName}} etc. Unknown variables are left untouched, never evaluated.
export function renderCannedReply(body: string, values: Record<string, string>): string;

export function extractVariables(body: string): string[];
```

`renderCannedReply` must be a plain string replace over a known key list. Do not build a template engine and do not `eval` anything.

**Server actions:** `createCannedReplyAction`, `updateCannedReplyAction`, `deactivateCannedReplyAction`. Extend `addTicketCommentAction` to accept an optional `cannedReplyId`; when present, increment `usageCount` and record the id in the audit metadata.

**UI:** A management `Card` on `/settings` (admins and managers). On `/tickets/[id]`, a `<Select>` above the comment box listing active replies, filtered to the ticket's category plus the uncategorized ones. Because there is no client JS, "insert" is a submit: a small form that posts the reply id and the ticket id, and re-renders the comment box with the rendered body as `defaultValue`.

**Acceptance criteria:**
1. A reply body containing `{{customerName}}` renders the ticket's actual customer name in the comment box.
2. An unknown variable such as `{{foo}}` is left as literal text.
3. Replies scoped to a category do not appear on tickets of a different category; uncategorized replies appear everywhere.
4. Deactivated replies disappear from the ticket picker but remain attached to historical comments.
5. `usageCount` increments only when a comment is actually posted, not when the template is previewed.
6. Only `ADMIN` and `MANAGER` can create or edit replies; any role that can comment can use them.
7. A reply body containing HTML is rendered as text, not markup.

**Tests required:** `renderCannedReply` — all variables present, some missing, unknown variable, empty body, a body with `{{` and no closing braces. `extractVariables` on a multi-variable body.

**Audit events:** `canned_reply.created`, `canned_reply.updated`, `canned_reply.deactivated`.

**Out of scope:** Rich text, attachments, per-user private templates.

---

## Story A5: Watchers and an in-app notification inbox

**Size:** L

**Story:** As an engineer, I want to watch a ticket or incident and see an in-app notification when it changes, so that I stop discovering escalations by accident.

**Why this matters here:** The app has no notification concept at all. This story introduces a **fan-out on write** pattern, and it is the first place you will feel why a background worker exists.

**Schema changes:**

```prisma
enum NotificationKind {
  TICKET_STATUS_CHANGED
  TICKET_COMMENT_ADDED
  TICKET_ASSIGNED
  INCIDENT_STATUS_CHANGED
  SLA_APPROACHING
}

model Watch {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String
  user           User         @relation("Watches", fields: [userId], references: [id])
  entityType     String       // "Ticket" | "Incident"
  entityId       String
  createdAt      DateTime     @default(now())

  @@unique([userId, entityType, entityId])
  @@index([organizationId, entityType, entityId])
}

model Notification {
  id             String           @id @default(cuid())
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id])
  recipientId    String
  recipient      User             @relation("Notifications", fields: [recipientId], references: [id])
  kind           NotificationKind
  entityType     String
  entityId       String
  title          String
  body           String
  readAt         DateTime?
  requestContextId String?
  createdAt      DateTime         @default(now())

  @@index([recipientId, readAt, createdAt])
  @@index([organizationId, entityType, entityId])
}
```

Register `NotificationKind` in `packages/shared/src/index.ts` (array + `labelMaps`).

**Domain work:** `packages/domain/src/notifications.ts`

```ts
export type NotificationRecipientRule = {
  kind: NotificationKind;
  includeWatchers: boolean;
  includeAssignee: boolean;
  includeOwner: boolean;
};

// Pure: given the actors and the change, who should be told? Never notify the actor about their own action.
export function resolveRecipients(params: {
  actorUserId: string;
  watcherIds: string[];
  assigneeId?: string | null;
  ownerId?: string | null;
  rule: NotificationRecipientRule;
}): string[];

export function describeNotification(
  kind: NotificationKind,
  context: Record<string, string>
): { title: string; body: string };
```

**Server actions:** `watchEntityAction` / `unwatchEntityAction` / `markNotificationsReadAction`. Extend `updateTicketAction`, `addTicketCommentAction`, and `updateIncidentStatusAction` to fan out.

**Where the fan-out happens matters.** Do it inline in the action for now (`createMany` of notifications, deduplicated) and add a `TODO` noting that at scale this belongs in a `BackgroundJob` so a slow fan-out cannot make the user's save slow. If you are feeling ambitious, do it via a job type from the start — but then it only works when the worker runs, which is a real trade-off to weigh.

**UI:** A bell in `apps/web/app/layout.tsx` topbar showing the unread count. A `/notifications` page listing them newest-first with a "Mark all read" form. A "Watch" / "Unwatch" toggle button in the `PageHeader` actions of `/tickets/[id]` and `/incidents/[id]`.

**Acceptance criteria:**
1. Watching a ticket, then having *another user* change its status, produces exactly one unread notification for the watcher.
2. Your own actions never notify you.
3. The assignee is notified on status change and new comment even without an explicit watch.
4. Watching twice is idempotent (the unique constraint enforces it; catch the error and treat it as success).
5. The unread badge is accurate and comes from a `count`, not from loading all notifications.
6. "Mark all read" sets `readAt` and only for the current user's rows.
7. Notifications never cross organizations.
8. Deleting nothing is required — notifications are historical records and are not deleted when the entity changes.

**Tests required:** `resolveRecipients` — actor excluded, duplicate watcher/assignee collapsed to one, empty watcher list, null assignee. `describeNotification` for each kind.

**Audit events:** None for reading. `entity.watched` / `entity.unwatched` are optional — argue for or against in your PR (audit volume vs. traceability).

**Edge cases:** A watcher who leaves the organization. A ticket changed 50 times in a minute — consider whether to collapse, and if you decide not to, say why.

**⚠ overlaps:** `docs/sprint-one/01-user-stories.md` Story 1.5 (unified activity timeline) touches the same page region. Different feature, adjacent code.

---

# Epic B — Ticket relationships and data quality

*Duplicate tickets for one outage are the normal case, not the exception. The app currently has no way to express that two tickets are related.*

---

## Story B1: Link related tickets

**Size:** M

**Story:** As a support agent, I want to record that one ticket duplicates, blocks, or relates to another, so that the relationship survives after I forget it.

**Why this matters here:** Tickets can point at an incident but never at each other. A self-referencing many-to-many is a pattern every engineer should implement once, and Prisma makes the two-sided naming genuinely tricky — which is exactly why it is worth doing.

**Schema changes:**

```prisma
enum TicketLinkType {
  DUPLICATE_OF
  RELATED_TO
  BLOCKS
  CAUSED_BY
}

model TicketLink {
  id             String         @id @default(cuid())
  organizationId String
  organization   Organization   @relation(fields: [organizationId], references: [id])
  sourceTicketId String
  sourceTicket   Ticket         @relation("LinkSource", fields: [sourceTicketId], references: [id], onDelete: Cascade)
  targetTicketId String
  targetTicket   Ticket         @relation("LinkTarget", fields: [targetTicketId], references: [id], onDelete: Cascade)
  linkType       TicketLinkType
  note           String?
  createdById    String?
  createdBy      User?          @relation("TicketLinks", fields: [createdById], references: [id])
  createdAt      DateTime       @default(now())

  @@unique([sourceTicketId, targetTicketId, linkType])
  @@index([organizationId, targetTicketId])
}
```

Add both relation fields to `Ticket`: `linksOut TicketLink[] @relation("LinkSource")` and `linksIn TicketLink[] @relation("LinkTarget")`.

**Domain work:** `packages/domain/src/ticket-links.ts`

```ts
// BLOCKS ↔ (viewed from the other side) "blocked by"; DUPLICATE_OF and RELATED_TO invert to themselves.
export function inverseLinkLabel(type: TicketLinkType): string;

export function validateTicketLink(params: {
  sourceTicketId: string;
  targetTicketId: string;
  linkType: TicketLinkType;
  existingLinks: Array<{ sourceTicketId: string; targetTicketId: string; linkType: TicketLinkType }>;
}): { ok: true } | { ok: false; reason: string };
```

`validateTicketLink` must reject self-links, exact duplicates, and the reverse of an existing `DUPLICATE_OF` (A duplicate-of B and B duplicate-of A is nonsense).

**Server actions:** `linkTicketsAction`, `unlinkTicketsAction`. Capability `ticket:update`.

**UI:** A "Linked Tickets" `Card` on `/tickets/[id]` listing outgoing links by type and incoming links with the inverse label. An add form with a ticket picker (a `<Select>` of recent open tickets in the org is fine — do not build autocomplete) and a link-type select.

**Acceptance criteria:**
1. Linking A → B makes the relationship visible on **both** ticket pages, with the correct directional wording on each.
2. A ticket cannot be linked to itself.
3. The same link cannot be created twice.
4. Linking to a ticket in another organization is rejected.
5. Deleting a ticket removes its links (cascade) without orphaning rows.
6. The link picker excludes the current ticket and tickets already linked.

**Tests required:** `validateTicketLink` — self-link, exact duplicate, reverse duplicate, valid link. `inverseLinkLabel` for all four types.

**Audit events:** `ticket.linked`, `ticket.unlinked`, with both ids in the metadata.

**Out of scope:** Cross-entity links (ticket→incident already exists via `incidentId`). Automatic transitive closure.

---

## Story B2: Merge duplicate tickets

**Size:** L · **Depends on:** B1

**Story:** As a support agent, I want to merge a duplicate ticket into the canonical one, so that the conversation and evidence end up in a single place and the customer still gets an answer.

**Why this matters here:** Merging is a destructive-feeling operation over several tables, and doing it safely is a genuinely senior skill: transactions, preserving history, and deciding what "merged" means. It is also the story most likely to teach you why audit events are worth the trouble.

**Schema changes:**

```prisma
// on Ticket
mergedIntoId String?
mergedInto   Ticket?  @relation("TicketMerges", fields: [mergedIntoId], references: [id])
mergedFrom   Ticket[] @relation("TicketMerges")
mergedAt     DateTime?
```

No new model. A merged ticket keeps existing and keeps its history — this is a link plus a closure, not a delete.

**Domain work:** `packages/domain/src/tickets.ts`

```ts
export function canMergeTickets(params: {
  source: { id: string; status: TicketStatus; mergedIntoId?: string | null };
  target: { id: string; status: TicketStatus; mergedIntoId?: string | null };
}): { ok: true } | { ok: false; reason: string };
```

Reject: same ticket, an already-merged source, a merged target (no chains — merge into the final canonical ticket instead), and a `CLOSED` target.

**Server actions:** `mergeTicketsAction(formData)` with `sourceTicketId` and `targetTicketId`. Inside a single `prisma.$transaction`:

1. Re-read both tickets with the org filter, inside the transaction.
2. `canMergeTickets` — throw `ActionError` with the reason if not ok.
3. Move `TicketComment` rows from source to target, prefixing each body with `[merged from #<shortId>] ` — or add a `mergedFromTicketId` column if you prefer non-destructive provenance. Pick one and justify it.
4. Repoint `StructuredLog.ticketId` and `BackgroundJob.relatedTicketId` from source to target.
5. Union the `tags` arrays on the target.
6. If the target has no incident and the source does, copy `incidentId` across.
7. Set the source's `mergedIntoId`, `mergedAt`, `status: "CLOSED"`, `resolvedAt`.
8. Create a `DUPLICATE_OF` `TicketLink` from source to target.

**UI:** A "Merge into…" form in the ticket detail sidebar. A prominent banner on a merged ticket: "This ticket was merged into <link>." The edit form is hidden on merged tickets. Merged tickets are excluded from `/tickets` by default with a "Show merged" toggle.

**Acceptance criteria:**
1. After merging A into B, B shows all of A's comments in chronological order with clear provenance.
2. Logs and jobs that pointed at A now point at B and appear on B's page.
3. A is `CLOSED`, is flagged as merged, and links to B.
4. A's page is still reachable and readable — no 404, no data loss.
5. Merging is rejected for: self, already-merged source, merged target, cross-org pair.
6. The whole merge is atomic. Kill the process mid-merge in a test and no half-merged state exists.
7. Two audit events are written: one on the source, one on the target, sharing a `requestContextId`.
8. Only `ADMIN`, `SUPPORT_AGENT`, and `MANAGER` can merge.

**Tests required:** `canMergeTickets` across every rejection reason plus the happy path. If you can, add a transaction-level test — but pure-function coverage is the requirement.

**Audit events:** `ticket.merged` (on source, `after.mergedIntoId`), `ticket.merge_received` (on target, metadata listing moved comment/log/job counts). Add both to the `AuditAction` union.

**Edge cases:** SLA — the merged ticket's SLA becomes meaningless; decide whether to null it or leave it and document the choice. A merge that would move 500 comments. Concurrent merges of the same source (the transaction plus the `mergedIntoId` check protects you — verify).

---

## Story B3: Duplicate Ticket Detection agent

**Size:** M · **Depends on:** B1

**Story:** As a support agent, I want the system to tell me when a new ticket looks like an existing open one, so that I can link or merge it before two people work the same problem.

**Why this matters here:** This is the story that teaches the agent framework end to end — a fourth agent, registered, versioned, queued through the worker, and rendered on the existing run page with zero UI work. It also stays honest about the deterministic constraint: no embeddings, no model, just token overlap.

**Schema changes:** Add `DUPLICATE_DETECTION` to the `AgentType` enum in `schema.prisma`. Then add it to `AGENT_TYPES` and `labelMaps.agentType` in `packages/shared/src/index.ts`. **All three, or the app will crash rendering the label.**

**Domain/agent work:** `packages/agents/src/duplicate-detection.ts`

```ts
export type DuplicateDetectionInput = JsonRecord & {
  ticket: { id: string; title: string; description: string; category: TicketCategory; customerName: string };
  candidates: Array<{
    id: string; title: string; description: string;
    category: TicketCategory; customerName: string;
    status: TicketStatus; createdAt: string; incidentId?: string | null;
  }>;
};

export type DuplicateDetectionOutput = JsonRecord & {
  matches: Array<{ ticketId: string; title: string; similarity: number; reasons: string[] }>;
  bestMatchId: string | null;
  shouldRecommendMerge: boolean;
};
```

Scoring — keep it explainable, and push a trace step for each contribution:

- Jaccard similarity over normalized title tokens, minus a stopword list. Weight ~50.
- Same `category`: +10.
- Same `customerName`: +15.
- Both linked to the same incident: +20.
- Candidate created within 24 hours: +10; within 1 hour: +5 more.
- Shared tags: +3 each, capped at 9.

Clamp to 0–100. `shouldRecommendMerge` when the best match is ≥ 70 **and** that candidate is open. Register the agent in `packages/agents/src/registry.ts` with `supportedTargets: ["TICKET"]` and `version: "1"`.

**Server actions:** `runDuplicateDetectionAction(formData)`, modeled exactly on `runTicketAgentAction` (`actions.ts:391`). Candidate query: same org, status not in `RESOLVED`/`CLOSED`, not the ticket itself, not already merged, created in the last 30 days, `take: 50`, ordered by `createdAt` desc.

**UI:** A "Check for duplicates" button in the ticket header. Because the run is asynchronous, the results render on the existing `/agents/[id]` page for free. Additionally: on `/tickets/[id]`, if a `DUPLICATE_DETECTION` run for this ticket succeeded, show its top three matches in a `Card` with one-click "Link as duplicate" buttons (reusing B1's action).

**Acceptance criteria:**
1. Running the agent on a ticket with an obvious near-duplicate returns that ticket as `bestMatchId` with similarity ≥ 70.
2. Running it on an unrelated ticket returns an empty or low-similarity match list and `shouldRecommendMerge: false`.
3. The agent is deterministic: the same input produces byte-identical output, including the trace.
4. Candidates are org-scoped and exclude closed, resolved, and merged tickets.
5. The trace explains each score contribution — a reader can reconstruct the total by hand.
6. `limitations` states plainly that this is lexical overlap, not semantic understanding.
7. The run appears on `/agents` and is audited like every other run.

**Tests required:** New `tests/duplicate-detection.test.ts`: identical titles score very high; unrelated titles score low; same-customer bonus applies; an empty candidate list returns `bestMatchId: null` without throwing; the same input twice produces deep-equal results.

**Edge cases:** Ticket with a 5-character title. 50 candidates (keep it O(n) over candidates). Stopwords — "the", "a", "issue", "problem", "error" match everything; build the list and test it.

---

# Epic C — SLA correctness and routing

*The SLA model is currently `priority → hours`, computed from creation time, with no concept of pauses, working hours, or first response. Every real help desk has all three.*

---

## Story C1: Pause the SLA clock while waiting on the customer

**Size:** M

**Story:** As a support manager, I want the SLA clock to stop while a ticket is waiting on the customer, so that our metrics measure our responsiveness rather than the customer's.

**Why this matters here:** This is the best pure-domain story in the backlog. The logic is genuinely subtle, it is fully testable without a database, and it changes a number that appears on five different pages. It is also the correct second story for a new engineer.

**Schema changes:**

```prisma
// on Ticket
slaPausedAt        DateTime?   // set when entering WAITING_ON_CUSTOMER
slaPausedTotalMs   Int         @default(0)  // accumulated paused time
```

**Domain work:** `packages/domain/src/tickets.ts`

```ts
export const SLA_PAUSING_STATUSES: TicketStatus[] = ["WAITING_ON_CUSTOMER"];

export function isSlaPaused(status: TicketStatus): boolean;

// Returns the fields to write when a ticket moves between statuses.
export function applySlaPauseTransition(params: {
  from: TicketStatus;
  to: TicketStatus;
  slaPausedAt: Date | null;
  slaPausedTotalMs: number;
  now?: Date;
}): { slaPausedAt: Date | null; slaPausedTotalMs: number };

// Effective deadline = slaDueAt + accumulated pause + any pause currently in progress.
export function effectiveSlaDueAt(params: {
  slaDueAt: Date;
  slaPausedAt: Date | null;
  slaPausedTotalMs: number;
  now?: Date;
}): Date;
```

Then change `getSlaState` (`tickets.ts:70`) to compare against `effectiveSlaDueAt` rather than the raw `slaDueAt`. Keep the existing signature working by making the new fields optional with sane defaults, so you don't have to update every call site at once.

**Server actions:** In `updateTicketAction`, call `applySlaPauseTransition` and persist both fields alongside the status change.

**UI:** Show "SLA paused" as a `Badge` with `tone="info"` wherever `slaTone` is rendered. On `/tickets/[id]`, show both the original and effective due times, plus total paused duration.

**Acceptance criteria:**
1. Moving a ticket to `WAITING_ON_CUSTOMER` stamps `slaPausedAt` and leaves `slaDueAt` untouched.
2. Moving it back to `IN_PROGRESS` clears `slaPausedAt` and adds the elapsed pause to `slaPausedTotalMs`.
3. While paused, the SLA state never advances toward breach no matter how much time passes.
4. Effective due time equals original due time plus total paused milliseconds.
5. Multiple pause cycles accumulate correctly.
6. Resolving directly from a paused state closes out the pause before computing whether the SLA was met.
7. Existing tickets with `NULL`/`0` pause fields behave exactly as before — no migration backfill needed.
8. The dashboard "SLA Watch" count respects pausing.

**Tests required:** This is the story where the tests *are* the deliverable. Cover: never paused; one pause cycle; two pause cycles; still paused right now; paused then resolved; a pause that spans the original due time; `now` injected explicitly so the tests are deterministic. Use the existing `now` parameter convention from `getSlaState`.

**Audit events:** Include `slaPausedTotalMs` in the `after` snapshot on status changes.

**Edge cases:** Clock skew and negative durations — clamp to 0. A ticket that goes `WAITING_ON_CUSTOMER → WAITING_ON_CUSTOMER` (the transition table allows same-status saves) must not double-stamp.

**⚠ overlaps:** `docs/sprint-one` Story 1.2 filters by SLA state and will need updating after this lands.

---

## Story C2: Business-hours SLA calendar

**Size:** M · **Depends on:** C1

**Story:** As a support manager, I want SLA deadlines to count only working hours for non-critical tickets, so that a Friday-evening LOW ticket is not breached before Monday morning.

**Why this matters here:** Date math is where careless code goes to die, and doing this correctly — with injected clocks and exhaustive tests — is a skill that transfers everywhere. It also builds directly on C1's pure-function pattern.

**Schema changes:**

```prisma
model BusinessCalendar {
  id             String       @id @default(cuid())
  organizationId String       @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  timezone       String       @default("UTC")
  workdayStartMinute Int      @default(540)   // 09:00
  workdayEndMinute   Int      @default(1020)  // 17:00
  workdays       Int[]        @default([1,2,3,4,5])  // 0=Sunday
  holidays       DateTime[]   @default([])
  updatedAt      DateTime     @updatedAt
}
```

**Domain work:** `packages/domain/src/business-hours.ts`

```ts
export type BusinessCalendarConfig = {
  timezone: string;
  workdayStartMinute: number;
  workdayEndMinute: number;
  workdays: number[];
  holidays: Date[];
};

export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendarConfig;

export function isWorkingTime(at: Date, cal: BusinessCalendarConfig): boolean;

// Walk forward, skipping non-working time, until `hours` of working time have elapsed.
export function addBusinessHours(from: Date, hours: number, cal: BusinessCalendarConfig): Date;

export function businessHoursBetween(from: Date, to: Date, cal: BusinessCalendarConfig): number;
```

Then extend `calculateSlaDueAt` (`tickets.ts:64`) to take an optional calendar and a flag. **CRITICAL priority must always use wall-clock hours** — an outage does not wait for Monday. Encode that rule explicitly:

```ts
export function usesBusinessHours(priority: TicketPriority): boolean {
  return priority !== "CRITICAL";
}
```

**UI:** A calendar editor `Card` on `/settings`, admin only. On the ticket page, label the due date "Due (business hours)" or "Due (elapsed)" so nobody has to guess which clock applied.

**Acceptance criteria:**
1. A MEDIUM ticket created Friday at 16:00 with a 36-business-hour target lands on the correct following-week weekday, not Sunday.
2. CRITICAL tickets ignore the calendar entirely.
3. A ticket created outside working hours starts its clock at the next working-period start.
4. Configured holidays are skipped.
5. An organization without a `BusinessCalendar` row uses `DEFAULT_BUSINESS_CALENDAR` and behaves as today.
6. Existing tickets are not retroactively recalculated.
7. `addBusinessHours` and `businessHoursBetween` are inverse-consistent for whole-hour inputs.

**Tests required:** At minimum: mid-workday start; before-hours start; after-hours start; Friday evening spanning a weekend; a holiday inside the window; a zero-hour request; a request longer than a week. Pass fixed `Date` objects — never call `new Date()` inside a test assertion.

**Edge cases:** Timezones. The honest recommendation is to store the timezone but compute in UTC in v1 and write a `TODO` about DST, rather than pulling in a date library. Say this out loud in the PR — knowing the limit of what you built is the point.

---

## Story C3: Assignment routing rules

**Size:** L

**Story:** As a support manager, I want to define rules that route new tickets to the right team automatically, so that triage does not depend on whoever happens to be looking at the queue.

**Why this matters here:** A small rules engine: ordered conditions, first match wins, with a dry-run mode. It also replaces a piece of hardcoded logic — `ticketSummarizationAgent` already guesses an owner team in `ticket-summarization.ts:102` with an `if/else` chain that nobody can configure.

**Schema changes:**

```prisma
enum RoutingConditionField {
  CATEGORY
  PRIORITY
  TAG
  TITLE_CONTAINS
  DESCRIPTION_CONTAINS
  REQUESTER_EMAIL_DOMAIN
}

model RoutingRule {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  priorityOrder  Int          // lower runs first
  isActive       Boolean      @default(true)
  conditions     Json         // RoutingCondition[]
  assignTeamId   String?
  assignTeam     Team?        @relation("RoutedTeam", fields: [assignTeamId], references: [id])
  assignUserId   String?
  assignUser     User?        @relation("RoutedUser", fields: [assignUserId], references: [id])
  setPriority    TicketPriority?
  addTags        String[]     @default([])
  matchCount     Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, name])
  @@index([organizationId, isActive, priorityOrder])
}
```

**Domain work:** `packages/domain/src/routing.ts`

```ts
export const routingConditionSchema = z.object({
  field: z.enum(ROUTING_CONDITION_FIELDS),
  operator: z.enum(["equals", "contains", "in"]),
  value: z.string().min(1).max(200)
});

export const routingRuleSchema = z.object({
  name: z.string().min(3).max(80),
  priorityOrder: z.coerce.number().int().min(0).max(1000),
  conditions: z.array(routingConditionSchema).min(1).max(10),
  assignTeamId: z.string().nullable().optional(),
  assignUserId: z.string().nullable().optional(),
  setPriority: z.enum(TICKET_PRIORITIES).nullable().optional(),
  addTags: z.array(z.string()).max(5).default([]),
  isActive: z.boolean().default(true)
});

export type RoutingDecision = {
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  assignTeamId?: string | null;
  assignUserId?: string | null;
  setPriority?: TicketPriority | null;
  addTags: string[];
  evaluated: Array<{ ruleId: string; matched: boolean; failedCondition?: string }>;
};

// Pure. All conditions in a rule must match (AND). Rules are tried in priorityOrder; first match wins.
export function evaluateRoutingRules(
  ticket: { title: string; description: string; category: TicketCategory; priority: TicketPriority; tags: string[]; requesterEmail: string },
  rules: RoutingRule[]
): RoutingDecision;
```

The `evaluated` array is what makes this debuggable — it is the same idea as an agent trace. Do not skip it.

**Server actions:** CRUD for rules (`ADMIN`/`MANAGER` only, new capability `routing:manage`). Call `evaluateRoutingRules` inside `createTicketAction` **after** Zod validation and **only** when the submitter left team/user unset — an explicit human choice always wins over a rule.

**UI:** A `/settings/routing` page listing rules in evaluation order with a match count each. A rule editor form. A "Test a rule set" panel: paste a title/description/category, see which rule would match and why the others didn't.

**Acceptance criteria:**
1. A ticket matching a rule is created already assigned to that rule's team.
2. Rules evaluate in `priorityOrder`; the first match wins and later rules are not applied.
3. A rule with multiple conditions requires all of them.
4. Inactive rules are skipped.
5. An explicit team or user chosen on the create form overrides all routing.
6. A rule pointing at a team in another org is rejected at save time, not at match time.
7. `matchCount` increments on each application.
8. The audit event for a routed ticket records which rule fired.
9. The test panel never writes anything.

**Tests required:** `evaluateRoutingRules` — no rules; no match; single match; two matches (verify ordering); multi-condition partial match; inactive rule skipped; email-domain condition; tag condition against an empty tag array. This function should end up with the densest test coverage in the repo.

**Audit events:** `routing_rule.created` / `.updated` / `.deleted`, and `ticket.auto_routed`.

**Edge cases:** A rule assigning a user who is not on the assigned team. A rule that assigns to a deactivated user (there is no `isActive` on `User` today — note it). Circular intent (two rules that contradict) is resolved by ordering, which is why ordering is explicit.

---

## Story C4: First response time tracking

**Size:** M

**Story:** As a support manager, I want to see how long a customer waited for our first human reply, so that I can measure the thing customers actually feel.

**Why this matters here:** Resolution SLA is currently the only metric, and it is the lagging one. First response time is the leading indicator. Small schema change, meaningful product value, and it forces you to think about what counts as a "response".

**Schema changes:**

```prisma
// on Ticket
firstRespondedAt DateTime?
firstResponseDueAt DateTime?
```

**Domain work:** `packages/domain/src/tickets.ts`

```ts
const firstResponseHoursByPriority: Record<TicketPriority, number> = {
  CRITICAL: 0.5, HIGH: 2, MEDIUM: 8, LOW: 24
};

export function calculateFirstResponseDueAt(priority: TicketPriority, createdAt?: Date): Date;

// A public (non-internal) comment by a user other than the requester counts.
export function qualifiesAsFirstResponse(comment: { isInternal: boolean; authorEmail: string }, requesterEmail: string): boolean;

export function getFirstResponseState(params: {
  firstRespondedAt: Date | null;
  firstResponseDueAt: Date;
  now?: Date;
}): "met" | "pending" | "approaching" | "breached";
```

**Server actions:** `createTicketAction` sets `firstResponseDueAt`. `addTicketCommentAction` sets `firstRespondedAt` — but only once, only when `qualifiesAsFirstResponse` is true, and only if it is currently null.

**UI:** A "First Response" `Badge` on the ticket detail page and a column on `/tickets`. A dashboard `Metric` counting tickets pending first response past due.

**Acceptance criteria:**
1. Creating a ticket sets a first-response deadline derived from priority.
2. An **internal** note does not satisfy first response.
3. A public comment does satisfy it, and only the first one sets the timestamp.
4. A later comment never overwrites `firstRespondedAt`.
5. State is `met` once responded, regardless of lateness — with the actual response time shown so lateness is still visible.
6. Existing tickets with null fields render "Not tracked" rather than breaching.
7. If C1 has landed, first response respects pausing too.

**Tests required:** `qualifiesAsFirstResponse` — internal note, public comment from an agent, public comment from the requester's own email. `getFirstResponseState` — pending within window, approaching, breached, met-on-time, met-late.

**Audit events:** `ticket.first_response_recorded`.

**Edge cases:** A comment authored by the requester (some help desks let customers reply) — the guard on `authorEmail` handles it. A ticket created already resolved.

---

# Epic D — Job pipeline reliability

*The worker is a polling loop with optimistic claiming. It works, but it has no scheduling, no backoff, and no way to recover from a crashed worker.*

---

## Story D1: Scheduled jobs and exponential backoff

**Size:** M

**Story:** As a platform operator, I want failed jobs to retry automatically with increasing delay, so that transient failures recover on their own without hammering a struggling dependency.

**Why this matters here:** Today, a failed job sits in `FAILED` forever until a human clicks Retry, and `retryJobAction` re-queues it for immediate pickup. There is no delay, no jitter, and no way to say "run this in an hour". The `FAILED_JOB_INVESTIGATION` agent literally recommends "retry with exponential backoff and jitter" (`failed-job-investigation.ts:78`) — a capability the system does not have. Closing that gap is satisfying.

**Schema changes:**

```prisma
// on BackgroundJob
runAt         DateTime  @default(now())
lastAttemptAt DateTime?

@@index([status, runAt])
```

**Domain work:** `packages/domain/src/jobs.ts`

```ts
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 3_600_000;

// Deterministic: jitter is derived from the job id, not Math.random(), so it stays testable.
export function calculateBackoffMs(attempt: number, jobId: string): number;

export function nextRunAt(params: { attempt: number; jobId: string; now?: Date }): Date;

export function isJobDue(job: { status: JobStatus; runAt: Date }, now?: Date): boolean;
```

Deriving jitter from a hash of the job id rather than `Math.random()` is the interesting decision here: you get spread across jobs *and* reproducibility in tests. Explain that choice in your PR.

**Worker changes:** `claimNextJob` (`worker.ts:40`) must add `runAt: { lte: new Date() }` to both the `findFirst` and the conditional `updateMany`. On failure, instead of terminal `FAILED`, set `status: "RETRYING"`, `attempts: attempts + 1`, and `runAt: nextRunAt(...)` — unless `attempts + 1 >= maxAttempts`, in which case `DEAD_LETTERED` as today.

**Note the pre-existing bug you are touching:** retry accounting is currently split between `retryJobAction` and the worker (see document 01, section 11). Consolidate it — the worker owns `attempts`, and the manual retry action just sets `runAt: now` and `status: "RETRYING"` without incrementing. Call this out explicitly in the PR; it is a behavior change.

**UI:** Show "Next attempt at" on `/jobs/[id]` and a "Scheduled" column on `/jobs`. Add a `runAt`-aware filter: "Due now" vs "Scheduled".

**Acceptance criteria:**
1. A job whose `runAt` is in the future is never claimed by the worker.
2. A failing job is rescheduled with a delay that grows roughly exponentially per attempt.
3. Backoff is capped at `BACKOFF_MAX_MS`.
4. Two jobs failing at the same instant get different delays (jitter).
5. `calculateBackoffMs` is deterministic for a given `(attempt, jobId)`.
6. On the final attempt the job is dead-lettered, not rescheduled.
7. Manual retry makes the job due immediately and does not double-count the attempt.
8. Existing jobs default to `runAt = now` and behave as before.

**Tests required:** New `tests/jobs.test.ts` — backoff growth across attempts 1..10, the cap, determinism (same input twice), jitter difference across two ids, `isJobDue` for past/future/exact-now, and `nextRunAt` with an injected `now`.

**Audit events:** `job.rescheduled` with the attempt number and next run time.

**Edge cases:** Attempt 0 or negative. A `maxAttempts` of 1. Clock skew making `runAt` slightly in the past.

---

## Story D2: Stale job lease reaper and worker health page

**Size:** M

**Story:** As a platform operator, I want jobs abandoned by a crashed worker to be picked up again automatically, and I want to see whether a worker is alive, so that a deploy or a crash does not silently strand work.

**Why this matters here:** `BackgroundJob.lockedAt` and `lockedBy` are written by `claimNextJob` and then **never read by anything**. Kill the worker mid-job and that row is stuck in `RUNNING` forever, invisible on the jobs page as anything unusual. This is a real production failure mode and the fix is small.

**Schema changes:**

```prisma
model WorkerHeartbeat {
  id           String   @id @default(cuid())
  workerId     String   @unique
  lastSeenAt   DateTime @updatedAt
  processedCount Int    @default(0)
  startedAt    DateTime @default(now())
}
```

**Domain work:** `packages/domain/src/jobs.ts`

```ts
export const JOB_LEASE_MS = 300_000;        // 5 minutes
export const WORKER_STALE_MS = 60_000;      // 1 minute without a heartbeat

export function isLeaseExpired(job: { status: JobStatus; lockedAt: Date | null }, now?: Date): boolean;

export function workerHealth(w: { lastSeenAt: Date }, now?: Date): "healthy" | "stale" | "dead";
```

**Worker changes:** Before claiming, reclaim expired leases:

```ts
await prisma.backgroundJob.updateMany({
  where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - JOB_LEASE_MS) } },
  data: { status: "RETRYING", lockedAt: null, lockedBy: null }
});
```

Upsert a heartbeat each loop iteration and increment `processedCount` on success.

**UI:** A "Worker Health" `Card` on `/jobs` showing each worker, its status tone (healthy/stale/dead), last seen, and processed count. A `Metric` for jobs currently `RUNNING` with an expired lease.

**Acceptance criteria:**
1. A job left `RUNNING` with `lockedAt` older than the lease is returned to `RETRYING` and picked up again.
2. A job actively being worked (fresh `lockedAt`) is never reclaimed.
3. Reclaiming does not lose the attempt count.
4. The worker writes a heartbeat at least once per loop.
5. A worker not seen for over a minute shows as `stale`; over five, `dead`.
6. `/jobs` shows a visible warning when a stale lease exists.
7. Reclamation is audited so the trail explains why a job ran twice.

**Tests required:** `isLeaseExpired` — null `lockedAt`, fresh, exactly at the boundary, expired, non-`RUNNING` status. `workerHealth` across all three bands.

**Audit events:** `job.lease_reclaimed`.

**Edge cases:** **At-least-once delivery.** A reclaimed job may run twice — the original worker might still be alive and slow. Write this down in the PR and note which job types are idempotent. `AGENT_RUN` is safe (deterministic, overwrites its own output); a real email sender would not be.

---

## Story D3: Dead-letter review and bulk requeue

**Size:** M · **Depends on:** D1

**Story:** As a platform operator, I want to review dead-lettered jobs together, understand why they failed, and requeue a group of them with a documented reason, so that recovering from an outage is one deliberate action instead of forty clicks.

**Why this matters here:** Dead-lettering is currently a one-way door — `deadLetterJobAction` sets the status and nothing can bring a job back. After a dependency outage you might have 200 of them. This story adds the recovery path, plus the grouping that makes triage possible.

**Schema changes:**

```prisma
// on BackgroundJob
deadLetteredAt   DateTime?
deadLetterReason String?
requeuedFromId   String?
requeueCount     Int      @default(0)
```

**Domain work:** `packages/domain/src/jobs.ts`

```ts
export function canRequeueJob(job: { status: JobStatus; requeueCount: number }): boolean;

export const MAX_REQUEUES = 3;

// Group by (type + normalized error message) so 200 identical failures become one row.
export function groupDeadLetters<T extends { type: JobType; errorMessage: string | null }>(
  jobs: T[]
): Array<{ key: string; type: JobType; normalizedError: string; count: number; sample: T }>;
```

Normalize the error message the same way `createLogFingerprint` does (`domain/src/logs.ts:14`): lowercase, digits to `<n>`, hex ids to `<id>`. Reuse that helper rather than writing a second normalizer — this is a good moment to notice that grouping-by-normalized-text is now a pattern in this codebase.

**Server actions:** `requeueDeadLetterJobsAction(formData)` taking `jobIds[]` and a required `reason` (min 10 chars). Resets `status: "QUEUED"`, `attempts: 0`, `runAt: now`, increments `requeueCount`.

**UI:** A `/jobs/dead-letter` page listing grouped failures with counts, expandable to the individual jobs, with checkboxes and a requeue form requiring the reason. Link to it from `/jobs`.

**Acceptance criteria:**
1. Dead-lettered jobs are grouped by type plus normalized error, with an accurate count each.
2. Selecting a group and requeuing re-queues every job in it.
3. A reason under 10 characters is rejected before anything is written.
4. A job requeued `MAX_REQUEUES` times cannot be requeued again, and the UI explains why.
5. Requeuing resets `attempts` so the backoff ladder starts fresh.
6. Every requeued job gets its own audit event carrying the shared reason and `requestContextId`.
7. Only `ADMIN` and `ENGINEERING` (holders of `job:retry`) can requeue.
8. Requeuing 200 jobs is a single transaction and does not time out — chunk if you must.

**Tests required:** `groupDeadLetters` — identical errors collapse; errors differing only in numbers collapse; different types stay separate; null error message; empty list. `canRequeueJob` at and beyond the limit.

**Audit events:** `job.requeued` with `metadata: { reason, batchSize, requeueCount }`.

**Edge cases:** A job dead-lettered because its payload is malformed will just fail again — surface `FAILED_JOB_INVESTIGATION` output next to the group if one exists, so operators requeue with their eyes open.

---

# Epic E — Agent platform and knowledge reuse

*Three agents exist and run. Nothing evaluates whether their output is any good, nothing triggers them automatically, and there is nowhere to put the answer once a human works it out.*

---

## Story E1: Agent run replay and version diff

**Size:** M

**Story:** As an engineer changing an agent heuristic, I want to replay a stored run against the current agent version and see exactly what changed, so that I can tell whether my change was an improvement before shipping it.

**Why this matters here:** `AgentRun` already stores `inputSnapshot` and `agentVersion` — the raw material for this is sitting in the database unused. This is the story that turns "I tweaked a number and the tests still pass" into "here is the effect of my change on 40 real historical inputs." It is the highest-leverage story in this epic and it needs no new agent.

**Schema changes:**

```prisma
// on AgentRun
replayOfRunId String?
replayOf      AgentRun?  @relation("AgentReplays", fields: [replayOfRunId], references: [id])
replays       AgentRun[] @relation("AgentReplays")
isReplay      Boolean    @default(false)
```

Replays are `AgentRun` rows, so they inherit the whole existing detail page for free. Exclude them from `/agents` by default.

**Domain work:** `packages/agents/src/diff.ts`

```ts
export type AgentOutputDiff = {
  confidenceDelta: number;
  changedFields: Array<{ path: string; before: unknown; after: unknown }>;
  addedFindings: string[];
  removedFindings: string[];
  addedRecommendations: string[];
  removedRecommendations: string[];
  traceStepsBefore: number;
  traceStepsAfter: number;
  verdict: "identical" | "cosmetic" | "material";
};

export function diffAgentOutputs(before: AgentRunResult, after: AgentRunResult): AgentOutputDiff;
```

`verdict` is the judgement call: `identical` when deep-equal; `material` when confidence moved more than 5 points or any finding/recommendation was added or removed; `cosmetic` otherwise. Define it, test it, and be prepared to defend the thresholds.

**Server actions:** `replayAgentRunAction(formData)` with `agentRunId`. Loads the original, re-runs `runRegisteredAgent` with the stored `inputSnapshot` **synchronously** (agents are pure and fast — no worker needed), and stores the result as a new run with `isReplay: true`.

Also add `replayAllForAgentTypeAction`: replay the most recent N (cap at 50) runs of one agent type and show an aggregate — how many identical, cosmetic, material.

**UI:** A "Replay with current version" button on `/agents/[id]`. When a run has replays, a "Version Comparison" `Card` showing version numbers side by side, the confidence delta, and added/removed findings. A `/agents/replay` page for the bulk comparison with a summary `Metric` row.

**Acceptance criteria:**
1. Replaying a run whose agent is unchanged produces `verdict: "identical"`.
2. After changing a heuristic constant, replaying the same run produces `material` and names the changed fields.
3. The replay records both the original `agentVersion` and the current one.
4. The original run is never modified.
5. Replays are excluded from `/agents` unless "Show replays" is checked.
6. Replaying a `FAILED` run with no usable input snapshot fails with a clear message.
7. Bulk replay is capped and reports its aggregate accurately.
8. Replays are org-scoped like everything else.

**Tests required:** `diffAgentOutputs` — identical inputs; confidence moved 3 points (cosmetic); confidence moved 20 points (material); a finding added; a finding removed; nested output field changed; empty arrays on both sides.

**Audit events:** `agent.run_replayed`.

**Edge cases:** An `inputSnapshot` whose shape predates a change to the agent's input type — the agent may throw. Catch it and record the run as `FAILED` with the message, which is itself a useful signal that you made a breaking change.

**⚠ overlaps:** `docs/sprint-three` Story 3.2 (review agent recommendations) is about human approval of output. This is about regression-testing the agent itself. Complementary, not duplicate.

---

## Story E2: Log alert rules that open incidents automatically

**Size:** L

**Story:** As an engineer, I want a rule that watches a log fingerprint and opens an incident when it spikes, so that we find out from the system rather than from a customer.

**Why this matters here:** The anomaly agent already computes `shouldCreateIncident` (`log-anomaly.ts:75`) — and then nobody acts on it. It renders as text on a page a human has to visit. This story closes the loop from detection to action, and it is where you will confront the two hardest questions in alerting: how do you avoid firing the same alert forever, and how do you keep automation from doing something stupid at 3am.

**Schema changes:**

```prisma
model LogAlertRule {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  service        String?
  environment    LogEnvironment?
  level          LogLevel?
  fingerprint    String?
  thresholdCount Int          @default(5)
  windowMinutes  Int          @default(15)
  minAnomalyScore Int         @default(70)
  action         String       // "NOTIFY_ONLY" | "CREATE_INCIDENT"
  incidentSeverity IncidentSeverity @default(SEV3)
  cooldownMinutes Int         @default(60)
  isActive       Boolean      @default(true)
  lastFiredAt    DateTime?
  fireCount      Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, name])
  @@index([organizationId, isActive])
}

// on Incident
createdByRuleId String?
```

**Domain work:** `packages/domain/src/log-alerts.ts`

```ts
export const logAlertRuleSchema = z.object({ /* mirror the model, bound every number */ });

export type AlertEvaluation = {
  shouldFire: boolean;
  reason: string;
  matchedCount: number;
  inCooldown: boolean;
};

// Pure. Takes the already-counted matches; does not query.
export function evaluateLogAlertRule(params: {
  rule: { thresholdCount: number; cooldownMinutes: number; lastFiredAt: Date | null; isActive: boolean; minAnomalyScore: number };
  matchedCount: number;
  anomalyScore: number;
  now?: Date;
}): AlertEvaluation;
```

**Worker changes:** Add a `LOG_ALERT_EVALUATION` job type (remember: three places for the enum). The worker, on that job, loads active rules, counts matching logs in the window, runs the anomaly agent on them, calls `evaluateLogAlertRule`, and on a fire either creates an incident linked to the matching logs or writes notifications (Story A5) if that landed.

The evaluation job needs to be enqueued periodically. Without a scheduler, the pragmatic answer is a "Evaluate now" button plus a documented `runAt`-based self-rescheduling job (each evaluation job enqueues the next one 5 minutes out, using D1's `runAt`). That is a neat trick and worth building deliberately.

**UI:** A `/settings/alerts` page for rule CRUD, showing `lastFiredAt` and `fireCount` per rule. A "Create incident from this fingerprint" button on `/logs` and `/logs/[id]` that prefills the incident form with the service, a generated title, and the matching log ids — this is the manual version of the same action and is worth having regardless.

**Acceptance criteria:**
1. A rule with threshold 5 does not fire at 4 matching logs and does fire at 5.
2. After firing, the rule does not fire again within its cooldown even if the condition persists.
3. A fired `CREATE_INCIDENT` rule creates exactly one incident, links the matching logs to it, and stamps `createdByRuleId`.
4. `NOTIFY_ONLY` rules never create incidents.
5. Inactive rules are never evaluated.
6. A rule that would fire but whose anomaly score is below `minAnomalyScore` does not fire, and the reason says so.
7. Evaluation is org-scoped: a rule never counts another tenant's logs.
8. Auto-created incidents are clearly marked as automated in the UI and in the audit trail.
9. Manually creating an incident from a log fingerprint prefills correctly and links the logs.

**Tests required:** `evaluateLogAlertRule` — below threshold; exactly at threshold; above threshold but in cooldown; cooldown expired; inactive rule; anomaly score below minimum; `lastFiredAt` null (never fired).

**Audit events:** `alert_rule.created` / `.updated` / `.fired`, `incident.auto_created`.

**Edge cases:** A flapping condition — cooldown is your only defense in v1; note that a proper implementation needs hysteresis. An auto-created incident for a fingerprint that already has an open auto-created incident: check before creating, or you will generate dozens.

**⚠ overlaps:** `docs/sprint-three` Story 3.1 automates SLA escalation. Same *shape* of problem (background evaluation, threshold, action), different trigger. If 3.1 is ever built, factor out the shared evaluation-job scaffolding.

---

## Story E3: Knowledge base with article suggestions on tickets

**Size:** L

**Story:** As a support agent, I want relevant help articles suggested on the ticket I am reading, and I want to attach the one I used, so that repeat questions get consistent answers and we can see which articles actually resolve tickets.

**Why this matters here:** It is the largest greenfield story here — a new entity with its own lifecycle, full-text search, and a feedback loop that measures whether the content is working. It also composes cleanly with B3's similarity scoring, so you get to reuse your own code.

**Schema changes:**

```prisma
enum ArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model KnowledgeArticle {
  id             String        @id @default(cuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id])
  title          String
  body           String
  summary        String
  category       TicketCategory?
  tags           String[]      @default([])
  status         ArticleStatus @default(DRAFT)
  authorId       String?
  author         User?         @relation("AuthoredArticles", fields: [authorId], references: [id])
  viewCount      Int           @default(0)
  linkCount      Int           @default(0)
  publishedAt    DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  links          TicketArticleLink[]

  @@index([organizationId, status, category])
}

model TicketArticleLink {
  id         String           @id @default(cuid())
  ticketId   String
  ticket     Ticket           @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  articleId  String
  article    KnowledgeArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  linkedById String?
  linkedBy   User?            @relation("ArticleLinks", fields: [linkedById], references: [id])
  wasHelpful Boolean?
  createdAt  DateTime         @default(now())

  @@unique([ticketId, articleId])
}
```

**Domain work:** `packages/domain/src/knowledge.ts`

```ts
export const articleSchema = z.object({
  title: z.string().min(5).max(160),
  summary: z.string().min(20).max(400),
  body: z.string().min(50).max(20000),
  category: z.enum(TICKET_CATEGORIES).optional().nullable(),
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
  status: z.enum(ARTICLE_STATUSES).default("DRAFT")
});

export const allowedArticleTransitions: Record<ArticleStatus, ArticleStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["DRAFT"]
};

export function assertArticleTransition(from: ArticleStatus, to: ArticleStatus): void;

// Reuse the token-overlap approach from B3.
export function scoreArticleRelevance(
  ticket: { title: string; description: string; category: TicketCategory; tags: string[] },
  article: { title: string; summary: string; tags: string[]; category: TicketCategory | null }
): { score: number; reasons: string[] };
```

Model the status lifecycle on the existing `allowedTicketTransitions` pattern (`tickets.ts:34`) — same shape, same assert helper, same test style. Consistency with the codebase is part of the grade.

**Server actions:** Article CRUD plus `publishArticleAction` / `archiveArticleAction`. `linkArticleToTicketAction` (increments `linkCount`). `rateArticleLinkAction` setting `wasHelpful`.

**UI:** `/knowledge` list with search and status filter; `/knowledge/[id]` detail; `/knowledge/new`. On `/tickets/[id]`, a "Suggested Articles" `Card` showing the top three published articles by relevance, each with "Attach" — and once attached, thumbs up/down.

**Acceptance criteria:**
1. Only `PUBLISHED` articles are ever suggested on a ticket.
2. Suggestions are ordered by relevance score, and each shows why it matched.
3. Attaching an article increments `linkCount` and appears on both the ticket and the article.
4. The same article cannot be attached to the same ticket twice.
5. Article status follows the transition table; invalid transitions throw.
6. Publishing stamps `publishedAt` once and does not re-stamp on later edits.
7. Search matches title, summary, and tags, case-insensitively.
8. Articles are org-scoped.
9. `VIEWER` can read articles but not create, edit, or attach them.
10. The article detail page shows which tickets used it and the helpful/not-helpful split.

**Tests required:** `assertArticleTransition` across the matrix including the illegal jumps. `scoreArticleRelevance` — exact category and tag match; title overlap only; no overlap; empty tags on both sides.

**Audit events:** `article.created` / `.updated` / `.published` / `.archived`, `ticket.article_linked`.

**Edge cases:** Archiving an article attached to open tickets — keep the link, mark it archived in the UI. Search across a 20k-character body will be slow with `contains`; search title/summary/tags only in v1 and write a `TODO` about Postgres full-text search.

**Out of scope:** Public-facing article portal, versioning, rich text, multi-language.

---

# Epic F — Analytics and external surface

---

## Story F1: Team and agent performance analytics

**Size:** L · **Depends on:** C1 and C4 for the metrics to be meaningful

**Story:** As a support manager, I want a page showing throughput, SLA attainment, and first response time by team and by person over a date range, so that I can staff and coach based on numbers instead of impressions.

**Why this matters here:** This is your aggregation-query story. Everything so far has been "fetch rows and render them"; this is "compute over rows efficiently," which is a different skill and where naive code gets slow fast.

**Schema changes:** None. This story is read-only — which is exactly why it is a good one: all the value comes from queries and framing.

**Domain work:** `packages/domain/src/analytics.ts`

```ts
export type PeriodBucket = { start: Date; end: Date; label: string };

export function buildBuckets(from: Date, to: Date, granularity: "day" | "week"): PeriodBucket[];

export type SlaAttainment = { total: number; met: number; breached: number; attainmentPct: number };

export function summarizeSlaAttainment(
  tickets: Array<{ status: TicketStatus; slaDueAt: Date; resolvedAt: Date | null; slaPausedTotalMs?: number }>,
  now?: Date
): SlaAttainment;

export function percentile(values: number[], p: number): number;

export function median(values: number[]): number;
```

Keep all the math pure and in `packages/domain`. The page's job is to fetch and hand off.

**Query approach:** Use `prisma.ticket.groupBy` for counts by team/status/priority rather than fetching rows and reducing in JavaScript. For resolution-time percentiles you do need the rows — bound the query with a date range and a `take`, and say in the code comment why. Do not repeat the dashboard's mistake of loading everything.

**UI:** `/analytics` with a date-range filter (default: last 30 days), a `Metric` row (tickets created / resolved / SLA attainment / median resolution time / median first response), a per-team `DataTable`, a per-assignee `DataTable`, and a simple bucketed volume table. Restrict to `ADMIN` and `MANAGER`.

**Acceptance criteria:**
1. All figures respect the selected date range and the active organization.
2. SLA attainment counts only tickets resolved within the range, and the denominator is stated on screen.
3. Median and p90 resolution times are correct, including for an even-sized sample.
4. A team with no tickets in range renders as zero, not as a missing row or a `NaN`.
5. An empty range renders an `EmptyState`, not a broken table.
6. The page issues a bounded number of queries — no query inside a `.map()`.
7. `SUPPORT_AGENT` and `VIEWER` cannot reach the page.
8. Paused SLA time (C1) is excluded from resolution-time figures.

**Tests required:** `percentile` — empty array, single value, even count, odd count, p50/p90/p99. `median` on even and odd. `buildBuckets` — a single day, a partial week, a range crossing a month boundary, `from === to`. `summarizeSlaAttainment` — all met, all breached, mixed, empty.

**Edge cases:** Division by zero everywhere — guard every percentage. Timezones: compute in UTC and label the page as UTC.

**⚠ overlaps:** `docs/sprint-three` Story 3.3 proposes an operations analytics dashboard. **Read it before starting.** This story is the team-and-person cut of the same idea; if you build 3.3 first, extend it rather than adding a second page.

---

## Story F2: Read-only REST API with scoped API keys

**Size:** L

**Story:** As an integrator, I want an authenticated read-only HTTP API for tickets and incidents, so that our internal dashboards can consume this data without screen-scraping.

**Why this matters here:** The README lists "no separate public REST API" as a known limitation. Adding one forces you to think about a second authentication path, hashed credential storage, rate limiting, and stable response shapes — a genuinely different set of concerns from cookie-based server actions, and the most interview-relevant story in the backlog.

**Schema changes:**

```prisma
model ApiKey {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  keyPrefix      String       @unique   // first 8 chars, shown in the UI
  keyHash        String                 // sha256 of the full key — never store the key itself
  scopes         String[]     @default(["read:tickets"])
  createdById    String?
  createdBy      User?        @relation("ApiKeys", fields: [createdById], references: [id])
  lastUsedAt     DateTime?
  requestCount   Int          @default(0)
  expiresAt      DateTime?
  revokedAt      DateTime?
  createdAt      DateTime     @default(now())

  @@index([organizationId, revokedAt])
}
```

**Domain work:** `packages/domain/src/api-keys.ts`

```ts
export const API_SCOPES = ["read:tickets", "read:incidents", "read:logs", "read:jobs"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function generateApiKey(): { key: string; prefix: string; hash: string };
export function hashApiKey(key: string): string;   // node:crypto sha256, hex

export function isApiKeyUsable(k: { revokedAt: Date | null; expiresAt: Date | null }, now?: Date): boolean;
export function hasScope(scopes: string[], required: ApiScope): boolean;
```

**Route handlers:** `apps/web/app/api/v1/tickets/route.ts` and `.../tickets/[id]/route.ts`, plus incidents. These are Next.js Route Handlers, **not** server actions — a different primitive, and worth understanding as such.

Put the shared work in `apps/web/lib/api-auth.ts`:

```ts
export async function authenticateApiRequest(
  request: Request,
  required: ApiScope
): Promise<{ organizationId: string; apiKeyId: string } | { error: Response }>;
```

Read `Authorization: Bearer <key>`, hash it, look up by prefix, compare hashes with a timing-safe comparison, check usability and scope, bump `lastUsedAt`/`requestCount`.

**Response shape:** Version it and keep it stable. Never leak internal ids of other tenants, and never return `AuditEvent` data.

```json
{ "data": [ { "id": "...", "title": "...", "status": "NEW", "priority": "HIGH",
              "slaDueAt": "2026-...", "assignee": { "name": "..." } } ],
  "pagination": { "page": 1, "pageSize": 50, "total": 137 } }
```

**UI:** An "API Keys" `Card` on `/settings`, admin only. Creating a key shows the full value **exactly once** with a clear warning; after that only the prefix. A revoke button per key.

**Acceptance criteria:**
1. A request with no `Authorization` header gets `401` with a JSON error body.
2. An invalid, revoked, or expired key gets `401`.
3. A valid key without the required scope gets `403`.
4. A valid key returns only its own organization's records — verify this explicitly with a test against the two seeded orgs.
5. The full key value is displayed exactly once at creation and is not recoverable afterward.
6. The database stores only a hash and a prefix. Grep the schema and the logs to confirm the raw key appears nowhere.
7. Endpoints are paginated and cap `pageSize`.
8. `lastUsedAt` and `requestCount` update on each successful request.
9. Every endpoint is read-only — `POST`/`PATCH`/`DELETE` return `405`.
10. API responses never include another tenant's data even when an id is guessed correctly (return `404`, not `403`, so ids cannot be probed).

**Tests required:** `generateApiKey` produces a prefix matching the key's start and a hash that `hashApiKey` reproduces. `isApiKeyUsable` — active, revoked, expired, expiring in future, both null. `hasScope` — present, absent, empty array.

**Audit events:** `api_key.created` / `.revoked`. Consider **not** auditing every API read — say why in the PR (volume). This is a real judgement call operators make.

**Edge cases:** Rate limiting is out of scope for v1, but write the `TODO` and note where it would go. Use `crypto.timingSafeEqual` for the hash comparison and explain why in a comment.

---

## Appendix: Ideas not specified here

Worth doing eventually; deliberately left unspecified so they can be scoped when they become relevant.

- **Outbound webhook subscriptions** — org-registered endpoints, delivered through the existing `WEBHOOK_DELIVERY` job type. Pairs naturally with D1's backoff.
- **CSAT survey on resolution** — a rating and a comment captured when a ticket resolves.
- **Attachments** — local disk storage, no S3, with strict MIME and size limits.
- **On-call schedules** — who owns an incident right now, by rotation.
- **Public status page** — read-only incident timeline on an unauthenticated route.
- **Global search** — one server-rendered page across tickets, incidents, logs, and jobs.
- **Loading and not-found states** — `loading.tsx` and `not-found.tsx` for every route. A genuinely good first ticket that document 01 flags as missing.
- **CI and migrations** — `docs/sprint-five` Stories 5.1 and 5.2, both still unimplemented. Arguably should be done before any of the above.
