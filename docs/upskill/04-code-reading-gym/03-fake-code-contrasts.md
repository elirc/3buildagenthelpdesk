# Fake Code Contrasts

Each example is illustrative fake code, not from this repo.

## Contrast 1: Coupling UI Shape To DB Shape

```ts
// Illustrative fake code: not from this repo.
await prisma.ticket.create({ data: Object.fromEntries(formData) });
```

Better:

```ts
// Illustrative fake code: adapt to the repo.
const parsed = createTicketSchema.parse(readForm(formData));
await prisma.ticket.create({ data: toTicketCreateInput(parsed) });
```

Repo pattern: `apps/web/lib/actions.ts:46-77`.

## Contrast 2: Missing Permission Check

```ts
// Illustrative fake code: not from this repo.
export async function retry(formData: FormData) {
  await prisma.backgroundJob.update({ where: { id }, data: { status: "RETRYING" } });
}
```

Better: check `requireCapability` like `apps/web/lib/actions.ts:419-421`.

## Contrast 3: Trusting Disabled Buttons

```tsx
// Illustrative fake code: not from this repo.
<button disabled={!canRetry}>Retry</button>
```

Better: UI disabled state plus server check. Repo does this at `apps/web/app/jobs/[id]/page.tsx:65-68` and `apps/web/lib/actions.ts:424-427`.

## Contrast 4: Swallowing Errors

```ts
// Illustrative fake code: not from this repo.
try { await updateTicket(); } catch {}
```

Better: catch only when a safe fallback is intentional. Compare `apps/web/lib/auth.ts:11-19`, where missing DB returns no users for build tolerance. Do not copy this pattern into mutations.

## Contrast 5: Overusing `any`

```ts
// Illustrative fake code: not from this repo.
function showOutput(output: any) {
  return output.findings.map(String);
}
```

Better: narrow unknown like `apps/web/app/agents/[id]/page.tsx:9-21`.

## Contrast 6: Side Effects Without Audit

```ts
// Illustrative fake code: not from this repo.
await prisma.ticket.update({ where: { id }, data });
```

Better: persist change and audit before/after like `apps/web/lib/actions.ts:129-146`.

## Contrast 7: N+1 Query

```ts
// Illustrative fake code: not from this repo.
const tickets = await prisma.ticket.findMany();
for (const t of tickets) t.assignedUser = await prisma.user.findUnique(...);
```

Better: include relations in one query like `apps/web/app/tickets/page.tsx:25-29`.

## Contrast 8: Changing Public Contracts Casually

```ts
// Illustrative fake code: not from this repo.
export const TICKET_STATUSES = ["NEW", "DONE"] as const;
```

Better: update shared constants, Prisma enum, domain transitions, UI labels, seed data, and tests. Anchors: `packages/shared/src/index.ts:4-13`, `packages/db/prisma/schema.prisma:18-26`, `packages/domain/src/tickets.ts:34-42`.

## Contrast 9: Agent Mutates Data Directly

```ts
// Illustrative fake code: not from this repo.
agent.run = async () => prisma.ticket.update(...);
```

Better: keep agents pure and persist runs in application service. Anchors: `packages/agents/src/types.ts:33-39`, `apps/web/lib/actions.ts:256-325`.

## Contrast 10: Unbounded Operational Query

```ts
// Illustrative fake code: not from this repo.
const logs = await prisma.structuredLog.findMany();
```

Better: filter and cap. Repo caps logs at `apps/web/app/logs/page.tsx:27-28`, though it still needs time-window filters.
