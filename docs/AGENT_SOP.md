# KC-1 Agent SOP

How agents work on this repo. Read this before you touch anything.
Matt is a graphic designer, not a software developer — he architects,
you build.

## Roles

- **Matt** = creative director + architect. Decides what gets built and in
  what order, makes taste calls, reviews visuals, merges. **Matt merges by default**; he can grant
  merge-if-clean to a lane (see "Merge-if-clean").
- **Agents** = production. You build to spec. You never merge, even on green, unless Matt has granted
  merge-if-clean to that lane (see "Merge-if-clean").

## Lanes

- **Automatic:** backend, tests, CI repair, safe refactors, perf — no
  visual-output change. You may run these end to end.
- **Review:** UI, rendering, shaders, motion, visual output, goldens,
  KC-1 features. Matt looks, Matt merges.
- If you're unsure which lane something is in, it's review lane.

## Before you code

1. Read the issue body **and every comment** — they contain acceptance
   criteria and recorded decisions. Build them in, don't rediscover them.
2. Check the `order:N` labels. You execute the ranked queue; you don't rank it.
3. Scope is locked: polish and refine. New surface parks as a planning doc
   unless Matt explicitly overrides.

## How you build

- Separate worktree, clean PR, never push to main.
- One fix per PR. One PR = one commit on main (squash-merge, done by Matt, or by the agent in a merge-if-clean lane).
- Never merge on red. Verify CI yourself with `gh pr checks` after every
  push — never report "green" from memory or someone else's word.
- Resolve your own conflicts; re-verify CI after.

## How you report — keep the tech preamble short

Matt doesn't read diffs. Every PR body gets, in plain language:

1. **What changed** — one paragraph, no jargon. Say what it does and what
   to check, not which files moved.
2. **Screenshots or screen recording** of every changed visual state.
3. **Review this:** — an explicit checklist telling Matt what to open,
   click, and look at, and what "right" looks like.
4. **Localhost URL** (see below).

No file-level diffs in the report. No jargon without a plain translation.

## Visual review via localhost

- For any review-lane PR: run the dev server (`npm run dev`), confirm it
  serves, and put the localhost URL in the PR body.
- The "Review this" checklist is the reminder — it tells Matt exactly what
  to review so he never has to guess.

## Merge-if-clean

Matt can grant merge-if-clean to a lane, in writing, on the lane's epic or
issue (and say so in chat). Without that grant, only Matt merges. The grant
covers that lane only and lasts until he revokes it.

Granted lanes (record each grant here when it is made):

- **Persona Kernel (epic #2379), 2026-11-19.** Matt: "Persona lane: merge if
  clean." Visual PRs in the lane are included.

"Clean" means all of these, checked by the agent itself, never taken from a
builder's word:

1. An independent QA agent reviewed the PR against the issue and spec, and its
   verdict is CLEAN (no BLOCKING findings; NITs listed in the PR body).
2. Every CI check run is success on the current head sha
   (`gh api .../commits/<sha>/check-runs`), and failures were never waved
   off without an A/B against current `origin/main`.
3. The PR is mergeable (no conflict) and has a literal `Closes #N` for its own
   issue only.
4. The A/B probe shows default behaviour byte-identical to `origin/main`,
   unless the issue says otherwise.
5. Nothing in the PR touches an open call of Matt's (unsigned lines stay
   unsigned, unruled tuning numbers stay null, no lore or matrix rulings).

Squash-merge only. If any item fails, do not merge: fix and re-run the loop,
or stop and report. Matt can still ask for a hold on any PR.

## Standing orders

- Every background job gets kill criteria: what "done" looks like, and
  when to stop and ask instead of continuing.
- Don't nudge Matt about waiting PRs. Don't ask him to paste credentials,
  passwords, API keys, or secrets — ever.

## If a PR dies

Comment why, then close it. Don't leave dead PRs hanging, and never close
one unmerged without saying why.
