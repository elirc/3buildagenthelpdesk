# Sprint Four User Stories

## Epic: Enterprise Identity And Data Boundaries

Enterprise operators need confidence that users can access the right records and only the right records. This sprint introduces the access-control groundwork required before the app could hold real customer or operational data.

### Story 4.1: Add An Authentication Adapter Boundary

As a platform engineer, I want authentication behind an adapter so the app can use local demo users in development and a real provider in production.

Acceptance criteria:

- `getCurrentUser` delegates to an auth provider interface.
- A local provider preserves the current demo workflow.
- The interface can later support OIDC, SAML, or a managed identity provider.
- Production mode does not expose unrestricted user switching.
- Auth failures produce a clear unauthenticated state.

Implementation notes:

- Start with `apps/web/lib/auth.ts`.
- Keep the provider interface small.
- Do not add a real external provider in this sprint unless the team has credentials and environment needs.

### Story 4.2: Add Organization Scope

As an enterprise admin, I want records scoped to an organization so data from one customer or business unit cannot leak to another.

Acceptance criteria:

- Add an `Organization` model.
- Users belong to an organization.
- Tickets, incidents, logs, jobs, teams, agent runs, and audit events are organization-scoped.
- Seed data creates at least two organizations.
- Existing pages only show records in the active user's organization unless the user is a platform admin.

Implementation notes:

- Decide whether `ADMIN` means organization admin or platform admin.
- Prefer explicit `organizationId` fields over inferring scope through team or ticket relations.
- Add indexes for `organizationId` on high-traffic tables.

### Story 4.3: Enforce Resource-Level Authorization

As a security reviewer, I want server actions to check resource access so users cannot mutate records by submitting arbitrary IDs.

Acceptance criteria:

- Server actions verify the user can access the target record before mutation.
- Ticket, incident, job, and agent actions use shared access helpers.
- Unauthorized access throws a clear error and writes no business mutation.
- Tests cover cross-organization access denial.
- UI controls still reflect permissions, but UI is not the enforcement layer.

Implementation notes:

- Extend `packages/domain/src/permissions.ts` or create a related access-policy module.
- Keep database lookups in app services, not pure domain helpers.
- Separate "has role capability" from "can access this resource".

### Story 4.4: Redact Sensitive Metadata Before Persistence

As a compliance engineer, I want sensitive metadata redacted before it is stored in logs or audit events.

Acceptance criteria:

- Audit metadata is redacted by default.
- Structured log metadata is redacted by default.
- Keys such as password, token, secret, apiKey, authorization, cookie, and session are redacted.
- Tests cover nested metadata if nested redaction is implemented.
- Redaction behavior is documented.

Implementation notes:

- A helper already exists in `packages/observability/src/index.ts`.
- Decide whether to expand it to nested objects.
- Apply it in `writeAuditEvent` and any future log ingestion helper.

### Story 4.5: Add Security Review Views

As an admin, I want to inspect access configuration and audit activity so I can review the system's security posture.

Acceptance criteria:

- Settings or a new security page shows role capabilities.
- Audit page supports filters by actor, action, entity type, and date range.
- The page explains which auth provider is active.
- Admin-only content is hidden from non-admin users.
- Search and filters are URL-based.

Implementation notes:

- Do not expose secrets or environment variable values.
- Use labels and summaries rather than dumping raw auth config.

## Nonfunctional Requirements

- No page should rely on client-side security filtering.
- Organization scope should be applied before pagination.
- Audit events should never store raw secret values.
- Cross-organization access must be tested.
- Demo mode should remain convenient for learning.

## Out Of Scope

- Full SSO setup.
- SCIM provisioning.
- Fine-grained custom roles.
- Billing tenant management.
- Data residency routing.

