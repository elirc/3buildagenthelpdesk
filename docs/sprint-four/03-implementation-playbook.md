# Sprint Four Implementation Playbook

## Before Coding

Run:

```bash
npm run test
npm run typecheck
```

Read:

- `apps/web/lib/auth.ts`
- `apps/web/lib/actions.ts`
- `packages/domain/src/permissions.ts`
- `packages/db/prisma/schema.prisma`
- `packages/observability/src/index.ts`

Write down:

- Which pages query records directly.
- Which actions mutate by ID.
- Which records need organization scope.

## Slice 1: Auth Provider Boundary

1. Create a small auth provider interface.
2. Move cookie-based user switching into a local demo provider.
3. Make `getCurrentUser` call the provider.
4. Add an environment guard so the unrestricted switcher is clearly demo-only.
5. Update settings docs or page copy to identify demo auth.

Checkpoint:

```bash
npm run typecheck
```

## Slice 2: Organization Model

1. Add `Organization` to Prisma.
2. Add `organizationId` to users and teams.
3. Add `organizationId` to tickets, incidents, logs, jobs, agent runs, and audit events.
4. Add indexes.
5. Generate Prisma client.
6. Update seed data with two organizations.

Commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Slice 3: Query Scoping

1. Start with tickets.
2. Add organization scope to ticket list and detail queries.
3. Repeat for incidents, logs, jobs, agents, and audit.
4. Use `notFound()` for inaccessible detail pages.
5. Keep scope in Prisma `where`, not after fetching.

Review prompt:

- Could a user learn that another organization's record exists?

## Slice 4: Mutation Scoping

1. Add resource access helpers.
2. Update ticket actions first.
3. Update incident actions.
4. Update job actions.
5. Update agent-run actions.
6. Add tests for cross-organization denial.

Keep role checks and resource checks separate. That makes failures easier to reason about.

## Slice 5: Redaction By Default

1. Expand sensitive key detection.
2. Add nested redaction if feasible.
3. Apply redaction in `writeAuditEvent`.
4. Apply redaction to structured log creation.
5. Add tests for sensitive metadata.

Example test cases:

- `apiKey`
- `authorization`
- `sessionToken`
- nested `credentials.secret`

## Slice 6: Security Review UI

1. Add role capability matrix.
2. Add audit filters.
3. Show active auth provider.
4. Hide admin-only views from non-admin users.
5. Add manual QA notes.

## Final Verification

Run:

```bash
npm run db:generate
npm run test
npm run typecheck
npm run build
```

Manual QA:

- Demo user can still use the app.
- User in organization A cannot see organization B tickets.
- Unauthorized mutation by ID fails.
- Audit metadata redacts secrets.
- Admin can review audit filters.

## PR Description Template

```md
## Summary
- Added auth provider boundary.
- Added organization scope to core records.
- Added resource-level authorization checks.
- Added default audit/log metadata redaction.
- Added security review views and audit filters.

## Tests
- npm run db:generate
- npm run test
- npm run typecheck
- npm run build

## Risk
- Organization scope touches many queries. I manually checked list and detail routes for tickets, incidents, logs, jobs, agents, and audit.
```

