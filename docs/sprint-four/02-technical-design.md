# Sprint Four Technical Design

## Current Baseline

The app uses `getCurrentUser()` to read an `activeUserId` cookie, then falls back to the first seeded user. This is excellent for demos, but not production security. Role checks use `requireCapability`, which is a good starting point but does not answer resource-level questions such as "can this user update this specific ticket?"

## Authentication Adapter

Suggested interface:

```ts
export type AuthContext = {
  userId: string;
  email: string;
  provider: "local-demo" | "oidc" | "saml";
};

export type AuthProvider = {
  getAuthContext(): Promise<AuthContext | null>;
};
```

Then `getCurrentUser` can:

1. Ask the provider for an auth context.
2. Load the user record.
3. Include organization and team.
4. Return `null` when no identity exists.

The local provider can still use the existing cookie. The important production step is that the rest of the app stops caring where identity came from.

## Organization Data Model

Suggested Prisma additions:

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  users     User[]
  teams     Team[]
  tickets   Ticket[]
  incidents Incident[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Add `organizationId` to:

- `User`
- `Team`
- `Ticket`
- `Incident`
- `StructuredLog`
- `BackgroundJob`
- `AgentRun`
- `AuditEvent`

Indexes:

- `@@index([organizationId, status])` where status exists.
- `@@index([organizationId, createdAt])` for audit and activity views.
- `@@index([organizationId, service, environment])` for logs.

## Role And Resource Authorization

Keep role capability checks pure:

```ts
hasCapability(role, "ticket:update")
```

Add resource policies where database state matters:

```ts
export function canAccessOrganization(user, organizationId): boolean
export function canMutateTicket(user, ticket): boolean
export function canViewAuditEvent(user, event): boolean
```

For a first version:

- Platform admins can access all organizations if that role exists.
- Organization admins can access only their organization.
- Support, engineering, manager, and viewer users are scoped to their organization.
- Resource mutation still requires role capability.

## Query Scoping Pattern

Every list page should apply organization scope in the Prisma `where` clause.

Example:

```ts
const where = {
  organizationId: currentUser.organizationId,
  status: searchParams.status ? searchParams.status : undefined
};
```

Avoid fetching unscoped data and filtering afterward. That leaks through logs, performance traces, and accidental rendering.

## Mutation Scoping Pattern

Every server action should:

1. Load current user.
2. Check role capability.
3. Load target record with organization id.
4. Check resource access.
5. Mutate.
6. Write scoped audit event.

This order prevents unauthorized users from discovering too much through mutation side effects.

## Redaction Design

Expand the redaction helper to handle:

- Case-insensitive sensitive key names.
- Common headers such as authorization and cookie.
- Nested objects and arrays, if feasible.

Apply redaction in:

- `writeAuditEvent`
- Any structured log creation helper
- Future CSV/report export audit metadata

Do not rely on callers to remember redaction.

## Audit Design

Add organization id to audit events. Include actor role in metadata for review.

Recommended metadata:

```ts
metadata: {
  actorRole: user.role,
  requestId,
  source: "server-action"
}
```

For security events, add action names such as:

- `security.auth_failed`
- `security.access_denied`
- `security.role_capability_viewed`
- `security.audit_exported`

## Testing Strategy

Domain tests:

- Capability matrix by role.
- Resource policy helper behavior.

Integration tests:

- User from organization A cannot update ticket from organization B.
- User from organization A cannot view logs from organization B.
- Audit writes organization id.
- Metadata redaction removes sensitive values.

Manual tests:

- Seed two organizations.
- Switch demo users across organizations.
- Confirm lists and details are scoped.
- Try submitting an ID from another organization.

## Risk Notes

- Adding organization scope touches many queries and can create subtle omissions.
- A global admin role must be clearly named to avoid confusing organization admins.
- Redaction can hide data needed for debugging, so logs should preserve safe context.
- Demo auth must not be mistaken for production auth.

