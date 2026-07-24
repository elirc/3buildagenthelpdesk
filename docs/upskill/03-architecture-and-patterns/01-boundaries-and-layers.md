# Boundaries and Layers

## Layer Map

| Layer | Owns | Example | Must not own |
| --- | --- | --- | --- |
| UI page | page data query and rendering | `apps/web/app/tickets/page.tsx:8-116` | transition rules |
| Server action | mutation orchestration | `apps/web/lib/actions.ts:41-530` | low-level agent scoring |
| Domain | validation and invariants | `packages/domain/src/tickets.ts:13-142` | Prisma calls |
| Persistence | schema and durable relations | `packages/db/prisma/schema.prisma:111-281` | UI formatting |
| Agent | deterministic analysis | `packages/agents/src/ticket-summarization.ts:29-145` | DB writes |
| Observability | audit/log scoring helpers | `packages/observability/src/index.ts:16-127` | page layout |
| Tests | behavior safety net | `tests/*.test.ts` | production dependencies |

## Good Boundaries

- Ticket transition rules live in domain (`packages/domain/src/tickets.ts:34-55`) and are enforced in server action (`apps/web/lib/actions.ts:97-100`).
- Agent implementations are pure functions (`packages/agents/src/types.ts:33-39`), while persistence is handled by `persistAgentRun` (`apps/web/lib/actions.ts:256-325`).
- UI primitives do not know Prisma (`packages/ui/src/index.tsx:1-156`).

## Boundary Leaks and Risks

- Log fingerprint grouping is implemented in the page at `apps/web/app/logs/page.tsx:37-60`. That is acceptable for MVP, but reusable analytics should move to domain or observability.
- Incident transition rules exist at `packages/domain/src/incidents.ts:20-29`, but `updateIncidentStatusAction` does not use them (`apps/web/lib/actions.ts:227-254`). Confirmed gap.
- Server actions are doing input snapshot building for agents (`apps/web/lib/actions.ts:342-357`, `apps/web/lib/actions.ts:505-518`). If agent count grows, extract input builders.

## Drill

For a proposed "agent approval workflow", decide which layer owns:

1. approval schema,
2. approval button,
3. permission check,
4. audit event,
5. recommendation application.

Self-grade:

- Basic: assigns files.
- Solid: names boundaries.
- Strong: identifies transaction and rollback needs.
