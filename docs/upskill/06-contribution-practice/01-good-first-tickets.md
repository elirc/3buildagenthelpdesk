# Good First Tickets

## Ticket 1: Add Job Domain Tests

**Difficulty:** Easy
**Estimated time:** 30-45 minutes
**Skills practiced:** unit testing, domain rules
**Story:** As a maintainer, I want retry/dead-letter rules tested so job behavior is safer.
**Why this is a good contribution:** Pure functions, low blast radius.
**Acceptance criteria:**

- [ ] Tests cover failed retryable job.
- [ ] Tests cover max attempts.
- [ ] Tests cover succeeded job not retryable.

**Read these anchors first:**

- `packages/domain/src/jobs.ts:14-20`
- `tests/domain.test.ts:11-55`

**Files likely touched:**

- `tests/jobs.test.ts` - new tests

**Implementation plan:**

1. Import `canRetryJob` and `shouldDeadLetterJob`.
2. Add table-style cases.
3. Run `npm run test`.

**Illustrative fake-code shape:**

```ts
// Illustrative fake code: adapt to the repo.
expect(canRetryJob("FAILED", 1, 3)).toBe(true);
```

**What could go wrong:** Testing implementation wording instead of behavior.
**Suggested checks:** `npm run test`
**Review questions:** Are edge cases clear?

## Ticket 2: Add Permission Matrix Tests

**Difficulty:** Easy
**Estimated time:** 45 minutes
**Skills practiced:** RBAC testing
**Story:** As a maintainer, I want role capabilities locked down.
**Acceptance criteria:** Admin all true; Viewer only audit view; Support cannot dead-letter jobs.
**Read these anchors first:** `packages/domain/src/permissions.ts:3-40`
**Files likely touched:** `tests/permissions.test.ts`
**Implementation plan:** Use table cases for roles and capabilities.
**What could go wrong:** Forgetting negative cases.
**Suggested checks:** `npm run test`
**Review questions:** Does the test fail if a role gains power accidentally?

## Ticket 3: Add Incident Transition Tests

**Difficulty:** Easy
**Estimated time:** 45 minutes
**Skills practiced:** workflow invariants
**Story:** As an engineer, I want incident transitions tested before enforcement.
**Acceptance criteria:** allowed and disallowed examples covered.
**Read these anchors first:** `packages/domain/src/incidents.ts:20-29`
**Files likely touched:** `tests/incidents.test.ts`
**Implementation plan:** Test `canTransitionIncident`.
**What could go wrong:** Only testing happy path.
**Suggested checks:** `npm run test`
**Review questions:** Which transition should be rejected?

## Ticket 4: Add Log Fingerprint Tests

**Difficulty:** Easy
**Estimated time:** 45 minutes
**Skills practiced:** deterministic hashing tests
**Story:** As a maintainer, I want fingerprints stable.
**Acceptance criteria:** numbers normalize; service/level differences remain distinct.
**Read these anchors first:** `packages/domain/src/logs.ts:14-23`
**Files likely touched:** `tests/logs.test.ts`
**Implementation plan:** Compare two similar messages.
**What could go wrong:** Asserting exact hash can be okay but makes implementation changes harder.
**Suggested checks:** `npm run test`
**Review questions:** Should this test assert equality or exact hash?

## Ticket 5: Improve Agent Limitation Text

**Difficulty:** Easy
**Estimated time:** 30 minutes
**Skills practiced:** product copy, agent safety
**Story:** As a user, I want limitations to be explicit.
**Acceptance criteria:** Each agent limitation mentions deterministic heuristics.
**Read these anchors first:** `packages/agents/src/ticket-summarization.ts:139`, `packages/agents/src/log-anomaly.ts:102`, `packages/agents/src/failed-job-investigation.ts:120`
**Files likely touched:** agent files and tests if snapshots added
**Implementation plan:** Edit strings only.
**What could go wrong:** Overpromising agent capability.
**Suggested checks:** `npm run test`
**Review questions:** Is language accurate?

## Ticket 6: Add Empty State To Agent Runs List

**Difficulty:** Easy
**Estimated time:** 1 hour
**Skills practiced:** UI composition
**Story:** As a new local user, I want clear empty state if no runs exist.
**Acceptance criteria:** `/agents` handles zero rows gracefully.
**Read these anchors first:** `apps/web/app/agents/page.tsx`, `packages/ui/src/index.tsx:136-143`
**Files likely touched:** `apps/web/app/agents/page.tsx`
**Implementation plan:** Use `EmptyState` when runs length is zero.
**What could go wrong:** Hiding table headers inconsistently.
**Suggested checks:** `npm run lint`
**Review questions:** Does it follow existing UI primitives?

