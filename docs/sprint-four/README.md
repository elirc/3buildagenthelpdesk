# Sprint Four: Enterprise Security and Access Control

Sprint Four moves the app from a training-friendly user switcher toward enterprise-grade identity, authorization, and data boundaries. The current app intentionally simulates authentication with an active-user cookie. That is useful for learning, but a production internal platform needs real identity, scoped access, safer audit trails, and clearer security controls.

## Sprint Goal

Enterprise users can authenticate through a real identity boundary, access only the records they are allowed to see, and rely on audit trails that are useful for security review.

## Feature Set

- Replace local active-user switching with an authentication adapter boundary.
- Add organization or account scoping to tickets, incidents, logs, jobs, and users.
- Add resource-level authorization helpers beyond coarse role checks.
- Add sensitive-data redaction to audit and log metadata writes.
- Add security review pages for access, role capability matrix, and audit search.
- Add tests for role, tenant, and resource authorization.

## Why This Sprint Comes Fourth

Sprints One through Three make the product workflow richer. Sprint Four asks the harder production question: who is allowed to see or mutate each workflow? This is where a junior engineer learns that enterprise features are not just new screens. They are invariants that must be enforced at every mutation and query boundary.

## Learning Outcomes

By the end of Sprint Four, the learner should be able to:

- Explain the difference between authentication, role authorization, and resource authorization.
- Add a tenant or organization boundary without relying only on UI filters.
- Write permission tests that protect server actions.
- Recognize sensitive data in logs, audit events, and exports.
- Design an identity adapter that can support local demo users and real providers later.
- Explain why security checks belong on the server even when the UI hides controls.

## Primary Files

- `apps/web/lib/auth.ts`
- `apps/web/lib/actions.ts`
- `apps/web/lib/audit.ts`
- `packages/domain/src/permissions.ts`
- `packages/db/prisma/schema.prisma`
- `packages/observability/src/index.ts`
- `apps/web/app/settings/page.tsx`
- `apps/web/app/audit/page.tsx`
- `tests/domain.test.ts`

## Sprint Definition Of Done

- The code has an identity-provider boundary, even if the first provider remains local.
- Organization or account scope is present on core business records.
- Server actions enforce resource-level access.
- List pages filter by allowed scope.
- Audit and log metadata are redacted consistently before persistence.
- Permission tests cover key role and scope combinations.
- Security docs describe what is production-ready and what remains demo-only.

