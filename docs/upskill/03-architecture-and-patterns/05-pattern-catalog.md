# Pattern Catalog

## Pattern: Modular Monolith Package Boundary

**Problem it solves:** Keeps one deployable app while separating ownership.
**General shape:** UI app imports internal packages by stable names.
**Real example:** `package.json:6-9`, `apps/web/package.json:12-19`.
**Second example:** `apps/web/next.config.mjs:3-10`.
**Why this implementation works:** Boundaries are physical directories and package imports.
**Failure modes:** circular dependencies, too many cross-package imports, Next build misses transpilation.
**Use it when:** one team needs clear modules without service overhead.
**Avoid it when:** modules require independent scaling or separate deploys.
**Drill:** Add a hypothetical `packages/policies` and list which imports would move.

## Pattern: Shared Enum Contract

**Problem it solves:** Keeps UI labels, domain validation, and agent types consistent.
**General shape:** const arrays plus derived TypeScript union types.
**Real example:** `packages/shared/src/index.ts:1-65`.
**Second example:** label maps at `packages/shared/src/index.ts:69-128`.
**Failure modes:** drift from Prisma enums at `packages/db/prisma/schema.prisma:10-109`.
**Use it when:** multiple packages need the same vocabulary.
**Avoid it when:** values are database-only and never cross boundaries.
**Drill:** Verify every Prisma enum has a shared constant.

## Pattern: Runtime Validation With Zod

**Problem it solves:** TypeScript cannot validate form input at runtime.
**General shape:** define schema in domain, parse at mutation boundary.
**Real example:** `packages/domain/src/tickets.ts:13-24`, `apps/web/lib/actions.ts:46-57`.
**Second example:** incident schema at `packages/domain/src/incidents.ts:4-15`.
**Failure modes:** schema exists but action bypasses it.
**Use it when:** data comes from forms, query params, APIs, jobs.
**Avoid it when:** data is already strongly produced inside pure code.
**Drill:** Add validation for log filters instead of casts in `apps/web/app/logs/page.tsx:14-21`.

## Pattern: Domain Transition Map

**Problem it solves:** Prevents invalid status changes.
**General shape:** map current status to allowed next statuses, assert in server action.
**Real example:** `packages/domain/src/tickets.ts:34-55`, `apps/web/lib/actions.ts:97-100`.
**Second example:** incident transitions exist at `packages/domain/src/incidents.ts:20-29`.
**Failure modes:** rule exists but is not enforced, as with incident action at `apps/web/lib/actions.ts:227-254`.
**Use it when:** workflow states matter.
**Avoid it when:** state is purely display-only.
**Drill:** Wire incident transition enforcement.

## Pattern: Server Action as Application Service

**Problem it solves:** Centralizes mutation orchestration.
**General shape:** read form, authenticate, authorize, validate, call domain, persist, audit, revalidate.
**Real example:** `apps/web/lib/actions.ts:41-89`.
**Second example:** `apps/web/lib/actions.ts:418-450`.
**Failure modes:** file becomes too large; errors are not user-friendly.
**Use it when:** form-driven mutation is simple.
**Avoid it when:** you need reusable API clients or public REST contracts.
**Drill:** Extract an input builder without changing behavior.

## Pattern: Audit Event Wrapper

**Problem it solves:** Consistent audit writes.
**General shape:** helper accepts actor/action/entity/before/after/metadata.
**Real example:** `apps/web/lib/audit.ts:5-25`.
**Second example:** action calls at `apps/web/lib/actions.ts:129-157`.
**Failure modes:** not transactional; generic entity ids lack FK.
**Use it when:** tracking important state changes.
**Avoid it when:** high-volume telemetry belongs in logs/metrics.
**Drill:** Add request id metadata to every audit write.

## Pattern: Pure Agent Definition

**Problem it solves:** Agents are testable without DB or external APIs.
**General shape:** input -> output + trace, no persistence inside agent.
**Real example:** `packages/agents/src/types.ts:33-39`.
**Second example:** `packages/agents/src/ticket-summarization.ts:29-145`.
**Failure modes:** input builders drift; output JSON lacks schema version.
**Use it when:** deterministic analysis is enough.
**Avoid it when:** agent must mutate data directly.
**Drill:** Add an output Zod schema.