## Ticket 7: Add Audit Event Filter By Action

**Difficulty:** Easy
**Estimated time:** 1-2 hours
**Skills practiced:** server component query params
**Story:** As an operator, I want to filter audit events by action.
**Acceptance criteria:** `/audit?action=ticket.created` filters events.
**Read these anchors first:** `apps/web/app/audit/page.tsx`, `packages/db/prisma/schema.prisma:278-280`
**Files likely touched:** `apps/web/app/audit/page.tsx`
**Implementation plan:** Add `searchParams`, filter, select.
**What could go wrong:** Trusting arbitrary action without safe handling.
**Suggested checks:** `npm run typecheck`
**Review questions:** Is the URL state shareable?

## Ticket 8: Add Time Window Filter To Logs

**Difficulty:** Easy
**Estimated time:** 2 hours
**Skills practiced:** filtering, performance thinking
**Story:** As an operator, I want recent logs only.
**Acceptance criteria:** filter logs by last 1, 6, 24 hours.
**Read these anchors first:** `apps/web/app/logs/page.tsx:14-35`, `packages/db/prisma/schema.prisma:219`
**Files likely touched:** `apps/web/app/logs/page.tsx`
**Implementation plan:** Parse a small allowed set, add `timestamp.gte`.
**What could go wrong:** Date math in local vs UTC.
**Suggested checks:** `npm run typecheck`
**Review questions:** Is the filter validated?

## Ticket 9: Add Dead-Letter Reason UI Placeholder

**Difficulty:** Easy
**Estimated time:** 1-2 hours
**Skills practiced:** product modeling
**Story:** As an operator, I want to record why a job was dead-lettered.
**Acceptance criteria:** Design note or TODO doc, no schema change required.
**Read these anchors first:** `apps/web/lib/actions.ts:452-478`, `packages/db/prisma/schema.prisma:222-242`
**Files likely touched:** docs only or a small TODO in docs
**Implementation plan:** Write proposal in docs.
**What could go wrong:** Adding schema too early.
**Suggested checks:** docs review
**Review questions:** Is this ready for a mid-level ticket?

## Ticket 10: Add Dashboard Low Confidence Agent Metric

**Difficulty:** Easy
**Estimated time:** 1-2 hours
**Skills practiced:** query and metric display
**Story:** As a manager, I want to see low-confidence agent runs.
**Acceptance criteria:** Dashboard shows count of recent runs below 50 confidence.
**Read these anchors first:** `apps/web/app/page.tsx:10-35`, `packages/db/prisma/schema.prisma:252`
**Files likely touched:** `apps/web/app/page.tsx`
**Implementation plan:** Add count query and metric.
**What could go wrong:** Null confidence handling.
**Suggested checks:** `npm run build`
**Review questions:** Is the metric actionable?

## Ticket 11: Add Agent Registry Test

**Difficulty:** Easy
**Estimated time:** 1 hour
**Skills practiced:** contract tests
**Story:** As a maintainer, I want every agent registered.
**Acceptance criteria:** `listAgents` returns three known agents.
**Read these anchors first:** `packages/agents/src/registry.ts:15-34`, `packages/shared/src/index.ts:54-59`
**Files likely touched:** `tests/agents.test.ts`
**Implementation plan:** Assert every shared agent type has a definition.
**What could go wrong:** Test duplicates implementation too closely.
**Suggested checks:** `npm run test`
**Review questions:** Does this catch missed registration?

## Ticket 12: Add Category Inference Tests

**Difficulty:** Easy
**Estimated time:** 1 hour
**Skills practiced:** heuristic testing
**Story:** As support, I want category inference behavior stable.
**Acceptance criteria:** tests for access, billing, performance, integration, security, bug, other.
**Read these anchors first:** `packages/domain/src/tickets.ts:133-142`
**Files likely touched:** `tests/domain.test.ts`
**Implementation plan:** Use table tests.
**What could go wrong:** Overfitting exact words.
**Suggested checks:** `npm run test`
**Review questions:** Are examples realistic?

## Ticket 13: Add README Link To Upskill Docs

**Difficulty:** Easy
**Estimated time:** 15 minutes
**Skills practiced:** docs navigation
**Story:** As a learner, I want to discover the curriculum from the root README.
**Acceptance criteria:** README links to `docs/upskill/README.md`.
**Read these anchors first:** `README.md:1-126`
**Files likely touched:** `README.md`
**Implementation plan:** Add one section.
**What could go wrong:** Overwriting existing learning path.
**Suggested checks:** `rg "upskill" README.md`
**Review questions:** Is link placement natural?

