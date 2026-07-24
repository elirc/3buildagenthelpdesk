# Architecture and Patterns

This module teaches engineering taste: boundaries, contracts, ownership, side effects, and tradeoffs.

Use this rule of thumb:

- UI composes and renders.
- Server actions orchestrate mutations.
- Domain owns invariants.
- DB owns durable relationships.
- Agents own deterministic analysis.
- Observability owns "how would we know?"

If a change violates that map, slow down and write a design note.