## Pattern: Agent Registry

**Problem it solves:** Central lookup for supported agent types.
**General shape:** map agent type to definition and validate target.
**Real example:** `packages/agents/src/registry.ts:15-34`.
**Second example:** call site at `apps/web/lib/actions.ts:283-288`.
**Failure modes:** type erasure via casts at `packages/agents/src/registry.ts:7-12`.
**Use it when:** adding new agents.
**Avoid it when:** one-off functions are simpler.
**Drill:** Design a compile-safe registry type.

## Pattern: Input Snapshot Persistence

**Problem it solves:** Agent results remain explainable after source data changes.
**General shape:** build JSON input, store before execution, store output after.
**Real example:** `apps/web/lib/actions.ts:263-295`.
**Second example:** seeded runs at `packages/db/src/seed.ts:24-52`.
**Failure modes:** snapshots can omit critical context.
**Use it when:** auditability matters.
**Avoid it when:** input contains sensitive data without redaction.
**Drill:** Add redaction before persisting agent input.

## Pattern: Fingerprint Grouping

**Problem it solves:** Groups repeated logs.
**General shape:** normalize message, hash service/level/message.
**Real example:** `packages/domain/src/logs.ts:14-23`.
**Second example:** UI grouping at `apps/web/app/logs/page.tsx:37-60`.
**Failure modes:** over-grouping or under-grouping.
**Use it when:** logs have repeated error signatures.
**Avoid it when:** exact message values are semantically important.
**Drill:** Write tests for numeric/id normalization.

## Pattern: Dashboard Aggregation

**Problem it solves:** Gives operators one status view.
**General shape:** parallel queries plus derived metrics.
**Real example:** `apps/web/app/page.tsx:10-43`.
**Second example:** active incident display at `apps/web/app/page.tsx:81-112`.
**Failure modes:** unbounded queries and slow dashboards.
**Use it when:** operators need summary.
**Avoid it when:** every metric needs realtime accuracy.
**Drill:** Add `take` or aggregation query for open tickets.

## Pattern: Seed Story

**Problem it solves:** Makes local app meaningful for learning.
**General shape:** create coherent users, tickets, incidents, logs, jobs, agent runs.
**Real example:** `packages/db/src/seed.ts:55-598`.
**Second example:** seeded agent runs at `packages/db/src/seed.ts:469-534`.
**Failure modes:** destructive reset and stale relative dates.
**Use it when:** onboarding needs realistic data.
**Avoid it when:** production data could be touched.
**Drill:** Add a seed safety guard.

## Pattern: Unit Test Around Pure Logic

**Problem it solves:** Fast regression checks without DB.
**General shape:** import pure function, call with fixtures, assert behavior.
**Real example:** `tests/domain.test.ts:11-55`.
**Second example:** `tests/agents.test.ts:4-69`.
**Failure modes:** no integration coverage.
**Use it when:** behavior is deterministic.
**Avoid it when:** behavior depends on database relations or browser rendering.
**Drill:** Add tests for `canRetryJob`.

## Pattern: Generic Entity Reference

**Problem it solves:** One table can target many entity types.
**General shape:** `targetType` plus `targetId` or `entityType` plus `entityId`.
**Real example:** `packages/db/prisma/schema.prisma:248-249`.
**Second example:** audit entity fields at `packages/db/prisma/schema.prisma:270-272`.
**Failure modes:** no foreign-key integrity.
**Use it when:** extensibility matters more than FK enforcement.
**Avoid it when:** deleted/missing targets must be impossible.
**Drill:** Propose cleanup logic for dangling agent targets.

## Pattern: UI Primitive Library

**Problem it solves:** Consistent UI without Tailwind.
**General shape:** small React components and global CSS variables.
**Real example:** `packages/ui/src/index.tsx:5-156`.
**Second example:** styles in `packages/ui/src/styles.css`.
**Failure modes:** components become too generic or inaccessible.
**Use it when:** repeated UI elements appear.
**Avoid it when:** page-specific composition is clearer.
**Drill:** Add an accessible `Alert` component.
