# fabledocs

Two documents written for a junior software engineer who is about to work on this repository.

| File | What it is for |
| --- | --- |
| [01-how-this-app-works.md](01-how-this-app-works.md) | Read first. Explains what the product does, how the code is arranged, how a request flows end to end, and the traps in the current implementation. |
| [02-feature-backlog-user-stories.md](02-feature-backlog-user-stories.md) | 20 new-feature user stories with acceptance criteria, schema changes, files to touch, and test requirements. Implement these one at a time. |

## How these differ from `docs/`

`docs/` already contains a large amount of material: an architecture overview, an eight-part upskill curriculum, several audits, and a five-sprint roadmap. Those are worth reading, but they were written at different times and some describe work that has since been completed while other parts describe work that was never started.

`fabledocs/` is a fresh pass over the code **as it exists today**. Where it disagrees with `docs/`, trust `fabledocs/`, and check the code itself if it matters.

The feature stories here are deliberately **new work**, not a restatement of `docs/sprint-roadmap.md`. Where a story touches the same area as an existing sprint story, it says so explicitly.

## Ground rules for the work

1. One story at a time, and finish it vertically: schema, domain rule, server action, page, audit event, test.
2. Business rules belong in `packages/domain`. Pages and actions should read like glue.
3. Every mutation that changes business state writes an audit event.
4. `npm run typecheck` and `npm run test` must pass before you open a PR.
5. If you discover the documentation is wrong, fix the documentation in the same PR.

## A note on verification

These documents were written by reading every source file in `apps/`, `packages/`, and `tests/`. The app was **not** run and the test suite was **not** executed while writing them, because dependencies are not installed in this checkout (`node_modules/` is absent). Claims about *what the code says* are reliable. Claims about *runtime behavior* are inferences from the code, and the ones most worth confirming yourself are flagged in the "Known rough edges" section of document 01.
