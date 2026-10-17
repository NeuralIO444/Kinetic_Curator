# STAGING REPORT — #1204 the shift layer (HEROES behind MOTION, PULL behind WILD)

Branch `ember/1204-shift-layer` on origin/main `cb016db3`. LOCAL staging only — no push, no PR.
Feature commit `35c54f3e`. Contract: `~/workspace/your_files/kc-1204-shift-layer-spec-2026-10-16.md` §6 + issue #1204 (verification pass + Matt's 2026-10-16 ruling: convention KEPT, "keep them, i want more motion", build ordered same day).

## What shipped

1. **`docs/DESIGN_SYSTEM.md` §2.9 "The shift layer"** — the convention written down in one place: the spec §2 paragraph's substance verbatim, plus four operational bullets distilled from spec §§3–5 (650 ms hold everywhere + release-click swallow; modes-only writes, nearest-mode display, double-click exact for counts; hand-only law; "shift layer" is backstage vocabulary, never stage copy).
2. **HEROES row** (`app/src/panels/layout/ShiftRows.jsx`, hosted by `MotionShelf.jsx`) — long-press the MOTION shelf in BUILD §3 "Motion & Behavior"; the row opens in place beneath it, long-press again closes. `HEROES OFF · LOW · MID · HIGH` → `layoutParams.heroes` = **0 · 1 · 3 · 7**. Double-click the row label opens the dock's SliderEditor for the exact count 0–7 (the #1272 latest-value ref pattern from ValueButton).
3. **PULL row** (`ShiftRows.jsx`, hosted by `BuildPanel.jsx`) — long-press ROLL in the BUILD panel header; the row opens at the top of the panel body under its host. `PULL OFF · LOW · MID · HIGH` → the engine pair (below).
4. **`app/src/hooks/useLongPress.js`** — the shared gesture: 650 ms (the voice chips' hold length), pointer-up/leave/cancel aborts, and the release click after a completed hold is swallowed in the capture phase so the host's first function never fires.
5. **`app/src/panels/layout/shiftLayer.mjs`** — the pure mode logic both rows share: mode tables, nearest-mode resolvers, clamp, and the exact LAYOUT_PARAM write payloads the rows emit (so the selfcheck tests the rows' real writes, not a copy).
6. **`app/src/panels/layout/shiftLayer.selfcheck.mjs`** — new suite, registered in `app/selfcheck.manifest` after `unlockTree`.

No engine change. No new panel, no top-bar surface, no fifth knob. Spec §6 item 5 honored.

## Host rows chosen, and why

- **HEROES → the MOTION shelf** (`MotionShelf`, BUILD §3). It is the panel's literal MOTION control (aria-label "Motion", shelf label "motion"); the pairing heroes-behind-motion is exact there. The long-press rides the whole shelf, so the row opens under the host's label per the convention.
- **PULL → the ROLL button in the BUILD header** (`BuildPanel`). The brief named "CuratorBar/DiceRoller — where 'wild' lives". On current main, `DiceTile` is dead code and `DiceTray` renders from `useDiceRoll` state owned by BuildPanel; the dice's live trigger in the panel where layout params are edited is this ROLL button, and the CURATOR top-bar button has no param-row real estate. The pairing (attractors behind the dice) is preserved; the row writes layoutParams alongside every other BUILD control. Flagged as the one judgment call a reviewer may want to re-point — the row component is host-agnostic (it takes `layoutParams`), so moving it is a two-line change.

## Stored shape — the existing engine params, not a new list

The brief's first instruction was to check how the engine consumes attractors and use the existing shape. It consumes **two scalars**: `layoutParams.attractorCount` (buildPlacements → placement stage A) and `layoutParams.attractorRadius` (default `ATTRACTOR_RADIUS_DEFAULT` = 0.15). No `{x, y, r, strength}` list exists in the engine, so none was introduced. Positions are the field's own seeded scatter: in `createAttractorField` the k-th point is a pure function of (seed, k) — identical whatever count is requested — which delivers spec §4 option A's guarantees (seeded, deterministic per Look, replays exact, no canvas picking) through the shipped mechanism; the golden-angle wording in the spec predates this read of the field code.

## Constants pinned (attractor modes)

| mode | attractorCount | radius multiplier | radius |
|------|---------------|-------------------|--------|
| OFF  | 0 | 1   | 0.15 |
| LOW  | 1 | 1   | 0.15 |
| MID  | 2 | 1.5 | 0.225 |
| HIGH | 3 | 2   | 0.30 |

As named constants in `shiftLayer.mjs`: `ATTRACTOR_COUNT_BY_MODE`, `ATTRACTOR_RADIUS_MULT_BY_MODE`. Strength is expressed as reach because radius is the field's only strength-bearing input (falloff profile is an engine construction option, not a param). Proven in the suite on the real field: at 0.18 from a centre, LOW samples exactly 0 (outside its rim), MID > 0, HIGH > MID strictly; mode round-trips hold; count-0 reads OFF at any radius; nearest-mode weights count double.

HEROES constants: `HERO_COUNT_BY_MODE` = 0 · 1 · 3 · 7 (7 = `MAX_HEROES` imported from the engine, not re-typed). Nearest-mode ties resolve to the lower mode (2 → LOW, 5 → MID), pinned per count 0–7 in the suite.

## Verification evidence

**New suite** — `shiftLayer.selfcheck`: all assertions pass. Contents: mode↔value maps both rows (incl. exact write payloads, clamps, nearest-mode tables); field-level strength proof (above) plus pooling identity for OFF over an 11×11 grid; the panel path through real `buildPlacements` fixtures — OFF byte-identical to today's no-keys params, heroes MID transforms exactly `selectHeroIndices(seed, 40, 3)` = {5, 7, 27} with scale ratio ∈ [3, 6), rotation delta ∈ π ± 0.35, placement positions untouched, OFF restores identity; attractors HIGH moves placement deterministically, OFF restores identity; hand-only law (below).

**Hand-only law** — static: `heroes` / `attractorCount` / `attractorRadius` absent from `RANDOMIZABLE_KEYS`, `MORPHABLE_KEYS`, `DICE_RANGES`, roll-scope `MOTION_KEYS`; Davis's `generateLayoutTargets` output contains none of them; the Queen's `leanDialSteps` returns exactly `{wetness, evolveInterval, pull}`. Dynamic (real store, writePathHonesty shims): the triple is set by hand *through the rows' own write payloads* via `setLayoutParam`, then `randomizeUnlocked` ×3 (with proof the door ran — an undo step landed) and `curateUnlocked` ×3 leave [3, 2, 0.225] untouched; the governor's `setPerfClampOverride` leaves the whole layoutParams document byte-identical (its overlay never enters the document).

**Touched-family suites, all green:** attractors (engine), buildPlacements, costTiers ("declarations valid, coverage complete, bands hold" — **governor cost tiers unchanged, proven**), writePathHonesty, rollScope (6), chiaroscuro (10), unlockTree (13 groups), patternEditor (6), director (13), queenLean (24), queenDeniability (7), mind (15), leanLive (7), directorSway (10), audioBus (3).

**Full manifest sweep** — all 447 suites run in manifest order (90 s per-suite window, bare node): **441 PASS**. The 6 non-pass results are sandbox artifacts, each proven base-identical on a pristine checkout of origin/main (`kc-1640-pristine`, cb016db3):

| suite | build tree | pristine main | verdict |
|---|---|---|---|
| kernel/bake/swarmWasm | FAIL(1) | FAIL(1) | identical — cargo absent in sandbox |
| fx/rollSafety | timeout 90 s | timeout 90 s | identical — documented sandbox non-completion; CI is authoritative |
| gl/composite | timeout 90 s | timeout 90 s | identical — and with the runner's heap setting both PASS (pristine 170 s, build 172 s) |
| gl/canvasSizes | timeout 90 s | timeout 90 s | identical — both PASS long-window (105 s / 110 s) |
| pattern/patternRender | timeout 90 s | timeout 90 s | identical — both PASS long-window (148 s / 188 s) |
| gl/accum | FAIL(134) at 90 s | timeout at 90 s | non-completion on both under the short window; with `NODE_OPTIONS=--max-old-space-size=4096` (the runner's setting) both PASS — pristine 3 m 02 s, build 2 m 39 s (49 cases). The 134 was V8 heap abort under memory pressure without the runner's heap flag, not an assertion. |

**Build & lint** — `npm run build` green (3.06 s). ESLint on all touched files: 0 errors, 0 warnings.

## Surprises

1. **queenDeniability caught my own header comment.** First family run failed: `surface leaks: panels/layout/shiftLayer.mjs:name` — the suite scans surface files for the Queen's name, and my module comment ("dice, Davis, the Queen and the governor") named her in a panels/ file. Reworded to "the dial lean"; suite green 7/7, and the DESIGN_SYSTEM §2.9 wording (docs/, outside the scanned surface) keeps the plain term. A deniability suite doing exactly its job.
2. **The two-key PULL write is one undo step for free.** The row emits two `LAYOUT_PARAM` events (count, then radius); the store's `pushToUndo` debounce collapses same-tick pushes, so the pair lands as a single undo step. Asserted behavior of the door, not new code.
3. **The governor needed no work at all.** Since #107 §5 its last-resort cut is a render-only overlay (`perfClampOverride {count?, mirror?}`) that never enters layoutParams — the hand-only law holds for it by architecture; the suite pins the document's byte-identity across an overlay set/clear so it stays that way.
4. **Nothing in DEFAULT_LAYOUT_PARAMS or PARAM_SPEC was added.** The three params ride as pass-through keys with engine-side defaults (the #1200 design: `?? 0` / `ATTRACTOR_RADIUS_DEFAULT`), and validation passes unknown keys through. Adding defaults would have perturbed feature-vector suites (census/recipeFeatures hash the default document) for zero behavioral gain — deliberately not done. Consequence a reviewer should know: the params are clamped by the engine itself (heroes via `selectHeroIndices`' MAX_HEROES min; counts floored in the field) rather than by PARAM_SPEC, same as before this change.
