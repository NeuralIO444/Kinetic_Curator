# STAGING REPORT — issue 2486 (A8): Hit recall while the loop is paused does not restore the stage

**Disposition: root cause PROVEN — shape (c). The fix's only missing link is a
presentation gate inside `app/src/gl/liveLoop.mjs`, a one-writer file this
builder is barred from touching. This branch therefore lands the evidence,
the store-side contract pin, and the exact seam spec for the loop's
designated writer — and no production-code change.**

## Reproduction

Session record (stress report, A8): while PERF PAUSED, clicking Hit 1
GARNET in the bottom Hits bar opened the hit's details, but the stage
stayed unchanged (722 nodes, blank/pastel picture); after RUN resumed the
loop, the stage changed later. The recall did not take effect while paused.

Store-level reproduction on this tree (real store + real live resolver,
the A1 suite's harness; scratch driver deleted after the run):

| step                           | seed      | palette       | layout count | resolver nodes | running   |
| ------------------------------ | --------- | ------------- | ------------ | -------------- | --------- |
| Hit B captured                 | 20202     | cyanotype     | 120          | 89             | true      |
| Stage A standing               | 10101     | hydra         | 300          | 231            | true      |
| LIVE recall of B               | 20202     | cyanotype     | 120          | 89             | true      |
| Watchdog trip (`tripWatchdog`) | 10101     | hydra         | 300          | 231            | **false** |
| **PAUSED recall of B**         | **20202** | **cyanotype** | **120**      | **89**         | false     |
| After RUN (`setRunning(true)`) | 20202     | cyanotype     | 120          | 89             | true      |

The paused recall also wrote `enabledAssets` as exactly the hit's cast
(whitelist map), and left the stop untouched: `running` stayed false,
`slowRender` stayed true, `slowRenderSource` stayed `'watchdog'`.

## Shape verdict

- **(a) The recall writes nothing while paused — FALSE.** `recallFavorite`
  (davisSlice) is a plain synchronous `set()`; the dispatch pipe coalesces
  only layout/audio streams, and RECALL_FAVORITE is a discrete action that
  dispatches synchronously (composition/dispatchPipe.js). The tray click
  reaches it via DAVIS_FAVORITE → wireEventBus → RECALL_FAVORITE with no
  pause check anywhere on the path. The write lands in full while paused
  (table above).
- **(b) The write lands but resume discards it — FALSE.** `setRunning` is a
  flag flip plus the #264 watchdog-clear; it writes no scene state. After
  RUN, the store still held the hit's state field-for-field, and the
  resolver still resolved the hit's stage (89 nodes).
- **(c) The write lands and resume presents it; only the while-paused
  presentation is missing — PROVEN.** See the root cause.

One honest note on the session's numbers: the session read the stage count
as unchanged (722) after the click. On this tree the footer count is
published from inside `buildFrame`, which runs before the pause gate, so
the count follows the store even while paused; the session's unchanged
count was most likely read from the same observation as the click (or its
click landed on the hover detail card). What is not in doubt — and what
the issue's title and body both state — is the stage picture: it cannot
change while paused, by construction, and that is the defect.

## Root cause

The live loop's tick (`app/src/gl/liveLoop.mjs`):

1. Every rAF tick calls `buildFrame(dtSec, loopTimeMs)`, which resolves the
   CURRENT store state and publishes the node count (line ~1243) — which
   is why the session's footer count and fps stayed live while paused.
2. `buildFrame` stamps the frame `paused: !s.running` (line 1639).
3. Back in the tick, `if (paused)` (lines 1822–1828, "Spine B (#388):
   paused holds the last presented frame") rolls the clocks back and
   returns — **before every present call in the file**. While the store's
   `running` is false, no frame is ever presented, no matter what the
   store does.

PERF PAUSED is exactly that state: `tripWatchdog` sets `running: false`
(with `slowRender: true`, source `'watchdog'`). So a recall made during
the stop updates everything except the one thing the performer looks at.
The canvas holds the last presented frame — in the session, a
blank/pastel one — until RUN, when the first resumed tick presents the
recalled state through the normal path.

The same gate covers every scene change made while paused (sliders,
palette, morphs — a morph's clock is held too), but the recall is the
sharpest case: it is a discrete, deliberate "become this hit" action with
a details card and an active-pill highlight answering the click, while
the stage itself says nothing happened. The queue transport's timed
recalls ride the same store action and are equally invisible during a
stop (the transport's clock is wall-time; in the session it was stopped,
so it is not a factor in the filed repro).

## The seam (for the loop's designated writer)

All inside `app/src/gl/liveLoop.mjs`:

- **Location:** the tick's paused early return (lines 1822–1828), fed by
  buildFrame's `paused: !s.running` (line 1639).
- **Requirement:** while paused, when the scene the last presented frame
  was built from no longer matches the scene the current tick's
  `buildFrame` just resolved, present exactly one frame of the current
  state — a held still — then keep holding. The tick already builds the
  full frame before the gate, so the seam is a present-on-change inside
  the paused branch, not a new render path. Change detection can ride the
  frame's own identity inputs (seed, layout/palette/enabledAssets/layers
  references, morph state) against the last presented frame's.
- **Constraints the seam must keep:**
  - Clocks stay held: the loopTimeMs / presentedMs rollback and the life-
    clock rollback in the paused branch are untouched; the still is a
    peek at current state (the `captureFrame` discipline — buildFrame
    with dtSec 0 at the held clock — is the standing precedent), never a
    physics step.
  - ACCUM: the frame build already folds `running === false` into the
    accum `freeze` input (line 1455). The still must not step or re-begin
    the feedback buffer behind the performer's back; present the resolved
    frame the way the frozen branch presents its texture, or follow the
    A2 slice's one-frame reseed law — the loop owner's call, but after
    the still + resume, the buffer must be indistinguishable from the
    no-recall case apart from the new scene.
  - The stop stays authoritative: presenting a still must not clear
    `running`, `slowRender`, or any badge/log state. PERF PAUSED keeps
    reading paused; only the picture changes.
  - Bounded cost: at most one still per distinct state change. The pause
    exists because the loop was crawling — a still per performer action
    is bounded by the performer; a still per tick would defeat the stop.
  - Morphs stay frozen mid-morph: the still shows the pose buildFrame
    computes at the held clock, which it already does.
- **Pin to land with the seam** (bridge-level, the accumFreezeClear
  pattern): boot the built app through the shipped agent bridge, trip the
  pause, recall a hit through the tray's own channel, and read the
  presented frame (the loop's presented-frame readback the e2e hook uses)
  — it must show the recalled scene while the store still reads paused;
  then RUN and confirm the same scene continues. In-sandbox, the #2477
  still path + canvas checksum is the working form.

## Alternatives considered and rejected

- **Present from outside the loop** (a hook calling `captureFrame` and
  compositing its pixels over the canvas): with ACCUM on, `captureFrame`
  returns the feedback buffer's CURRENT texture — the pre-recall trails,
  not the recalled scene — so it cannot show the recall at all in the
  accum path; in the plain path it means drawing foreign pixels over a
  WebGL canvas the loop owns (resize/DPR drift, mirror divergence). A
  symptom patch, rejected.
- **Recall flips `running` back on:** a recall silently un-stopping a
  watchdog hard stop defeats the stop's purpose and breaks the #264
  resume contract (resume belongs to RUN/Space, with its grace law). The
  new suite pins that a recall leaves the stop exactly as it found it.
- **Defer the recall until resume** (queue the dispatch): silent data
  loss in a different costume — the tray would show the hit active while
  the store disagrees, and a second recall would reorder history. The new
  suite pins that the write lands immediately.

## What was built on this branch

- `app/src/state/recallWhilePaused.selfcheck.mjs` — new suite pinning the
  store-side contract: a live recall lands in full; a recall under the
  real watchdog stop lands in full (seed, offsets, layout, palette, cast)
  with the real resolver resolving the hit's stage from it; the recall
  leaves the stop untouched; and the recalled state survives
  `setRunning(true)` field-for-field. Registered in
  `app/selfcheck.manifest` after `playUndoStage.selfcheck.mjs`.
  Mutation proof: with `recallFavorite` temporarily gated on
  `state.running`, the suite fails with `paused recall: seed is the
hit's`; mutation reverted immediately, suite green again.
- This report. **No production code changed** — the seam is the loop
  owner's, per the one-writer rule.

## Verification

- New suite: `recallWhilePaused.selfcheck: OK (…hit resolves 89 nodes)`.
- Targeted neighbours, all pass: playUndoStage, queueTransport, favorites,
  hitsClear, watchdogLaw.
- `npm run lint`: 0 errors (11 warnings, the pre-existing baseline).
  `npm run format:check`: clean. `npm run build`: green.
- Full manifest sweep (continue-on-error, runner verdict lines only):
  **832 PASS / 2 FAIL of 834**. The two failures are swarmWasm (exit 1)
  and rollSafety (exit 1) — each A/B-proven identical on a pristine
  origin/main checkout (4a624d6e, same exit codes), the established
  sandbox-environmental set; this branch changes no production code, so
  nothing in the sweep is attributable to it. (accum, the third member of
  the set in sibling sweeps, passed on this run.)

## Visible change (lane routing)

Nothing the performer sees changes from this branch — it is a test suite
and a report. The eventual seam changes exactly one visible thing: while
PERF PAUSED (or user-paused), the stage picture will update to a recalled
hit instead of holding a stale frame. Live (unpaused) behaviour is
untouched by both this branch and the seam as specified.
