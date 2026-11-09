# STAGING REPORT — #1997 Ferrofluid Dish (loot, from @cosmodernism)

Branch `feat/ferrofluid-1997`, base main `e7928438` (#1872 merged). Local commits only — no push, no PR.
Feel-gate slice: a new dish mode with a visible floor and a stage gesture; it goes through Matt's review lane.

**Presentation reworked 2026-11-08 per Matt's ruling — see the marked section at the end of
this report. Where it disagrees with the sections above (the floor, the GPU display instance,
the determinism terms, the stills limit), the rework section wins.**

## What it is, plainly

A second dish mode beside DISH LIFE: a dark, oily ferrofluid living in the dish under the stage.
It pools and veins on its own (Gray-Scott reaction-diffusion), spikes toward magnets the
performer places on the dish, and trades influence with the culture both ways — the fluid grows
toward the living culture, and where the fluid lies dense it biases the culture's births. It has
its own chip in the Master bar next to the culture's (FERROFLUID: on/off, FLOW / PULL / COUPLE
dials, a MAGNETS arm), sheds under the governor on the culture family's ladder position, rides
snapshots, and stills with everything else under PERF PAUSED. Off means off: a take recorded
without it is byte-identical to today, proven below.

## Scope vs spec + ruling, point by point

1. **GPU path, as ruled (Matt, 2026-11-08).** The display field is a Gray-Scott sim on the GPU:
   9-point laplacian, 11 taps/step, RGBA16F ping-pong in the app's own GL machinery
   (`gl/dishFluidGl.mjs`, ACCUM's construction — own programmes through the debug harness, own
   targets). Design point **384×216 at 8 steps/frame** (the plan the resolver publishes; the
   renderer steps toward the stamped step target each frame).
2. **A dish mode, sibling of the culture** — not a pattern stratum item. Own chip in the dish
   family's posture (`components/FerroFluidChip.jsx` beside `DishLifeChip` in the Master bar):
   glyph button, three bare RangeRow dials while on (FLOW / PULL / COUPLE), the MAGNETS arm,
   the slowed/held shed read on the glyph. The mode's on/off and dials persist per viewer
   (`kc.dishFluid.v1`, the dishLife pref's discipline); the arm does not (a moment, not a
   preference).
3. **Magnets are placed objects that stay.** While armed, canvas presses place (≤ 8), drags
   move, alt-presses remove (`gl/dishFluidMagnetsDom.mjs` — capture-phase, consumed only while
   armed; the hand is never the magnet). Magnets are stamped state: they ride every frame
   beside the fluid stamp (`input.dishFluidMagnets`), so a take records them exactly, and the
   kernel seeds half its inoculation discs at them on a (re)build — a re-seeded fluid stands
   its spikes back up at the magnets first.
