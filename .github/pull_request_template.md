<!--
Keep this template. Delete the instructional comments as you fill it in.

A pull request is not a delivery receipt. It is an argument that this
change is correct and safe, addressed to someone who was not in your head
while you wrote it. Write it for that person.
-->

## What

<!-- One or two sentences. What behavior exists after this merges that did not exist before? Describe it from the user's side, not the code's. -->

## Why

<!-- Link the story: fabledocs/02-feature-backlog-user-stories.md Story X.Y.
     Then say in your own words what problem it solves. If you cannot explain
     the problem without referring to the story text, you do not understand it yet. -->

## How it works

<!-- The reviewer's map of the diff. Name the layers you touched and why the
     logic landed where it did:

     - Schema:  what changed and whether it is backward compatible
     - Domain:  the pure functions added, and the rule they encode
     - Action:  the mutation path, its capability, and its audit event
     - UI:      what a user now sees

     If you made a judgement call, say what you chose and what you rejected. -->

## Acceptance criteria

<!-- Copy the numbered criteria from the story and tick them honestly.
     An unticked box with a note is a fine outcome. A ticked box that is not
     actually true is the one thing that will destroy trust in your PRs. -->

- [ ] 1.
- [ ] 2.

## How I verified this

<!-- Not "it works". Say what you ran and what you saw.

     - `npm run typecheck` and `npm run test` pass (CI proves this, but say
       whether you also ran them locally before pushing)
     - Which new tests you added and what failure each one would catch
     - What you clicked in the running app, as which role
     - What you deliberately tried to break -->

## Risks and follow-ups

<!-- The most valuable section, and the one juniors skip.

     - What could this break that CI would not catch?
     - What did you leave undone on purpose, and why?
     - Any data migration or backfill implication for existing rows?
     - Anything you are unsure about and want the reviewer to look at hardest? -->

## Reviewer checklist

- [ ] Every new Prisma query filters by `organizationId`
- [ ] Every new mutation checks a capability and writes an audit event
- [ ] Business rules live in `packages/domain`, not in a page or an action
- [ ] New domain functions are pure and have tests
- [ ] `VIEWER` cannot mutate anything this PR added
- [ ] New enum values were added in all three places (Prisma, `shared` array, `labelMaps`)
