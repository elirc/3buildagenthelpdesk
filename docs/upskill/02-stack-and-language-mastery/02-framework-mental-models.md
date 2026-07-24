# Framework Mental Models

## Next.js App Router

Concept: App Router pages are components mapped by filesystem routes. In this repo, pages are server-rendered and can query Prisma directly.

Repo examples:

- Dashboard route `/`: `apps/web/app/page.tsx:9-167`.
- Ticket list `/tickets`: `apps/web/app/tickets/page.tsx:8-116`.
- Ticket detail `/tickets/[id]`: `apps/web/app/tickets/[id]/page.tsx:15-269`.
- Root layout and navigation: `apps/web/app/layout.tsx:15-74`.

Why it matters:

- Server components can access the database, but they also run per request.
- Forms can post to server actions, such as `createTicketAction` at `apps/web/lib/actions.ts:41-89`.
- `dynamic = "force-dynamic"` appears on pages to avoid static assumptions, for example `apps/web/app/page.tsx:7`.

Failure modes:

- Query too much data in page components.
- Treat server components like API boundaries.
- Forget that URL search params are untrusted input, as in `apps/web/app/logs/page.tsx:14-21`.

## React Component Model

Concept: React components compose UI from props. In this repo, shared UI primitives are simple server-compatible components.

Repo examples:

- `Card`, `Button`, `Badge`, `DataTable` in `packages/ui/src/index.tsx:18-66`.
- Form controls in `packages/ui/src/index.tsx:81-134`.
- JSON debug view in `packages/ui/src/index.tsx:154-156`.

Why it matters:

- A design system reduces drift.
- Server-compatible components avoid client-side state unless needed.
- Props are contracts; keep them small.

Failure modes:

- Putting business rules into visual components.
- Making UI components too generic too early.
- Forgetting accessibility on tables, labels, and buttons.

## Server Actions

Concept: Server actions are server-side functions invoked from forms.

Repo examples:

- `createTicketAction`: `apps/web/lib/actions.ts:41-89`.
- `updateTicketAction`: `apps/web/lib/actions.ts:92-161`.
- `runTicketAgentAction`: `apps/web/lib/actions.ts:327-368`.
- `retryJobAction`: `apps/web/lib/actions.ts:418-450`.

Why it matters:

- They are the application-service layer here.
- They must validate, authorize, persist, audit, and revalidate.

Failure modes:

- Returning framework errors directly to users.
- Skipping authorization because the button is hidden.
- Letting server actions grow into giant files without extracted services.

## Prisma Mental Model

Concept: Prisma maps TypeScript queries to database operations using schema-generated types.

Repo examples:

- Prisma datasource: `packages/db/prisma/schema.prisma:5-7`.
- Prisma client singleton: `packages/db/src/index.ts:1-13`.
- Ticket query with includes: `apps/web/app/tickets/[id]/page.tsx:17-27`.

Failure modes:

- Unbounded queries.
- Missing transactions for multi-write operations.
- Generic JSON fields with no runtime schema.

## Drill

Trace a form submit from JSX to server action to Prisma. Use ticket creation or job retry.

Self-grade:

- Basic: names the files.
- Solid: explains server/client boundary.
- Strong: identifies what is trusted and untrusted at each step.
