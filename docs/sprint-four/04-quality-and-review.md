# Sprint Four Quality And Review Guide

## Test Plan

Automated tests:

- Role capability matrix.
- Organization access helper behavior.
- Cross-organization mutation denial.
- Metadata redaction.
- Existing ticket, incident, job, and agent tests.

Manual tests:

- Local demo auth still works.
- Production mode does not expose unrestricted user switching.
- Organization A users cannot see organization B records.
- Detail pages return not found for inaccessible records.
- Audit filters work.
- Sensitive values are redacted in audit JSON.

## Review Checklist

Authentication:

- `getCurrentUser` no longer owns provider-specific logic.
- Local demo provider is clearly labeled.
- Production behavior cannot silently fall back to a seeded user.

Authorization:

- Role checks still happen before mutation.
- Resource checks happen after loading the target record and before mutation.
- List queries include organization scope.
- Detail queries include organization scope or explicit access checks.

Data:

- Every scoped table has `organizationId`.
- High-volume scoped queries have useful indexes.
- Seed data covers more than one organization.
- Audit events include organization context.

Security:

- Redaction is centralized.
- Secret-looking keys are covered.
- UI hiding is not treated as security.
- Error messages do not reveal cross-organization record details.

## Common Junior Mistakes

- Adding organization filters only to list pages.
- Forgetting detail routes and server actions.
- Treating role checks as resource checks.
- Leaving the fallback-to-first-user behavior in production.
- Redacting only top-level metadata keys.
- Breaking seed data by adding required fields without defaults.

## Debugging Prompts

If a scoped page returns too much data:

- Does the Prisma `where` include `organizationId`?
- Is the active user loaded before building the query?
- Is a relation include pulling in records from another organization?

If a mutation succeeds across organizations:

- Does the action load the target before mutation?
- Does it check target organization against user organization?
- Is the test using two distinct organizations?

If redaction misses a secret:

- Is the sensitive key pattern broad enough?
- Is the sensitive value nested?
- Is the write path bypassing the central helper?

## Demo Script

1. Start as a demo user in organization A.
2. Show ticket list scoped to organization A.
3. Attempt to open a known organization B ticket ID and show the not-found behavior.
4. Attempt a cross-organization mutation and show denial.
5. Write audit metadata with a token-like field.
6. Show the redacted audit event.
7. Open the security review page and explain role capabilities.

## Retrospective Questions

- Which query was easiest to forget?
- Did the organization model belong on every table selected?
- What would change if platform admins need cross-organization access?
- Which sensitive metadata pattern did the first redaction version miss?
- How would a real identity provider fit into the adapter?

