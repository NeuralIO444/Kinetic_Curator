# TRANSITIONS — deep design brief (Kinetics system 6/6)

Read-only audit, 2026-09-22. Line refs verified by reading. Scope: itemMorph chip
morphs, voice MIX, palette mix + pixel dissolve, preset steppers, float-count fade,
morphEvolve/favorites. No features proposed; protection + extraction only.

## 1. Contract

TRANSITIONS = event tweens: given a presentation-changing event, interpolate the
presented item/frame stream from **last shown** to **new raw resolution**, then hand
back exact raw order/identity at landing.

Inputs: `fromItems` (= `lastShown`, previous presentation verbatim), `toItems`
(this frame's `e.items`), `t` (eased), plan (pairing), `morphSig` (event key),
`mixSeconds` (dur), `loopTimeMs` (clock). Outputs: `shown` array → `e.items` →
`sceneContract.instances` → draw order (array order = z).

**Testable invariants**

- **I1 (easing monotone):** eased t ∈ [0,1] is monotonic, ends exactly 0 at
  raw≤0 and 1 at raw≥1. **#465 split the curves by role:** the item morph
  eases with `morphEase` (expoOut — snappy arrival, exact endpoints, no
  overshoot; `paletteMix.mjs:56-61`, asserted at paletteMix.selfcheck:211-230),
  the palette dissolve keeps `mixEase` (smootherstep; `paletteMix.mjs:36-39`,
  asserted at paletteMix.selfcheck:39-44).
- **I2 (ORDER ≡ raw at landing — MISSING #419 assertion):** for any frame with
  t∈(0,1), the outputs derived from `toItems` appear in `toItems` relative order,
  fade-outs (`onlyFrom`) appended after; at landing (state deleted) presented order
  is exactly raw resolver order. Today: blend order = groupByAsset order (groups
  first-seen from `fromItems`, greedy-pair order within group, `onlyTo` last —
  itemMorph.mjs:139-159) → flips to raw in ONE frame at completion
  (liveResolve.mjs:410-417). Exact test in §5.
- **I3 (morphState cleanup):** `prune()` deletes `morphState` + `lastShown` for dead
  layers (liveResolve.mjs:86-87); `morphState.delete` on `raw>=1` (:410-411);
  `dispose()` clears both (:427-428). No entry survives its layer.
- **I4 (exactly one replan per sig change):** replan fires only when
  `prevShown.sig !== e.morphSig && mixSeconds > 0` (:391-404); same-sig frames read
  state without re-setting (:406). **Violated in practice — see F5 storm.**
- **I5 (alpha lands exact 0/1, no orphan ghosts):** fade-out alpha `a·(1-t)` → 0 as
  t→1 and the item is dropped (not alpha-rendered) on the landing frame; fade-in →
  `to.alpha`; matched → `to.alpha` (itemMorph.mjs:149,154,158). Ghost count is
  plan-finite; landing frame presents exactly `e.items`.
- **I6 (fromItems = previous presentation verbatim):** `lastShown.set(sig, {items:
  shown})` (:416-417) makes retarget chains compose: morph N+1's `fromItems` = morph
  N's last blend output (:400). A poisoned landing poisons the next morph.
- **I7 (determinism):** `planMorph` greedy ties resolved `d < bd` first-seen
  (itemMorph.mjs:67) → same from/to arrays ⇒ same plan, byte-stable.

## 2. Inventory

| Piece | Location | Selfcheck |
|---|---|---|
| planMorph / matchItems greedy pairing, plan-once (#419) | `engine/kernel/itemMorph.mjs:52-94` | itemMorph.selfcheck (13 tests; #419 block :89-148) |
| blendItems (t≤0/t≥1 ref-equality boundaries) | `itemMorph.mjs:134-161` | itemMorph.selfcheck:41-53 |
| morphState lifecycle (set :399-404, delete :410-411, blend :413, lastShown :416, prune :83-89) | `gl/liveResolve.mjs:383-418` | liveResolve.selfcheck 15/15; #419 test :358-378 (asserts done==raw **after** deletion only), #427 adopt :380-425 |
| morphSig (mode, behave, paletteId, JSON overrides, assets) | `liveResolve.mjs:334-338` | none directly |
| e.items production: placements/swarm :261-328, filter :329, FIELD/FEED/MOD :353-381 (morph runs AFTER patches, by design :383-386) | liveResolve.mjs | liveResolve.selfcheck #343 MOD :188-211 |
| paletteMix cut/start/arming/mix/retarget/cancel/resync | `gl/paletteMix.mjs:66-148` | paletteMix.selfcheck (16 scenarios), spineE §1 |
| pixel-dissolve drive + snapshot/retarget | `gl/liveLoop.mjs:470-485, 661-664, 721-736` | spineE §1 (state machine only; loop wiring untested) |
| voice MIX driver (wall clock `performance.now`) → `commitVoiceMix` | `hooks/useVoiceMixDriver.js:16-27` | none |
| preset/voice stepper ~6 stops/sec (params stepped, palette smooth since Spine D) | `data/voices.js:402-435` | voices.selfcheck (mixVoiceState), spineE §4 |
| float-count spawn/death fade | `particles.js`, `buildPlacements` via liveResolve :151,:257 | spineE §2-§3 |
| morphEvolve tween (wall clock `morphStart: performance.now()`) | `state/slices/davisSlice.js:117-142`, `hooks/useMorphEvolve.js:41-63` | none (numeric keys only — `paramUtils.js:4-10`, never touches morphSig) |
| favorites morph | `FavoritesTray.jsx:38` → AppContext:157 `morphToFavorite` → rides itemMorph via sig change | none |
| draw order downstream: instances pushed in items order `sceneContract.js:242-244`, "draw order = array order" :271, layers bottom→top :262; `packInstanceData` in-order `renderer.mjs:254-283`; isolated blends batched per consecutive same-blend run `renderer.mjs:451-474` (#408, order-preserving) | — | sceneContract.selfcheck |
| runtime infra available for guardrails | `gl/renderFault.mjs` (3 fails / 60 clean, liveLoop:900,914), `state/renderFault`, `state/watchdog`, `gl/governorEventLog` (schema fail-closed: type ∈ {shed,restore}, cutKind ∈ SHED_STEPS — governorEventLog.mjs:67-70), `gl/debug/flagPass` (nan/alpha views) | renderFault×2, watchdog, governorEventLog, debug.selfcheck (browser) |

Name-collision: `studio/blendFallback.selfcheck` is blend-**mode** mapping, not this system.

## 3. Failure modes

| # | Failure | Canvas symptom | Detected today? |
|---|---|---|---|
| F1 | **#444 landing seam**: blend order (groupByAsset groups + greedy pairs + onlyFrom + onlyTo, itemMorph:139-159) → raw resolver order at completion frame (liveResolve:410-417), renderer never re-sorts | z-fight / stacking flip at "the very end" of every chip change | **NOT DETECTED** — #419 test asserts done==raw only AFTER deletion (:376) |
| F2 | **Start seam** (same class): frame 1 presents fromItems verbatim (t=0 ref contract :135), frame 2 presents blend order (to-group order) | stacking flip one frame INTO the morph when from-order ≠ to-order | **NOT DETECTED** — #444's sketched fix (to-order for t>0) does **not** close this |
| F3 | **Slot-index instability**: plan slots are `{g, j}` resolved against THIS frame's group array (itemMorph:141,156). Swarm sorts by scale every frame (liveResolve:181); crossings / count changes reorder the group → slot j hits a different item | mid-flight target crossover, darting; per-frame output order churn → flickering z | **NOT DETECTED** (tests use static arrays / lifeDrift:0) |
| F4 | **Mid-morph slot drop / pop-in**: `if (!to) continue` (itemMorph:142,157). count/density NOT in morphSig — slider mid-morph shrinks a group → item vanishes (alpha>0→gone); growth → new item pops at completion | one-item blink out mid-tween; count change pops at landing | **NOT DETECTED** ("shouldn't mid-transition" comment — it can) |
| F5 | **Phantom-replan storm**: Spine D lerps `paletteOverrides` per frame during auto voice MIX (`voices.js:424-434` → liveLoop:494 → sig :336-337). JSON differs most frames → `morphState.set` every frame → raw≡0 → `blendItems` returns `fromItems` verbatim | **item layout/colors FROZEN for the whole voice/preset MIX** (breath still runs, liveLoop:557-582), O(n²) planMorph/frame, one big morph after the mix ends | **NOT DETECTED** — I4 violated in production; no test runs a voice mix through the resolver |
| F6 | **Dual clock**: itemMorph = `loopTimeMs` (rolled back on paused/cold-boot, liveLoop:784-797); paletteMix + voice driver + morphEvolve = `performance.now()` (paletteMix:478, useVoiceMixDriver:18, davisSlice:137) | morph freezes while paused; if raw≥1 computed on a discarded paused frame, state deletes + lastShown=raw → **resume snaps**, skipping the tween; voice MIX completes on wall clock meanwhile | **NOT DETECTED** |
| F7 | **Both presenters on manual scrub**: pixel dissolve read only for manual voice MIX (liveLoop:661-664), but itemMorph NOT suppressed while `mixSeconds>0` + sig change → hand-scrubbed MIX cross-dissolves the held frame over a deck whose items ALSO morph | double crossfade / double-smoothed transition | **NOT DETECTED** (mutual exclusion is comment-level, liveLoop:653-660) |
| F8 | **Leaked morphState → ghost tween**: state keyed per layer, replaced not appended, pruned at :87 | ghost items sliding under a new layout | Code correct (I3) — no test either (proxy only) |
| F9 | **Layer hidden mid-morph → re-shown**: prune drops state+lastShown → no transition on re-show | re-shown layer snaps to raw (landing skipped) | **NOT DETECTED** (probably acceptable; document) |
| F10 | **slowRender/batchPaused gate physics, not the morph**: drift/swarm frozen (liveResolve:240,287,143) but morph advances on loopTimeMs | morph glides toward frozen targets under governor shed — inconsistent freeze semantics | **NOT DETECTED** (arguably fine; document) |

## 4. Blast radius

**Downstream**
- Draw order = array order within layer slice (sceneContract.js:242-244,:271) →
  `packInstanceData` in-order (renderer.mjs:264-280) → any order discontinuity is a
  one-frame z-flip. Isolated-blend batching (#408) preserves consecutive order.
- `lastShown` feeds the NEXT morph (I6): a bad landing composes into every
  subsequent transition on that layer.
- Parity gate: stills/batch paths don't pass `mixSeconds` (`Number(undefined)||0`
  → off, liveResolve:388,391) ⇒ golden hashes/SNAP/exports never see morph output
  — **extraction must preserve that gate**. paletteMix feeds only the manual-scrub
  deck; SNAP/hex baker take `resolvePalette` hexes (Spine D, voices.js:424) —
  paletteMix is NOT on the export path.

**Upstream**
- `e.items` = placements/swarm (:261-328) → filter (:329) → FIELD/FEED/MOD
  (:353-381) → morph (:387-418). Garbage in lands as garbage (pairing is blind to
  semantics).
- CLOCK: `loopTimeMs` (:387) with rollback semantics (liveLoop:760,784-797) is the
  morph clock; `dtSec` clamp bounds nothing here (raw is wall-delta-free).
- `bakeReady` gates paletteMix arming (paletteMix:96), not itemMorph — bake-wait
  presents morphing items against last-good cells (spine B, by design).

**Peers (the other five)**
- LIFE: targets breathe with drift/warp (endpoints live, #419) — ghosts
  (`onlyFrom`) freeze spatially at plan time while targets move.
- DYNAMICS: #427 adopt-on-enter runs its OWN `matchItems` (liveResolve:129-137)
  before the morph plans — two pairing passes per chip-into-swarm click.
- FIELDS/TRACKS: morph runs after patches so they see true positions (:383-386);
  presented values re-apply patched `...to` spread — OK.
- GOVERNOR: watchdog/`slowRender`/pause interact via F6/F10.

**One-writer files touched by any of this:** `liveLoop.mjs`, `liveResolve.mjs`,
`particles.js`. #444's FIX lives in `itemMorph.mjs` (NOT one-writer); its
integration TEST belongs next to `liveResolve.selfcheck.mjs` (test file only, but
stage separately — the liveResolve selfcheck is that module's gate). Runtime
tripwire wiring inside liveLoop or the morph block = single-owner staging.

## 5. Guardrails

**G1 — ORDER-at-landing assertion (fixes #444 blind spot). Cost: cheap.**
- Invariant: I2.
- (a) **Primary: `itemMorph.selfcheck.mjs`** — pure function, no clock: build `to`
  with interleaved asset groups + unique keys, `plan = planMorph(from, to)`; for
  t ∈ {0.01, 0.5, 0.99}: `out = blendItems(from, to, t, plan)`; project `out` onto
  `to` indices by key, `assert.deepEqual(idx, [...idx].sort((x,y)=>x-y))` (to-derived
  outputs ascend in toItems order), and assert any `from`-only ghost starts at index
  ≥ idx.length (fade-outs appended last).
  Why HERE: the fix lands in itemMorph.mjs; the unit test fails at the source and
  pins emit-order as the module's contract — no resolver plumbing needed.
- (b) **Secondary: extend the existing `#419` test in `liveResolve.selfcheck.mjs:358`**
  with a landing-order projection — `mid` keys ∩ `raw` keys, in `mid` order, must
  deepEqual `raw`'s key sequence. That test ALREADY builds the click→mid→done clock
  sequence, and this is the exact seam frame (delete → fall-through to `e.items`)
  the unit test can't see. One assertion, no new harness.
- (c) Runbook: *"z-fight at end of chip change → run itemMorph #444; if green,
  check start seam (F2) or slot churn (F3)."*

**G2 — generic ORDER-CONTRACT tripwire (class detector). Cost: cheap.**
- Invariant: per layer, a frame whose item key-multiset is unchanged but whose
  order signature changed = presentation reorder event.
- (a) no selfcheck strictly required; add a pure helper test if helper is extracted.
- (b) Runtime, existing infra only: compute `orderSig` from `rl.items` inside
  `buildSceneContract` (sceneContract.js — NOT one-writer; module-level prev-map
  precedented by `warnedMaterials`). Same-set+different-order for ONE frame →
  throttled `console.warn('[order-contract] layer X reordered, set unchanged')`;
  sustained churn (>N consecutive frames — the F3 signature) → escalate through the
  EXISTING `createRenderFaultTracker().noteExternalFault()` → RENDER FAULT pill.
  Do NOT use governorEventLog: fail-closes on non-shed types (governorEventLog.mjs:
  67-70); schema extension needs Matt's nod (open Q).
- (c) Runbook: *"stacking pop with no chip click → tripwire log: landing seam (G1),
  scale-sort churn (F3), or storm restart (F5)."*

**G3 — phantom-replan storm detector (F5). Cost: cheap (detect) / med (fix).**
- Invariant: replans per layer per second ≈ chip clicks (0–2), never ≈ frame rate.
- (a) Selfcheck: `liveResolve.selfcheck` — run a voice-mix-shaped input (paletteOverrides
  new object literal each frame, same refs otherwise) through 3 frames and assert
  `mid` is NOT deepEqual to `start` (progress made) — fails today, becomes the fix's
  gate. (Deliberately placed in liveResolve.selfcheck: the churn is liveResolve's
  sig-comparison behavior, not itemMorph's.)
- (b) Runtime: throttled warn inside the morph block when `morphState.set` fires
  with `nowMs === lastSetMs` repeatedly → liveResolve is ONE-WRITER: stage behind
  the owner (or expose a `morphStats` counter on the resolver return for liveLoop
  to watch — also one-writer).
- (c) Runbook: *"preset/voice change seems ignored for seconds, then jumps → storm;
  check morphSig churn (JSON overrides), not the tween."*

**G4 — alpha/ghost invariant (I5). Cost: cheap.**
- (a) itemMorph.selfcheck: at t=0.99 fade-out alpha < 1 and fade-in within 1 of
  `to.alpha`; landed frame contains no `from`-only keys (extend #419 test in
  liveResolve.selfcheck for the landed-frame key set).
- (b) Visual runtime: existing `gl/debug/flagPass` `alpha` view during a chip change
  — ghosts must darken to black exactly at landing (dev QA, no new code).
- (c) Runbook: *"double-bright sprite at end of chip change → ghost alpha not
  landing; check morphState deletion (I3) + F4 slot drop."*

**G5 — clock-stall guard (F6/F10). Cost: med.**
- (a) liveResolve.selfcheck: paused-style input (constant loopTimeMs across frames)
  → blend output identical frame-to-frame (frozen, no jitter) AND a post-resume
  advance lands; documents rollback semantics as contract.
- (b) Runtime: none cheap without new subsystem — F6's resume-snap needs a runbook
  check + optional console note from existing `diagnostics.mjs` if a morph starts
  while `paused` is latched (liveLoop already knows `paused`, :792).
- (c) Runbook: *"morph stuck half-done / snaps after unpause → loopTimeMs rollback
  (784-797) vs wall-clock voice driver; check which clock advanced."*

**#444 verdict:** the proposed fix (re-emit toItems raw order, fade-outs last) +
the t∈(0,1) relative-order assertion **closes THIS instance (F1) only, not the
class.** Left open: start seam F2 (t=0 returns fromItems by reference — the
ref-equality contract itemMorph.selfcheck:41-53 pins — so frame 2 can still reorder),
slot-by-index identity F3, mid-morph slot drops F4, and layer-re-show snap F9.
Class closure = G2 tripwire (catches every one-frame reorder anywhere) + resolving
plan slots by stable identity instead of index (F3), i.e. a follow-on issue, not
part of #444.

## 6. Extraction plan (toward docs/KINETICS.md convention 3)

Ordered, each step behavior-preserving (golden hashes + parity byte-identical),
one PR each; ⚠ = one-writer file (single-owner staging, no concurrent sessions):

1. **Land G1 assertions first** (test-only: itemMorph.selfcheck + liveResolve.selfcheck)
   — pins today's behavior gaps before anything moves. No production code.
2. **G2 tripwire** in sceneContract.js (non-one-writer) — order visibility before
   refactoring, so extraction regressions self-report on the live canvas.
3. **#444 fix** in itemMorph.mjs (non-one-writer) — assert with G1; QA: slam a
   palette chip, watch the last blend frame (spine-B-style "keeps presenting" + no
   stacking flip). Assignable to a session that never opens liveLoop/liveResolve.
4. **Storm fix (F5)**: stop sig-churn — hash the STEPPED palette position (or drop
   per-frame overrides from sig; paletteMix already tracks palette identity by
   reference, paletteMix:74-80). ⚠ liveResolve.mjs.
5. **Extract the morph block** (liveResolve:383-418) → `engine/kernel/transitions/
   morphMachine.mjs`: pure `stepMorph({lastShown, morphState, layer, nowMs,
   mixSeconds})`. ⚠ liveResolve.mjs. Gate: `mixSeconds` absent ⇒ zero behavior
   change (stills/golden path), parity byte-identical, liveResolve.selfcheck 15/15
   + new assertions green.
6. **Clock audit (F6)**: decide loopTimeMs vs wall for paletteMix/voice driver —
   ⚠ liveLoop.mjs + store actions; separate PR after 5.
7. **paletteMix + voice-driver extraction** last (⚠ liveLoop.mjs) — only after 6,
   so the moved machine carries an already-decided clock.
8. Do NOT touch particles.js for TRANSITIONS (float-count fade is spine-E contract,
   one-writer, owned by DYNAMICS/LIFE work).

## 7. Open questions for Matt

1. **#444 assignment (worth asking):** fix + unit test confined to itemMorph.mjs/
   .selfcheck — safe for a session NOT on the live loop. Options: (a) assign now
   (embargo reads no-*features*; this is canvas-correctness), (b) queue behind the
   Night Migration play, (c) bundle with G2 tripwire as one "order contract" PR.
   **Recommend (a)** — the only open canvas glitch firing on *every* chip change.
2. **F5 storm — is frozen-during-MIX intended feel?** During a preset/voice MIX the
   code freezes item presentation until the mix ends, then morphs. Options: (a) fix
   sig-churn so items animate live through the mix (my read of intent), (b) gate
   itemMorph OFF during voice MIX (pixel deck owns it), (c) accept.
   **Recommend (a)**, (b) as cheap fallback; needs your feel call.
3. **Start seam F2:** after the #444 fix a one-frame reorder can still occur frame
   1→2 (t=0 boundary is ref-pinned). Options: (a) accept (flips only where items
   overlap at t≈0), (b) renderer-side per-instance z (hash risk, big job).
   **Recommend (a) + G2 logging** so acceptance is measured.
4. **Tripwire channel:** console+renderFault pill (recommended, free) vs extending
   governorEventLog's fail-closed schema with an 'anomaly' type (flight recorder
   visibility, schema v1 change). **Recommend console+pill now.**
5. **Manual-scrub double presentation (F7):** (a) suppress itemMorph while
   `mixEv.kind==='mix'`/scrub active (mutual exclusion made real), (b) keep both
   (double-smoothed look). **Recommend (a)** — matches liveLoop:653-660 comment;
   verify by eye first.
