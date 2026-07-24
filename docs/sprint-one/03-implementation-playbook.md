# Sprint One Implementation Playbook

This playbook is intentionally ordered. Follow it one slice at a time.

## Before Coding

Run:

```bash
npm run test
npm run typecheck
```

Read:

- `apps/web/app/tickets/page.tsx`
- `apps/web/app/tickets/[id]/page.tsx`
- `apps/web/lib/actions.ts`
- `packages/domain/src/tickets.ts`
- `packages/domain/src/permissions.ts`

Write down:

- Where the active user is loaded.
- Where ticket updates currently write audit events.
- Which package owns SLA state.

## Slice 1: Status Reason Domain Rule

1. Open `packages/domain/src/tickets.ts`.
2. Add `requiresTicketStatusReason`.
3. Add `validateTicketStatusReason`.
4. Export the helpers from `packages/domain/src/index.ts` if needed.
5. Add tests in `tests/domain.test.ts`.
6. Run `npm run test`.

Review questions:

- Is this rule independent of React?
- Could another interface reuse it later?
- Does the test name describe behavior rather than implementation?

## Slice 2: Status Reason In The Edit Form

1. Open `apps/web/app/tickets/[id]/page.tsx`.
2. Add a `TextArea` or `TextInput` named `statusReason`.
3. Place it near the status selector.
4. Keep the copy concise.
5. Do not add client-side conditional rendering for the first version.

Expected field name:

```tsx
<TextArea name="statusReason" rows={3} />
```

Manual check:

- The form still submits without JavaScript.
- Existing fields preserve their default values.

## Slice 3: Enforce Status Reason In The Server Action

1. Open `apps/web/lib/actions.ts`.
2. Import the new domain helper.
3. Read `statusReason` from `formData`.
4. Validate after `nextStatus` is known and before `prisma.ticket.update`.
5. Store the trimmed reason in audit metadata when status changes.

Important:

- Do not require a reason for title or description edits.
- Do not store the entire form payload in audit metadata.
- Keep the thrown error human-readable.

## Slice 4: Claim Ticket Action

1. Add `claimTicketAction` to `apps/web/lib/actions.ts`.
2. Use `getCurrentUser`.
3. Require `ticket:update`.
4. Load the ticket before updating.
5. Update `assignedUserId` to the active user.
6. Write `ticket.claimed`.
7. Revalidate `/tickets` and `/tickets/${ticketId}`.

Then update `apps/web/app/tickets/[id]/page.tsx`:

- Import the new action.
- Show `Claim Ticket` when the ticket is unassigned and the user can write.
- Use a hidden `ticketId` field.

## Slice 5: Ticket List Filters

1. Extend the `searchParams` type in `apps/web/app/tickets/page.tsx`.
2. Load the current user if `ownership=mine` is supported.
3. Add Prisma `where` filters for direct fields.
4. Apply SLA filtering after fetching if `sla` is present.
5. Add controls to the filter bar.

Recommended query values:

- `ownership=all`
- `ownership=mine`
- `ownership=unassigned`
- `sla=healthy`
- `sla=approaching`
- `sla=breached`
- `sla=resolved`

## Slice 6: Unified Activity Timeline

1. Fetch comments and audit events on the ticket detail page.
2. Map them into a shared display shape.
3. Sort by timestamp descending or ascending, then keep it consistent.
4. Render type, actor, time, and content.
5. Keep the existing data available until the unified timeline is working.

Example display shape:

```ts
type TicketTimelineItem = {
  id: string;
  kind: "comment" | "audit";
  at: Date;
  actor: string;
  label: string;
  body?: string;
};
```

## Final Verification

Run:

```bash
npm run test
npm run typecheck
npm run build
```

Manual QA:

- Filter tickets by unassigned.
- Filter tickets by mine using each demo user.
- Claim an unassigned ticket.
- Move a ticket to escalated without a reason and confirm it fails.
- Move a ticket to escalated with a reason and confirm audit metadata exists.
- Confirm viewer users cannot claim or edit.

## PR Description Template

```md
## Summary
- Added ticket triage ownership and SLA filters.
- Added claim ticket action.
- Required reasons for major ticket status changes.
- Combined ticket comments and audit events into one activity timeline.

## Tests
- npm run test
- npm run typecheck
- npm run build

## Risk
- SLA filtering is computed in app code for now and may need database support later.
```