4. **Coupled, both directions, one frame behind, at the bottom of the resolve** — the dish's
   standing read discipline, in the machinery:
   - culture → fluid: the resolver captures the culture stage's publication
     (`dishLife.cultureField()`, new) at the TOP of the resolve, before any stage applies, and
     hands it to the fluid stage's apply at the bottom. The kernel biases feed up and kill down
     where the culture lives (the magnet's shape — see the constants note).
   - fluid → culture: the culture stage takes a birth bias (`setFluidBias`) at the top of the
     resolve from the fluid stage's density published at the LAST applied frame, and injects
     births before each generation it steps (`engine/dishFluidCouple.mjs`). Births only: no
     deaths are dealt, no living cell is touched.
5. **Bedrock untouched.** The injection skips mask/bedrock cells before any draw (the culture
   core's own blocked rule); the terrain record and bedrock grid are byte-identical after any
   injection (pinned). The fluid never reads terrain either.
6. **Visible, beneath the strata, Davis.** One fullscreen floor pass (`renderer/dishfluid`,
   tier 0) drawn into the main buffer over the background clear, before any stratum
   composites: dark phase as the palette's ink over the palette's own ground, an oily sheen on
   the phase gradient lit by the palette's lightest swatch (bilinear, soft thresholds —
   continuous signal). Colours derive from the standing palette each frame
   (`fluidDisplayColours`).
7. **Snapshots carry the fluid + magnets as riders; restore is exact.** The resolver snapshot
   gains an OPTIONAL `dishFluid` key (present only while a fluid runs) and the culture's
   snapshot gains OPTIONAL `fluidGrid` + `fluidActivity` riders (present only while the wake's
   steps consumed a bias). Why state riders and not a replay: the terrain rider could replay
   because terrain is static per wake; the coupling inputs here CHANGE while they act (the
   fluid keeps stepping, the culture keeps evolving), so the consumed state itself rides —
   restore loads it verbatim and the continuation is bit-identical (pinned at the resolver).
   `checkResolverSnapshot` gates both new shapes.
8. **Fixed-step on simulation time.** The fluid stamp (`fluidStamp`) is a pure cycle clock on
   the loop time (6 s cycles, 480 steps/s at the design rate): PERF PAUSED and hidden tabs
   still it exactly like the culture. No stamp = no state, no keys on the input.
9. **The four-part admission test.** One-way influence toward the stage (births + the floor;
   the fluid never writes a layer), bedrock (above), determinism as ruled (below),
   governor-sheddability (below).

## Determinism, stated honestly (the ruling's terms)

Magnets, seed and step count are stamped state; replay on the **same device is exact** —
asserted bit-for-bit twice over: the resolver continuation (pure JS over the recorded stream)
and two same-device GPU runs in the GL selfcheck. **No cross-device byte-identity is promised
anywhere** — GPU float variance across devices is accepted (the Davis-side parity bar), and
the code says so in its headers instead of implying otherwise. The culture stays CPU and
byte-identical; with the fluid off, or coupled at 0, culture runs are byte-identical to base
(pinned at the resolver against a no-fluid run, frame for frame).

One architectural consequence, disclosed plainly: there are **two instances of the one
kernel**. The resolver steps the kernel in JS at the dish grid (96×54, 60 steps/s) — that
instance is the coupling authority and the snapshot state: exact everywhere, no GPU readback,
no input bloat. The GPU steps the same kernel/constants at the shed resolution for the eye.
They are siblings driven by the same stamps, never texel-identical (different grids), and the
coupling never reads the display instance.

## Pinned constants (engine/dishFluid.mjs — named, all of them)

- Kernel: `GS_DU 0.2097`, `GS_DV 0.105` (Sims), laplacian centre −1 / edges 0.2 / corners 0.05,
  dt 1; regime `FERRO_FEED 0.0545`, `FERRO_KILL 0.0620` (coral growth), `FERRO_KILL_MIN 0.045`.
- Magnets: `MAGNET_RADIUS 0.085` (dish units, gaussian, aspect-corrected), `MAX_MAGNETS 8`,
  `MAGNET_FEED_GAIN 0.030`, `MAGNET_KILL_DROP 0.012`.
- Coupling: `CULTURE_FEED_GAIN 0.020`, `CULTURE_KILL_DROP 0.008` — the culture bias moves feed
  AND kill together, the magnet's shape, on measured grounds: feed alone is regime-dependent
  in standing coverage (a uniform feed rise can thin the phase), while the pair is monotone —
  the disc-density fixtures in `dishFluid.selfcheck` measure both dials' monotonicity.
  Births: `FLUID_BIRTH_FLOOR 0.25`, chance linear in (density − floor) × COUPLE.
- Dials: FLOW → feed × (0.5 … 1.5) (`FLOW_FEED_MIN/MAX`); PULL and COUPLE are straight 0..1
  gains. Defaults flow 0.5 / pull 0.7 / couple 0.5.
- Clock: `FLUID_STEPS_PER_SEC 480`, `FLUID_CYCLE_STEPS 2880` (6 s), grid instance at
  1/`FLUID_GRID_STEP_DIVISOR 8` of the display rate. Seeding: `SEED_BLOBS 26`, radius 2.5,
  `SEED_V 0.85`. Display catch-up after a rebuild: `FLUID_CATCHUP_STEPS 128`/frame.
- RNG: channels `dish-fluid` + `dish-fluid-birth` registered 'spatial' in kernel/rng.js (#1238).

## Shed registration

The governor's ladder gains cut **1.395**, immediately after the culture's 1.39 — same family
position, same reason (a dish surface, never the picture). The rung ladder is the kernel's
`FLUID_SHED_RUNGS`: steps 8→4→2→1 at full resolution (tempo first — a seamless sacrifice),
then resolution 384×216→256×144→192×108→96×54 at one step (detail after tempo; a resolution
change re-seeds the display field, so it is spent last), then held. The restore table carries
the kind directly after `dishLife`, so the reverse walk restores the fluid before the culture.
The chip and the badge read the shed honestly (slowed / coarsened / held).

**No cost-registry entry, deliberately:** the registry's tier 1 is contractually exactly the
ACCUM chain (`gl/costTiers.selfcheck.mjs` gates B + E), and the culture itself has no registry
entry — its registration is its governor rung. The fluid registers the same way. The one new
renderer programme (the floor draw) is tier 0 like the wetlook, with the reasoning in its def.

## Suites

New (8, all in `app/selfcheck.manifest` beside their families):

- `engine/dishFluid.selfcheck.mjs` — kernel determinism bit-identity; magnet bias monotone in
  distance + PULL; culture bias monotone in COUPLE (disc fixtures); dial/clamp/sanitizer law;
  the stamp's purity; the shed ladder + resolution pins; density downsampling; palette colours.
- `engine/dishFluidCouple.selfcheck.mjs` — births only-add, monotone in strength + density,
  floor; mask/bedrock never injected and byte-identical after; strength-0 golden parity.
- `engine/dishFluidStage.selfcheck.mjs` — absent stamp = no state; plan bookkeeping per rung;
  wake re-seed + seek-back rebuild; snapshot/restore exact incl. continuation, under a coupling
  input that changes mid-wake.
- `gl/liveResolve.dishFluid.selfcheck.mjs` — off parity frame-for-frame; COUPLE 0 parity;
  frames 0–1 identical before any biased generation can act (one-frame-behind); coupling
  divergence lands; a one-frame-later fluid start changes nothing early; mid-run
  snapshot/restore continues bit-identically; snapshot validation gates.
- `gl/dishFluid.selfcheck.mjs` — shader/kernel concordance (weights, rim, magnet cap, uniform
  audit vs the renderer table) + browser section: GPU serves the plan, two same-device GPU
  runs bit-identical, GPU↔kernel agreement statistical (coverage + correlation > 0.75) and
  explicitly NOT byte-equal.
- `gl/dishFluidMagnets.selfcheck.mjs` — hit geometry (aspect-corrected, nearest), place/consume
  manners armed vs disarmed, alt-press removal, the 8-magnet cap at the gesture.
- `hooks/governorDishFluid.selfcheck.mjs` — the full walk (culture's 2 steps, then the fluid's
  7 rungs, then the population), rung-for-rung labels, opt-in invisibility to older walks,
  restore-table position + needsRestore, badge honesty, store clamps.
- `components/dishFluidChip.selfcheck.mjs` — the chip state machine, help ids all resolving,
  the preference round-trip + garble handling, the store's magnet actions + cap.

Re-pins (2, each with its cause in place): `gl/composite.selfcheck.mjs` programme list 7 → 8
(the floor joins the table); `hooks/governorCuts.selfcheck.mjs` restore-table order (the fluid
kind inserted after the culture's).

Existing suites re-run directly: dishLife family (core, stage, controls, coupling, field,
seed, chip), liveResolve.dishLife, liveResolve.determinism, governorCuts, governorDishLife,
costTiers, helpCopy, rangeRow, kernel rng/purity/registry, styles — all green. Dice-adjacent
suites (resolver fluid, couple, stage) run 10× — green. Full manifest sweep (continue-on-error
over all 620 manifest lines): **617 passed, 3 failed — and all three failures are proven
base-identical environment failures**, each re-run solo on a detached base-main worktree with
the identical result: `swarmWasm` (WASM toolchain absence, identical failure tails),
`rollSafety` (headless Chromium target crash in the GL parity driver, same signature both
trees), and `accum` (the standing sandbox native abort: exit 134 after exactly 69 [ok] lines
on BOTH trees, solo). `wetWarmup` ran long under the sweep's parallel load but completed and
passed inside the sweep, and also passed solo on both trees (21 checks). `npm run
format:check` clean, lint 0 errors (11 warnings, the standing set — the one new warning this
build introduced, a governor dep array, was fixed by adding the fluid's entries beside the
culture's), `npm run build` green.

## Disclosed limits

- **Same-device determinism only**, per the ruling — stated in the kernel, stage and GL
  headers; the GL suite asserts the statistical agreement rather than dressing it up.
- **Two instances, one kernel** (above): the display field and the coupling field are siblings
  at different resolutions, not the same texels. The dish reads the coupling instance; the eye
  reads the display. Nothing crosses between them except the shared stamps.
- **Stills/captures get no fluid floor.** The offscreen renderer never arms the floor (the
  live renderer steps it per frame; a transparent capture must not advance the field off the
  recorded stamps), so an exported still shows the dealt background where the live stage shows
  the fluid. The culture has the same live-only character for its specks; flagged here plainly
  rather than discovered later.
- **Magnet placement is canvas-space.** The floor fills the canvas exactly, so dish
  coordinates are canvas fractions; stage zoom/pan does not move the dish, and does not move
  the magnets.
- **The display rebuild on resolution shed re-seeds the GPU field** from the kernel's initial
  condition and catches up at 128 steps/frame (converges in a few frames); the coupling
  instance never rebuilds on a shed — only its step bound changes.
- **The fluid does not seed from the stage.** Unlike the culture (seeded from marks), the
  fluid's seed is its own dealt inoculation (half at the magnets). "Seed from stage" for the
  fluid is not in the spec and was not built.

## Correction — the live-path fault (found in the coordinator's review drive; fixed)

The report above describes the build as committed in `4e2c1573`. That build's **live path was
broken**, and every suite in it was green anyway. Recorded plainly:

- **The defect.** Booting the built app and turning FERROFLUID on produced, every frame,
  `[gl-live] frame error: ReferenceError: voiceState is not defined`. The loop's fault channel
  tripped (the store's `renderFault`, reason "frame fault: voiceState is not defined"), no
  frame ever presented, and the fluid floor never drew in the live app. With the fluid off the
  arm's ternary short-circuits, so the blast radius was this feature's own live path — which
  is the feature.
- **The root cause.** In `gl/liveLoop.mjs`, the #1997 arm inside `tick()` resolved the frame
  palette through a bare `voiceState` — a name that exists only inside `buildFrame` and
  `clearAccum`, where a local `resolveLiveRenderState(s)` defines it. `tick()` has no such
  local (the same scope trap as the #1914 steering-flag fault).
- **Why the suites missed it.** Every #1997 suite drives the fluid through the resolver, the
  kernel, the chip's state machine, or the GL debug harness — none drives `createLiveLoop`'s
  real frame path with an active fluid plan, so the arm's non-null branch never executed
  under test.
- **The fix** (one expression, inside the #1997 arm): the palette is derived from the state
  snapshot the block already holds (`st`) through the same derivation `buildFrame` used for
  the frame being armed — `resolveLiveRenderState(st)` then `resolvePalette(...)` — so the
  floor can never wear a different palette than the frame above it, voice mix included. No
  new state reads; nothing outside the arm changed.
- **The new pin** — `gl/liveLoop.dishFluid.selfcheck.mjs` (in the manifest beside the other
  #1997 GL suites). Source pins: no `voiceState.` property read anywhere in `tick()`'s body,
  and the arm derives its palette via `resolveLiveRenderState`/`resolvePalette`. Browser
  section (the harness the GL suites use, extended to the built app): the suite rebuilds the
  app (`npm run build`, so it tests the current tree, never a stale dist), serves `dist/`
  locally, and boots it twice — a fluid-off control and a fluid-on boot via the loop's own
  headless flag (`window.__KC_FERROFLUID`) — asserting the on boot publishes
  `dishFluidAwake`, logs zero `[gl-live] frame error` console messages, keeps `renderFault`
  down, presents real frames (screenshot content, not the faulted black canvas), and stays
  clean with a magnet stamped through the store's own action.
- **Pre/post, both shown.** Against the pre-fix tree (`ca55719d`, detached worktree, only the
  new suite copied in): the suite FAILS — the source pin trips on the `voiceState.` read, and
  with that section neutralised in the scratch copy the browser section fails on the fluid-on
  boot with `frame errors: [gl-live] frame error: ReferenceError: voiceState is not defined`
  (the control boot passes). Against the fixed tree: all 6 groups pass, and a manual boot of
  the fixed build shows `renderFault: false`, `dishFluidAwake: true`, zero frame errors, and
  the floor drawn under the stage.
- **Re-verification after the fix:** all eight #1997 suites plus the new pin green; the
  dishLife family (engine ×10, chip, governor), `liveResolve.dishLife`,
  `liveResolve.determinism`, `governorCuts`, and `composite` (15 cases) green;
  `format:check` clean, lint 0 errors (the standing 11 warnings, none in touched files),
  `npm run build` green.

## Rework — the presentation (Matt's ruling, 2026-11-08; same PR, same branch)

Matt's ruling, verbatim sense: "FERROFLUID system should be like the other systems, it is
invisible and assets attach to it. So circles, dots, any asset shape gets generated and
attached to fill and appear like FERROFLUID on the stage." The merge was HELD and the
presentation reworked inside this PR. The field sim, the magnets (objects, gesture, store,
take recording), the FLOW / PULL / COUPLE dials, the two-way culture coupling, the snapshots,
the governor family position (cut 1.395) and the chip all stand exactly as built. What
changed is only how the fluid appears. Scope points 1 (the GPU display path) and 6 (the
visible floor) above are superseded by this section.

### What came out

- **The GPU display instance** — `gl/dishFluidGl.mjs` and its suite `gl/dishFluid.selfcheck.mjs`
  are deleted. There is now ONE instance of the kernel: the resolver's 96×54 grid instance,
  which was always the coupling authority. Nothing renders the field itself anywhere.
- **The floor pass** — the renderer's `dishfluid` programme (the table is back to seven
  programmes), its draw block, and its `setDishFluid` state are removed from
  `gl/renderer.mjs`.
- **The tick() palette arm** — `gl/liveLoop.mjs` no longer arms anything for the fluid; the
  lawful palette derivation added by the live-path fix went with the arm (there is nothing
  left to colour). The loop's whole part is the stamp it already wrote.
- **`fluidDisplayColours` and `FLUID_RESOLUTIONS`** — deleted from the kernel module; the
  display-resolution ladder they served no longer exists.

### What the attachment pass does

- **The plan is now an attachment plan** (`engine/dishFluidStage.mjs`): alongside the stamped
  conversation (seed key, wake, step, magnets, dials) it publishes the grid instance's density
  itself, plus the shed rung's seating terms — the seating grid (seat columns/rows) and the
  matter fraction.
- **The resolver captures the scene to dress** (`gl/liveResolve.mjs`, at the top of the
  resolve, from the dealt items before any stage applies — the culture-field capture's
  discipline): every dealt non-terrain mark across the content layers, and a bedrock mask
  (terrain items' coverage at the dish grid). Captured only while a fluid plan will apply.
- **The body is emitted after the culture applies** (so the culture's seed, collected from
  the dealt items at its wake build, can never see it), onto the **top content layer**, by
  `engine/dishFluidRender.mjs` — the culture renderer's sibling module. Each frame the layer's
  previous body (items keyed `fluid:<seat index>`) is stripped and the fresh body appended,
  so takes, ACCUM and the review loop see ordinary stage content with ordinary provenance.

### Where the matter comes from

`fluidMatterItems(plan, marks)` seats one item per seating cell where the seat-averaged
density reaches the floor and the cell is not bedrock: the score is density × (1 + PULL × the
magnet field), the strongest seats win up to the governed cap, and **each seat wears the
nearest dealt mark** — the item is a copy of that mark (asset, colour, accent, scale, the
full spread) shrunk toward the cell and faded by the density under it, so the body reads in
the stage's own look, palette and deal. Where nothing is dealt, the body is dealt from the
stage's own asset pool in the frame palette's ink, hash-seated — see the vocabulary note
below.

### Vocabulary ruling (Matt, 2026-11-08, later the same day)

Matt ruled the attached matter's vocabulary is **any pool asset shape, letters included** —
not restricted to dots/circles/primitives. The wear path already complied (any dealt mark,
of any shape, is worn nearest-first). The no-marks deal did not: it drew only the Marks
chapter's three primitives. Widened in a follow-up commit on this branch:

- `fluidMatterItems` takes a `poolIds` vocabulary: with no dealt marks, each seat is dealt
  a shape from that pool by the same seeded stream, in the palette ink. An explicitly empty
  pool seats no body (nothing lawful to wear); the module's seed shapes
  (`FLUID_PRIMITIVE_ASSETS`) remain only for callers that supply no pool at all.
- The resolver supplies the pool as the **top content layer's dealt pool** (`activeAssets`:
  the dealer's own exclusions and that layer's enabled set already applied). The creature
  citizen and the poem-only sets (kana/kanji/Latin/serif/ornaments/plate) stay out — not
  because they are letters, but because they are not pool assets: the dealer itself never
  deals them as marks. Letterforms and stamps that ARE pool assets (`typ_*`, `stamp_*`, …)
  seat as matter, pinned end-to-end at the resolver (an empty-dealt stage's body is all
  pool ids, wider than the marks chapter, no poem-only id) and at the render module.

### Budgets and constants (named)

- `MAX_FLUID_ITEMS 480` — the body's hard cap, in the culture's item-count class.
- `MATTER_DENSITY_FLOOR 0.25` — a seat must average this much dark phase to hold matter.
- `MATTER_CELL_RADIUS 0.6`, `MATTER_SCALE_MIN 0.45` — the body's cell-sized scale band.
- **The shed ladder is reshaped to the governed quantity** (`FLUID_SHED_RUNGS`, 10 rungs):
  steps 8→4→2→1 (tempo, as before), then the seating grid coarsens 96→64→48→32 wide
  (`fluidSeatRows` keeps the dish aspect), then the body's count falls to ½ and ¼
  (`matterFrac`), then held. The governor walk, the chip's held read (now the ladder's last
  rung) and the badge follow the ladder's own labels — the badge gains an honest
  "ferrofluid thinned" between "coarsened" and "held". The restore semantics are unchanged:
  the resolver re-seats at whole terms until the governor's next apply re-imposes the rung.

### Determinism — upgraded, plainly

The "same-device only" terms and the "two instances" disclosure above are **superseded**.
With the GPU instance gone, everything the fluid does — kernel, coupling, and now the
attached body — is pure JS over the stamped conversation: **replay is exact on every
device**, the culture's own standard. The body's seating reads only published state (the
plan, the dealt marks, the bedrock mask), so snapshot continuation stays bit-identical with
the body attached (pinned), and off-parity is re-proven below.

### Stills — the disclosed limit is lifted

Attached assets are normal stage content, so **stills and captures now DO show the
ferrofluid body** — the "stills get no fluid floor" limit above no longer holds. (Magnet
placement stays canvas-space, as before.)

### Suite changes

- **Deleted:** `gl/dishFluid.selfcheck.mjs` (the GPU concordance suite — its subject is
  gone); the manifest line went with it.
- **New:** `engine/dishFluidRender.selfcheck.mjs` — seating law (dense seats only, never
  bedrock, never outside the dish), nearest-mark wear + determinism from published state,
  PULL monotonicity at the magnets (count and pull-weighted share), PULL powerless in thin
  regions, the governed cap under matter fractions, the no-marks pool vocabulary, and a
  stage-driven end-to-end monotonicity drive.
- **Re-pinned:** the kernel suite (the ladder's new axes; display colours gone);
  the stage suite (the plan's attachment terms per rung); the resolver suite — off parity is
  now proven two ways (full-frame identity with no fluid keys; and with the fluid present at
  COUPLE 0, frames **less the attached body** are byte-identical to the no-fluid run, so the
  body is the fluid's only visible difference), attachment presence from frame 0, the
  late-start law restated in stripped terms, and snapshot continuation bit-identical **with
  the body included**; the governor suite (nine rungs, new label pins, badge words);
  the chip suite (held at rung 9); `gl/composite.selfcheck.mjs` (programmes 8 → 7, with the
  cause recorded beside the earlier re-pin).
- **The liveLoop pin adapted, charge unchanged** — the real frame path, fluid active, must
  run clean and the fluid must actually appear. Source pins now assert no floor arm survives
  anywhere (loop, renderer, programme table), the stamp still flows, and the resolver still
  publishes the plan and emits the body. The browser section adds the live observable the new
  shape offers: turning the mode on through the store's own action raises the store's
  `nodeCount` by the attached body and turning it off takes the body back off — zero frame
  errors and no fault throughout; the headless-flag boot and the stamped-magnet boot stay.

### Rework verification

- **Off-parity re-proven across trees:** the 60-frame no-fluid resolver rollup (the resolver
  suite's harness: quiet culture running, no fluid keys) hashes identically on this tree and
  on a fresh detached worktree at base `e7928438` —
  `1cd37eeec40c6350129a0a363195724ccce37c5bf30557f54743e40d482d04c3` on both.
- **All #1997 suites green** (kernel, couple, stage, render, chip, magnets, resolver,
  liveLoop pin, governor), the dishLife family + `liveResolve.dishLife` +
  `liveResolve.determinism` + `governorCuts` + `composite` (15 cases) + `costTiers` +
  `helpCopy` green; the dice-adjacent suites (resolver, couple, stage, render) run 10×, green.
- **Full manifest sweep** (continue-on-error, all 634 suite lines): **631 passed, 3 failed —
  exactly the standing base-identical environment set** (`swarmWasm`, `rollSafety`, `accum`),
  the same three the original build's sweep recorded against base. (The sweep shell was
  OOM-killed printing its summary after the last suite finished; the per-suite record is
  complete — every manifest line ran.)
- `npm run format:check` clean (six touched files needed a prettier pass; applied and the
  affected suites re-run green), lint 0 errors (the standing 11 warnings), `npm run build`
  green.