## Ticket 14: Add Seed Safety Note

**Difficulty:** Easy
**Estimated time:** 30 minutes
**Skills practiced:** operational documentation
**Story:** As a developer, I want seed risks visible.
**Acceptance criteria:** README warns seed resets data.
**Read these anchors first:** `packages/db/src/seed.ts:12-22`, `README.md:35-42`
**Files likely touched:** `README.md`
**Implementation plan:** Add warning under seed command.
**What could go wrong:** Alarmist wording.
**Suggested checks:** docs review
**Review questions:** Is the warning precise?

## Ticket 15: Add Audit Action Label Helper

**Difficulty:** Medium
**Estimated time:** 2 hours
**Skills practiced:** shared constants, UI polish
**Story:** As an operator, I want audit action names readable.
**Acceptance criteria:** audit list shows friendly labels while preserving raw action in metadata or title.
**Read these anchors first:** `packages/observability/src/index.ts:16-28`, `apps/web/app/audit/page.tsx`
**Files likely touched:** `packages/observability/src/index.ts`, `apps/web/app/audit/page.tsx`
**Implementation plan:** Add map and fallback formatter.
**What could go wrong:** Drift between action type and label map.
**Suggested checks:** `npm run typecheck`
**Review questions:** Does TypeScript ensure coverage?

## Ticket 16: Add Agent Confidence Badge Tone Helper

**Difficulty:** Easy
**Estimated time:** 1 hour
**Skills practiced:** formatting helpers
**Story:** As a user, I want confidence to be visually scannable.
**Acceptance criteria:** low, medium, high confidence have tones.
**Read these anchors first:** `apps/web/lib/format.ts`, `apps/web/app/agents/[id]/page.tsx:44-56`
**Files likely touched:** `apps/web/lib/format.ts`, agent pages
**Implementation plan:** Add helper, use on agent list/detail.
**What could go wrong:** Overstating confidence as certainty.
**Suggested checks:** `npm run lint`
**Review questions:** Does copy avoid false precision?

## Ticket 17: Add Validation Test For Too Many Tags

**Difficulty:** Easy
**Estimated time:** 30 minutes
**Skills practiced:** validation edge cases
**Story:** As a maintainer, I want tag limits enforced.
**Acceptance criteria:** schema rejects more than 12 tags.
**Read these anchors first:** `packages/domain/src/tickets.ts:23`, `tests/domain.test.ts:42-54`
**Files likely touched:** `tests/domain.test.ts`
**Implementation plan:** Use `safeParse`.
**What could go wrong:** Testing `normalizeTags` instead of schema.
**Suggested checks:** `npm run test`
**Review questions:** Which boundary owns the limit?

## Ticket 18: Add Settings Page Explanation Link

**Difficulty:** Easy
**Estimated time:** 30 minutes
**Skills practiced:** onboarding UX
**Story:** As a learner, I want to understand simulated auth.
**Acceptance criteria:** settings page links to docs explaining auth simulation.
**Read these anchors first:** `apps/web/app/settings/page.tsx`, `apps/web/lib/auth.ts:5-23`
**Files likely touched:** settings page and docs
**Implementation plan:** Add concise link text.
**What could go wrong:** In-app text too verbose.
**Suggested checks:** `npm run build`
**Review questions:** Does it avoid clutter?

## Ticket 19: Add Missing Empty States To Logs Or Jobs

**Difficulty:** Easy
**Estimated time:** 1-2 hours
**Skills practiced:** UI state handling
**Story:** As a user, I want clear feedback when filters return no rows.
**Acceptance criteria:** empty state for zero logs or zero jobs.
**Read these anchors first:** `apps/web/app/logs/page.tsx:141-169`, `apps/web/app/jobs/page.tsx`
**Files likely touched:** one page
**Implementation plan:** Use `EmptyState`.
**What could go wrong:** Breaking table layout.
**Suggested checks:** `npm run build`
**Review questions:** Is empty state specific?

## Ticket 20: Add Verification Log Update

**Difficulty:** Easy
**Estimated time:** 20 minutes
**Skills practiced:** documentation hygiene
**Story:** As a maintainer, I want docs to say what was verified.
**Acceptance criteria:** update `docs/upskill/08-reference/verification-log.md` after running checks.
**Read these anchors first:** `docs/upskill/08-reference/verification-log.md`
**Files likely touched:** docs only
**Implementation plan:** Run one command and record result.
**What could go wrong:** Claiming unrun checks passed.
**Suggested checks:** review timestamps
**Review questions:** Is uncertainty explicit?
