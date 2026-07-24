# Security Checklist

## Relevant Risks

| Risk | Repo anchor | Current state | Pre-merge question |
| --- | --- | --- | --- |
| Authorization | `packages/domain/src/permissions.ts:14-30` | coarse capabilities | Does this need resource scope? |
| IDOR | `apps/web/lib/actions.ts:97-125` | ids accepted from form | Can caller mutate another team's resource? |
| Input validation | `packages/domain/src/tickets.ts:13-24` | create ticket validated | Are all actions validated? |
| XSS | React escapes text by default | no raw HTML found | Did we introduce `dangerouslySetInnerHTML`? |
| CSRF | server actions forms | framework-level protection assumed | Are cross-site submissions considered? |
| SQL injection | Prisma query API | no raw SQL found | Did we add raw queries? |
| Command injection | no shell from user input found | low current risk | Did we pass user input to shell? |
| Secrets | `.env.example`, Prisma URL | no LLM keys | Did we commit secrets? |
| Dependency risk | npm audit previously reported issues | transitive risk | Is upgrade safe? |
| Webhooks | job payloads only | no outbound calls | Did we validate URLs? |
| Session/cookie | `apps/web/lib/actions.ts:31-39` | simulated auth cookie | Is this production-gated? |
| Rate limiting | none | MVP gap | Could a mutation be spammed? |

## What A Junior Might Miss

- If a user can edit hidden form fields, server checks must still hold.
- TypeScript does not sanitize input.
- Prisma prevents many SQL injection paths but not authorization bugs.

## What A Senior Checks

- Every mutation has server-side authorization.
- Every user-controlled id has scope checks.
- Sensitive JSON is redacted before persistence.
- Audit data cannot leak secrets.
- Seed scripts cannot run against production.

## Pre-Merge Security Checklist

- [ ] Does this add a new mutation?
- [ ] Is `requireCapability` or a stronger policy used?
- [ ] Are user-controlled ids checked for resource ownership?
- [ ] Is input validated with Zod or a typed parser?
- [ ] Are errors safe for users?
- [ ] Are secrets and tokens redacted?
- [ ] Are audit events written without sensitive payloads?
- [ ] Does the change need rate limiting?
