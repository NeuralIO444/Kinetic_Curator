# STAGING REPORT — #1837: ember-following drive on the moth (of #1808)

**Issue (verbatim title):** "ACCUM as memory, rung 2 slice 2:
ember-following drive on the moth (of #1808)"
**Branch:** `feat/1837-ember-following` on origin/main 302f738a.
Local only — no push, no PR (coordinator runs the review lane; this is
a feel slice, Matt reviews and merges). This file replaces the report
that was at the worktree root (#1876's); that report remains in git
history.

## Premise check — TRUE, with the record straight

- Slice 1 (#1839) is on main as assumed: the trail grid
  (`gl/trailGrid.mjs`, 32×22 at pair aspect), its backstage wire, and
  its selfcheck all exist and pass (7/7). The grid's shape matched the
  issue's assumption exactly; nothing had to be improvised.
- The ruling comment is on the issue (Matt, 2026-10-29: "Played it —
  build the ember-following slice"). #1838 (sign flip, second creature
  type) was NOT touched and stays gated on his play of this slice.
- Two things the dispatch context got slightly wrong, for the record:
  slice 1 shipped the grid + readout only (no deposit steering — the
  deposit-side stigmergy on main is the separate #1415 dish-trails
  field, which stays distinct by design), and the "device harness" is
  the #1695 rig on Matt's Mac — its numbers cannot be produced in this
  sandbox (see Budget honesty, below).

## What shipped, in plain language

Under a look that declares an ember weight, the moth now grazes the
ACCUM buffer's cooling light. The loop derives the trail grid from the
live buffer at cadence (every 15 steps) with true ages requested, and
stamps grid + weight on the resolver input; the moth builder integrates
a capped, leashed drift toward mid-age cells (new pure module
`engine/emberDrive.mjs`). Off — no declaring look, ACCUM off, the
governor's new shed — the moth is bit-for-bit today's moth.

- **Declaration:** `trailEmber: 0.6` on DUSK FLOCK + a
  `trailEmberWeight(id)` reader in `data/presets.js`. Look data, like
  `categories`/`paletteId` — never a layout param, so no
  DEFAULT_LAYOUT_PARAMS entry and no replay divergence from the
  declaration itself. Undeclared looks read 0 (off).
- **The drive:** ember = energy × a triangular age window (fresh
  deadband 0.5 s → peak at 2.1 s → dead at 6 s), from true ages when
  they ride, else the spectral b/g proxy (slice 1's measured fallback).
  Steering is gradient ascent read at a 2-cell sensor reach, speed
  capped at 0.55 px/frame × weight, leash 5 cells. Three modes: climb,
  graze (hold on food), walk home (no slope, nothing underfoot). The
  walk-home + deadband are load-bearing: the first soak run camped for
  70 s on the moths' own fresh deposits; with them, the worst
  >40%-occupancy streak is **3.9 s** against the 30 s bound.
- **State:** per-pin offsets ride the creature builder's
  snapshot/restore as OPTIONAL keys (pre-slice snapshots restore with
  moths on their pins; malformed steering state fails closed).
- **Governor:** new rung **cut 1.48** — after the selective feed
  (1.47), before the creature count (1.5), long before ACCUM itself
  (cut 3), per the issue's shed law. Store overlay `trailSteerShed`
  (travelShed class, cleared on document apply), hook sensor + restore
  entry + badge line `ember steering held` (the show block's report,
  same as cut 1.47's). A shed frame replays shed (the shed rides the
  resolver input).
- **Derivation optimisation:** `deriveTrailGrid` rewritten as a banded
  loop with the dead-pixel skip slice 1's report named — **bit-identical
  output** (proven against the original implementation over randomized
  scenes at seven buffer sizes, plus slice 1's suite at 7/7).

## Behaviour evidence (`docs/review/1837/README.md`)

- Distance-to-ember trace through the real builder: weight 0 holds
  175 px for 600 frames; weight 0.6 closes 175 → 25 px and settles.
- Non-collapse soak (10 min, 6 moths, weight 0.6): worst streak 3.9 s
  (bound 30 s); max drift 148 px of the 250 px leash; mean 37.7 px.
- Derivation at pair size, paired before/after in this sandbox: fully
  lit with age 28.3 → 22.3 ms; colour-only 21.6 → 15.0; 16% lit
  21.9 → 14.2; 2% lit 24.4 → 9.8. At the 15-step cadence the worst case
  amortizes to ≈1.5 ms/frame before readback.
- Live boot smoke (vite preview + headless Chromium, route
  interception): the app boots on this build (footer build 302f738a),
  stage renders, no page errors. Steering itself is proven in data
  space above; the feel is Matt's review.

## Budget honesty

The acceptance asks for a device-harness cadence/budget proof. What is
proven here: the derivation's CPU cost (above, sandbox), the cadence
arithmetic, and that the feed costs exactly nothing while off (no
readback, no derivation — the loop only calls the wire while live).
What is NOT proven here: the on-device cost of `readTrail()`'s
full-buffer readback + derivation spike at 4 Hz on iPad-class hardware
— that number lives on the #1695 harness (Matt's Mac), the #1807/#1808
precedent. If the spike hurts on device, the governor rung ships in
this same slice, and the GPU grid reduction slice 1 named is the
follow-up optimisation. I did not invent a device number.

## Verification (run in this worktree, final formatted tree)

- `emberDrive.selfcheck` (new, wired into `app/selfcheck.manifest`):
  **14/14** — window + both field paths, declaration, steer caps/leash,
  graze + walk-home modes, builder steering, inert off paths, snapshot
  round-trip + pre-slice restore, **2,000-frame replay-exactness**,
  **10-min non-collapse soak**, governor walk, live-wire
  cadence/identity.
- `creatureGate`: **green** — the pre-repipe fixture replays
  identically (the strongest proof the off path changed nothing).
- `replayGate`, `resolverSnapshot`, `inputLog`, `playback`,
  `resolveTap`, `liveLoopSwell`: pass.
- `trailGrid` 7/7 (on the optimised derivation); `governorCuts` pass
  (with the one re-pin below); `accumFeed`, `phase6`, `spectrumWarp`,
  `markWeather`: pass — their pinned ladder walks are unchanged; the
  rung is opt-in exactly like 1.45/1.47 were.
- Creature/resolver families: `creature`, `creaturePose`,
  `dishCreature`, `engraving`, `glitch`, `skeleton`, `wingWarp`,
  `featherFan`, `spawn`, `davisShift`, `dishPins`, `limbs`, `setLive`:
  pass.
- Data/state families: `styleLooks`, `taxonomy`, `swatchWeights`,
  `audioRoutes`, `voices`, `chiaroscuro`, `growthTiles`, `sessionOnly`,
  `overlayRoundtrip`, `projectDocument`, `fxaa`, `motionMeterTap`,
  `foldInCensus`, accum seam/guard/inventory, `atlas.skip`, `bandFeed`,
  `contactShadow`, `gestureRecord`, `grainFinish`, `paletteMix`,
  `patternAudio`, `performanceCapture`, `routesStartEmpty`,
  `spectrumMarks`, `wetLook`: pass.
- `accum` solo at `NODE_OPTIONS=--max-old-space-size=3072`: **67/67**.
- `npm run build`: green. `npm run format:check`: all files pass
  (prettier --write run on every touched code file before committing).

## Re-pins (each with its cause)

1. `governorCuts.selfcheck` — the pinned GOVERNOR_RESTORE_CUTS order
   gains `'trailSteer'` between `'accumFeed'` and `'creatureCount'`.
   Cause: the new cut 1.48 itself; the file's own convention narrates
   each join, and the comment was extended the same way. No other
   expectation in the file moved.
2. No golden hashes, no checkpoint hashes, no fixture changes. The
   creatureGate fixture stands unmodified and green.

## Notes for the coordinator

- **One-writer files:** this build edits `liveLoop.mjs` (small,
  delimited hunks: imports, the stamp computation, two lines in the
  resolver input, the recipe's ageBuffer flag, the post-step wire
  call, the session-end clear). It does NOT touch `liveResolve.mjs` or
  `particles.js`. If the concurrent #1814 build also edits liveLoop,
  expect a textual merge, not a semantic one.
- Sandbox note: the first `npm run build` attempt failed inside the
  shared `~/node_modules` (@tauri-apps/api resolution — the known
  stale-modules failure) while another worktree's install was in
  flight; a local `npm install` in this worktree + rebuild is green,
  and the boot smoke only worked after that install. CI builds clean,
  so this is sandbox-only.
- `swarmWasm` / `rollSafety` were not run (environmental in this
  sandbox per house record — no cargo / base-identical); CI is
  authoritative for them.
