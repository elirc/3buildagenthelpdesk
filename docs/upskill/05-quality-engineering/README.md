# Quality Engineering

Quality is not "more tests" in the abstract. It is confidence that the important contracts still hold after change.

This repo currently has fast unit coverage for domain and agent heuristics:

- `tests/domain.test.ts:11-55`
- `tests/agents.test.ts:4-69`

The next quality step is integration coverage around server actions, Prisma persistence, audit events, and UI route behavior.
