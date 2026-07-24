# Contributing

This repository is a training ground. The features matter less than the habits you build shipping them. Every change lands the same way: a branch, small commits that each tell a story, a pull request that argues its own case, green CI, then merge.

If you are new here, read [`fabledocs/01-how-this-app-works.md`](fabledocs/01-how-this-app-works.md) first. This document is about *process*; that one is about *the code*.

---

## The loop

```
git switch main && git pull        # always branch from current main
git switch -c feat/a1-paginate-queues
  ...work, committing as you go...
npm run typecheck && npm run test  # before you push, not after CI tells you
git push -u origin feat/a1-paginate-queues
gh pr create                       # fill in the template properly
  ...CI runs, review happens, you push fixes...
gh pr merge --squash --delete-branch
```

Never commit directly to `main`. Not even for a typo. The point of the rule is that it has no exceptions — the moment it has one, it has ten.

---

## Branch names

```
<type>/<story-id>-<short-slug>

feat/a1-paginate-queues
feat/c1-sla-pause
fix/d2-lease-never-reclaimed
chore/ci-workflow
docs/update-contributing
```

`<story-id>` ties the branch to `fabledocs/02-feature-backlog-user-stories.md`. Six months from now, `feat/c1-sla-pause` tells you where to look; `my-branch-2` tells you nothing.

---

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body — why, not what>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
Scope: the package or area — `domain`, `db`, `web`, `agents`, `ui`, `ci`.

### Subject line

Imperative mood, lowercase, no trailing period, under ~70 characters. The test: your subject should complete the sentence *"If applied, this commit will ___"*.

```
✅ feat(domain): add effectiveSlaDueAt to account for paused time
❌ Added a function for SLA stuff
❌ fix
❌ WIP
```

### Body

**The diff already says what changed. The body says why.** This is the single highest-value habit in this document, and it is the one that separates engineers whose git history is useful from engineers whose history is noise.

Write the body when the change involved a decision. Cover:

- the problem that made the change necessary
- what you chose, and what you rejected
- anything a reader would otherwise have to reverse-engineer

```
feat(domain): derive backoff jitter from the job id, not Math.random()

Two jobs failing in the same tick must not retry in the same tick, or a
struggling dependency gets hit by the whole batch again at once. That
argues for random jitter.

But random jitter makes the function untestable — you cannot assert on
a value that changes every run.

Deriving the jitter from a hash of the job id gives us both: the spread
is stable across jobs (different ids, different delays) and reproducible
across runs (same id, same delay). calculateBackoffMs is now a pure
function of (attempt, jobId), so tests assert exact milliseconds.
```

### How big is one commit?

One logical change. If the subject needs the word "and", you probably want two commits.

A good sequence for a feature reads like an argument:

```
feat(db): add slaPausedAt and slaPausedTotalMs to Ticket
feat(domain): add SLA pause helpers and rewire getSlaState
test(domain): cover multi-cycle and in-progress SLA pauses
feat(web): persist pause state on ticket status change
feat(web): surface paused SLA state in the ticket UI
```

A reviewer can read those five subjects and know the shape of the change before opening a single file. That is the goal. And if the UI turns out to be wrong, the domain commits are still good — you can revert one without losing the others.

Commit while the reasoning is fresh. Reconstructing "why did I do that" an hour later produces vague messages.

---

## Pull requests

One story, one PR. If a PR is getting large, that is usually a signal the story was really two stories.

The [PR template](.github/pull_request_template.md) is filled in, not deleted. Two sections carry most of the weight:

**"How I verified this"** — "it works" is not verification. What did you run, what did you click, as which role, and what did you deliberately try to break?

**"Risks and follow-ups"** — what could this break that CI would not catch, and what did you knowingly leave undone? Writing this down is not an admission of sloppiness. It is the difference between a known limitation and a lurking bug, and it is the section experienced reviewers read first.

### Responding to review

- Push fixes as new commits while the PR is open. Do not force-push mid-review — it destroys the reviewer's ability to see what changed since they last looked.
- Reply to every comment, even if only to say you disagree and why. A resolved thread with no reply reads as "I ignored you."
- "Good catch, fixed in `<sha>`" is a complete and excellent reply.
- Disagreeing with a reviewer is allowed and often correct. Bring a reason, not a preference.

### Merging

Squash-merge. The branch's commits are the *drafting* history — useful during review, noise on `main` afterwards. The squashed commit's message is the PR title and description, which is the summary you actually want when you run `git log` on main a year from now.

---

## Before you push

```bash
npm run typecheck
npm run test
```

Both must pass locally. CI will run them anyway, but discovering a broken build from a red X three minutes after pushing wastes your time and burns a CI run. Run them yourself.

CI (`.github/workflows/ci.yml`) runs install → prisma generate → typecheck → test → lint on every PR. A red check blocks merge. If CI fails and you cannot reproduce it locally, the usual culprit is a file you forgot to `git add` — CI checks out only what you committed. `git status` before you push.

---

## Definition of done

A story is not done when it renders. It is done when all of this is true:

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes, with at least one new test that would fail without your change
- [ ] Every new Prisma query filters by `organizationId`
- [ ] Every new mutation checks a capability and writes an audit event
- [ ] Business rules live in `packages/domain` as pure functions
- [ ] Seed data (`packages/db/src/seed.ts`) exercises the new feature
- [ ] `VIEWER` cannot mutate anything you added
- [ ] You clicked it in the running app as at least two different roles
- [ ] The PR template is filled in honestly, including the risks section

---

## Where code goes

The package dependency rule, restated because it is the convention most often broken:

```
shared  ←  domain  ←  observability  ←  agents  ←  db  ←  apps/web
   ↑                                                        │
   └──────────────────  ui  ────────────────────────────────┘
```

- A rule you could describe to a support manager without mentioning React or SQL → `packages/domain`, as a pure function, with a test.
- Anything touching Prisma → `packages/db` or a server action.
- Anything touching `cookies()` or `revalidatePath` → `apps/web`.
- A component that would look identical in a different product → `packages/ui`.

The reliable smell: **if you cannot test it without a database, it is probably in the wrong place.**

---

## Local setup

```bash
npm install
cp .env.example .env
npm run db:start      # Postgres in Docker on :5432
npm run db:generate   # regenerate the Prisma client (needed after every schema edit)
npm run db:push       # apply the schema
npm run db:seed       # reset and reload demo data — destructive
npm run dev           # http://localhost:3000
npm run worker        # SECOND TERMINAL — agent runs stay PENDING without it
```

Two things that catch everyone once:

1. **`npm run db:seed` deletes everything first.** It is a reset, not an upsert.
2. **Agent runs need the worker.** Clicking "Run Ticket Agent" only enqueues work. With no worker running, the run page sits at `PENDING` forever and nothing on screen explains why.
