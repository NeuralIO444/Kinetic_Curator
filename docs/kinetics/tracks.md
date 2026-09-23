# KINETICS / TRACKS — design & protection brief

**Scope:** TRACKS = self-feedback patches — motion driving its own look (`docs/KINETICS.md:90-101`).
MOD / FEED / FIELD. Read-only analysis; all refs verified by reading. Embargo stands:
protection + design of *existing* systems only. Exemplar bug class = **#444** (array order =
draw order, flips in one frame — `itemMorph.mjs:139-159` asset-group order vs
`liveResolve.mjs:407` raw resolver order, no re-sort in `renderer.mjs:254-284`).

## 1. Contract — testable invariants

- **I1 (knob range):** `applyMod` output always finite: `glow,fade ∈ [0,1]`, `displace ≥ 0`,
  regardless of metrics input — incl. `NaN`/`Infinity`/missing fields. **Currently FALSE:**
  `clamp01(NaN) → NaN` (`trackGraph.js:125-127,138-139`); base knobs are guarded (`:135-137`)
  but metric fields are not. `Infinity` survives to the knob but is bounded at the call site
  (`liveResolve.mjs:376` `min(HOP_MAX_PX, …)`).
- **I2 (off/field pass-through byte-exact):** `applyMod` in `off`/`field` mode returns knobs
  untouched (`trackGraph.js:131`); `applyField` in non-field mode / empty source returns
  identity copies (`:146-148`). Held + asserted (`trackGraph.mod.selfcheck.mjs:31-34`,
  `trackGraph.field.selfcheck.mjs:44-49`).
- **I3 (hop ≤ 4 px/frame):** every FIELD/FEED position change presented per frame ≤ 4 px;
  MOD displace ≤ 0.6 px x-only. Held **only** at the application site (`liveResolve.mjs:19-28,
  361, 366, 376`) — the kernel (`applyFeed trackGraph.js:189-197`, raw flow ≤ ~0.05 normalized ≈
  tens of px) is uncapped and **no selfcheck asserts ≤ 4 px anywhere**.
- **I4 (bounded evaluation):** patch evaluation is exactly ONE sweep per resolve, in layer-array
  order (`liveResolve.mjs:353-379`) — no recursion, no fixpoint; a cyclic patch graph therefore
  cannot run unbounded *in the live path*. The cycle detector exists (`hasCycle trackGraph.js:69`,
  `scheduleFrame:98`, `tapePreflight:213`) but has **zero consumers** — invariant held by
  construction, unasserted, flag dead.
- **I5 (patch bounds):** `strength ∈ [0,4]` (`trackGraph.js:31`; UI further clamps `[0,1]`
  `layersSlice.js:85`), `polarity ∈ {−1,1}` (`:26`), `mode ∈ PATCH_MODES` (`:21`, whitelisted at
  state `layersSlice.js:82`), track ids clamped 0–3 (`:13-17`).
- **I6 (determinism):** same metrics + patch → same knobs, same run and across runs
  (`trackGraph.mod.selfcheck.mjs:64-67`; field `:57-60`).
- **I7 (order/zip alignment):** patch passes preserve item length, order, and index pairing —
  `pulled[k] ↔ items[k]` in `clampHop` zips (`liveResolve.mjs:361,366`), and `pushSource(i)`
  index (`:380`) must equal the panel ordinal `patch.to` (`LayersPanel.jsx:65-71`).
  **Currently FALSE when any content layer is hidden** (see F8) — this is TRACKS' #444-class
  contract.
- **I8 (index identity):** `patch.to` denotes a content *ordinal*, but the live resolver looks
  it up in `content[]` = visible-only non-FX layers (`liveResolve.mjs:211, 341, 357, 368`).
  Ordinal ≠ index under visibility/reorder/remove → silent retarget (F8).

## 2. Inventory (file:line + selfchecks)

| Piece | Where | Selfcheck |
|---|---|---|
| Patch normalizer (strength/polarity/mode) | `kernel/tracks/trackGraph.js:19-34` | field `:13-16`, mod `:8-9` |
| Graph compile: `activePatches/patchEdges/hasCycle/liveEdges/scheduleFrame` | `trackGraph.js:60-101` (cycle flag `:98`) | **NONE — and no runtime consumers (dead)** |
| `tapePreflight` / `feedTextureBytes` (FEED memory) | `trackGraph.js:199-216` | **NONE — zero consumers; tape budget never counts FEED bytes** (`state/tapeBudget.js:30-59` measures GPU ms only) |
| `motionMetrics` — fed by `content[patch.to].items` via `toNormVel` (`liveResolve.mjs:369,345`: x/y normalized, vx/vy raw px/tick) | `trackGraph.js:103-123` | mod `:12-29` (empty/still/cancel) |
| `applyMod` — glow/fade `clamp01`, displace ≥ 0 | `trackGraph.js:129-142` | mod `:31-67` incl. tamper guard `:31-34`, extremes `:54-58` |
| **Knob consumers (the whole downstream):** glow→`scale×(1+g·.35)`, fade→`alpha×(1−f·.4)` cl 0–100, displace→`x + min(4,d)·0.15` (x-only) | `liveResolve.mjs:370-377` | none (inside one-writer file) |
| `applyField` — `gain=0.002·strength·polarity`, neighbor hash | `trackGraph.js:144-168`; consts `fieldHash.js:1-3` (R=0.35, SOFT=1e-4) | field `:18-60` (no dense-stack test) |
| FEED hop cap `HOP_MAX_PX=4` + `clampHop` | `liveResolve.mjs:19-28`, applied `:361,366` | **NONE** (cap lives in one-writer file, untested) |
| `feedLive` delay-1 (rasterize → push → commit) | `tracks/feedLive.js:5-44`; alloc `:12` | `feedLive.selfcheck.mjs` — **NOT wired into `npm run selfcheck`** (`app/package.json:11` has field+mod only, grep `feedLive` = 0) |
| `feedDelay` buffers | `tracks/feedDelay.js:3-39` | via feedLive selfcheck `:8-16` |
| `feedOps` grad/curl + `fieldInvariants` | `tracks/feedOps.js:16-71` | `fieldInvariants` has **no consumers** |
| UI entry: PATCH row → `setLayerPatch` | `LayersPanel.jsx:52,133-153`; state `layersSlice.js:79-90`; init `:53,:72`; dup `:108` | `undoLayers` covers undo, not semantics |
| 4-content-track cap (#340) | `layersSlice.js:8,61,96` — **NOT enforced on doc load** (`projectNormalize.js:16,117` caps 16 total) | `projectDocument.selfcheck` (MAX_LAYERS only) |
| Patch dropped on save/load | `projectNormalize.js:122-131` builds layers **without `patch`** | **NONE — round-trip loss untested** |
| One-writer surfaces touched | `gl/liveResolve.mjs:341-418`, `gl/liveLoop.mjs:487` (call site), `engine/particles.js:1130-1132` (vx provider, #343) | — |

## 3. Failure modes

| # | Failure | Canvas symptom | Detected today? |
|---|---|---|---|
| F1 | `NaN` metrics → `clamp01(NaN)=NaN` knob (`trackGraph.js:138-140`) | NaN scale/alpha → GPU NaN pixels (magenta only under `flagPass`, `debug/flagPass.mjs`, `selfcheck.page.mjs:186-222`); `renderFault` never trips (no throw) | **NOT DETECTED** (debug view only) |
| F2 | Clamp violation (glow>1 etc.) from extreme-but-finite metrics | blown-up scale / opaque flash | DETECTED in selfcheck (`mod:54-58`) — **not at runtime** |
| F3 | Feedback loop: agitation↑→displace↑→agitation↑? **No live loop:** knobs feed only presentation (`liveResolve:374-376`); metrics read particle `vx` state (`particles.js:1132`), never positions or knob outputs → MOD is open-loop. FEED *is* closed (positions→raster `feedLive:11-20`→curl flow→hop→positions, delay-1) but per-frame gain ≤4 px (I3) and raster collapses to binary luma (self-damping). | if broken: runaway scale drift / wandering swarm | Loop *bounded by construction*; **no divergence detector, no convergence test** |
| F4 | Hop storm during morph: hops are applied **before** the morph block (`:353-379` vs `:387-418`), so on-screen hop = blend-weighted (`lerp(f,to,t)`, `itemMorph:145`) ≤ 4·t px; at completion raw hop applied at full 4 px in one frame + order flip (#444) | end-of-morph micro-jitter stacked on the z-fight | Cap holds (I3) but **untested**; ordering documented in comment `liveResolve:383-386`, unasserted |
| F5 | Patch evaluated in wrong mode (mode string garbage) | patch does nothing / wrong effect | DETECTED: kernel tamper guard `mod.selfcheck:33-34` + state whitelist `layersSlice:82`. End-to-end branch select untested |
| F6 | Cycle flag set but ignored | none possible: live path ignores `hasCycle` entirely and evaluates one sweep (I4) | Flag itself is **dead code** (§2) — the *invariant* is unasserted |
| F7 | Patches dropped on save/load (`projectNormalize:122-131`) | MOD/FEED/FIELD silently off after reload; performer can't tell why | **NOT DETECTED** |
| F8 | **#444-class:** hidden layer (`:211`), reorder (`layersSlice:146-153`), or remove (`:125-136`) shifts `content[]` indices while `patch.to` (stored ordinal) stays → patch reads/acts on the **wrong track**, or `content[patch.to]` is `undefined` → silent no-op. Solo (`:118-123`) hides layers → same. One frame, silent. | tracks cross-wired after any layer edit; solo silently retargets MOD/FIELD/FEED | **NOT DETECTED** |
| F9 | `applyField` dense stack: neighbor count per 3×3 cell ring unbounded (`fieldHash.js:45-66`) → sum of forces can exceed any sane magnitude in kernel | layer snaps off-canvas — except `clampHop` (`:361`) shaves it back to 4 px | Bounded only at call site; kernel-level **NOT DETECTED**, no dense selfcheck |
| F10 | FEED memory + GC: `pushSource` runs for **every** content layer **every** frame (`liveResolve:380`, unconditional) → `new Float32Array(w·h)` per layer per frame (`feedLive:12`, ~0.5 MB at 1920×1080) + flow buffer per `field()` call (`feedOps:19/32`); `tapePreflight` accounting is dead | GC hitches under load; tape/governor blind to FEED cost | **NOT DETECTED** (tapeBudget = GPU ms only) |
| F11 | #340 bypass: doc load allows >4 content layers (`projectNormalize:16,117`) | >4 tracks resolve per frame; `patch.to` clamped 0–3 → patches can't reach tracks 5+ | **NOT DETECTED** |
| F12 | MOD on placement tracks: `buildPlacements` emits no `vx/vy` → metrics ≡ 0 → glow/fade/displace dead in grid/fibonacci modes (also blind to drift/warp *positional* motion) | "look follows motion" silently off outside swarm modes | NOT DETECTED (may be intended — Q5) |

## 4. Blast radius

**Downstream — knob consumers traced (answers: ACCUM glow? warp?):**
`applyMod`'s knobs are consumed **entirely inside `liveResolve.mjs:370-377`** — nothing named
"glow/fade/displace" escapes. glow→`scale` (`:374`) → `packInstanceData` sx/sy (`renderer.mjs:270`)
→ sprite footprint → **indirect** ACCUM effect (bigger sprite deposits more trail) — but ACCUM's
`glow` param is the *audio* envelope (`liveLoop.mjs:431,646`), a different noun. fade→`alpha`
(`:375`) → instance opacity (`renderer:271`) → blend + trail intensity. displace→`x` (`:376`) →
(a) `feedLive.pushSource` raster (`:380`) → next frame's FEED curl flow (cross-track feedback
channel), (b) `planMorph` pairing at transition start (`:399-404` runs post-patch), (c) rendered
x — **never** draw order (maps preserve length/order; TRACKS never sorts). Warp is *upstream*
(`:287-327`, driven by `layoutParams.displacement`, runs inside the layer loop before patches).

**FEED hops → item positions →:** renderer x/y (immediate, copy-only — sim state untouched),
`pushSource` delay buffer (delay-1), morph `fromItems` via `lastShown` (`:416`) — so a hop baked
into last frame's presentation seeds the *next* transition's pairing baseline. Not fed into
`ParticleSystem` state → DYNAMICS unaffected.

**Upstream:** metrics ← DYNAMICS (`particles.js:1130-1132`, scene units/tick; `dtFrames`
integration `:625,976-983` makes agitation FPS-stable, spine-A-safe) ← CLOCK cadence (resolve once
per tick, `liveLoop:487`, dtSec/loopTimeMs). LIFE-adjacent: life drift (`liveResolve:50-63`) and
`alphaBoost/scaleMul` (`:168-176`) apply **before** patches → MOD multiplies onto drifted values.
Placement tracks: no vx → metrics zero (F12).

**Peers (the six seams):**
- **TRANSITIONS (prime seam):** order inside `resolveLayers` is *patches → feedLive push/commit →
  morph plan/blend* (`:353-381` before `:387-418`), deliberate per comment `:383-386`. The
  completion frame `:407-413` = #444; TRACKS effects ride per-item so they don't *cause* the
  flip, but `planMorph` pairs on **post-patch** positions → a ≤4 px hop can flip a greedy
  near-tied pair at transition start. An ordering assertion is the guard (G5).
- **DYNAMICS:** metrics source + `adoptPositions` interplay — hops never reach the integrator
  (copies). Presented ≠ simulated during hops; metrics read simulated only.
- **FIELDS:** `kernel/tracks/fieldHash.js` is tracks'-own (R=0.35); FIELD track ≠ FIELDS system —
  name collision risk in issue titles (prefix rule, `KINETICS.md:121-123`).
- **CLOCK:** no dt inside metrics (velocity state, not frame delta) → hop/knob amounts are
  per-frame constants; at low FPS a "4 px/frame" hop becomes 4 px per *fewer* seconds →
  visually slower hop at 30 fps (dt-blind cap — minor, note only).
- **LIFE:** see upstream; drift feeds patched values, no reverse channel.
- **GOVERNOR/TRAILS:** no cost tier for tracks (`tapeBudget.js:6-13` admits per-track estimator
  doesn't exist); FEED bytes invisible (F10); slowRender/`!running` gates drift + swarm update
  (`liveResolve:240,143`) but the patch block `:353-379` has no such gate — whether the tick
  reaches it during a freeze is **UNVERIFIED** (worth a runbook probe).

**One-writer flags:** any change to `liveResolve.mjs` (patch+morph region), `liveLoop.mjs`
(call site), `particles.js` (vx provider) requires single-owner staging. `trackGraph.js` /
`feedLive.js` are not formally one-writer but are live-loop-shared — stage them too.

## 5. Guardrails

**G1 — Knob-range tripwire at the application site** *(cheap)*
Invariant: post-`applyMod`, `glow/fade∈[0,1]`, `displace≥0`, and the derived `scale/alpha/x`
(`liveResolve:374-376`) are finite.
(a) selfcheck: extend `trackGraph.mod.selfcheck.mjs` — assert I1 under `NaN`/`Infinity` metrics
and empty metrics (fails today → drives the `clamp01` harden).
(b) runtime (existing infra only): at `:374-377`, `if (!Number.isFinite(v))` → **throw** the
frame; the tick's catch → `noteFrameFailure` (`gl/renderFault.mjs:48`, wired `liveLoop:293,914`)
→ 3-strikes → `setRenderFault` pill (`globalSlice.js:297`). NaN then *reads* as a fault instead
of silently painting. Fallback for non-fatal cases: `diagnosticsLog.record` (`debug/diagnostics.mjs:98-114`,
generic, browser-safe).
(c) runbook: "RENDER FAULT reason contains `frame fault: TRACKS knob …` → check patch strength
input / metric source; `flagPass` range view confirms on GPU."

**G2 — Harden `clamp01`** *(cheap)* — `trackGraph.js:125-127`: `clamp01(NaN)=0` (finite inputs
byte-identical → hash-safe). Selfcheck G1 covers it. This is the kernel-side half of G1.

**G3 — Hop-cap ownership + step-size assert** *(cheap → med)*
Invariant: I3 holds *where it's tested*. (a) selfcheck: `feedLive.selfcheck.mjs` — adversarial
max-contrast raster, assert `hypot(Δ) ≤ 4px` per point (and wire this file into
`package.json:11` — currently **orphaned**); assert zip alignment: output length/order ==
input, `pulled[k]` pairs `items[k]`.
(b) runtime: per-track frame-to-frame presented-position delta; >4 px → one-shot
`diagnosticsLog.record({kind:'tracks/hop-cap', …})` (rolling, deduped).
(c) runbook: "hop-cap event → FEED/FIELD strength source or index map broken (F8)".

**G4 — Feedback-loop divergence detector** *(med)*
Invariant: per-track `agitation` and mean `|Δpos|` stay in a rolling envelope; no monotone
N-frame rise. (a) selfcheck: pure 600-frame delay-1 FEED simulation on synthetic points
(`feedLive` is node-instantiable today) asserting bounded total drift + no monotone trend;
MOD chain assert: metrics-of-knobs == metrics-of-base (proves I4 open-loop claim).
(b) runtime: trend watch in the resolver's patch stage; warn via **`diagnosticsLog`**
(generic ring, zero new subsystem). ⚠ `governorEventLog.recordGovernorEvent` **throws on any
`cutKind` outside `SHED_STEPS`** (`governorEventLog.mjs:42,67-74`) — reusing it needs one new
cutKind, which redefines the shed-step schema → Matt's call (Q4).
(c) runbook: "divergence warning → note the track ordinal + strength; reduce FEED strength,
file against TRACKS."

**G5 — Hop-vs-morph ordering assertion** *(med)*
Invariant: stage order is exactly `TRACKS patches → pushSource/commit → TRANSITIONS morph`,
and the completion frame presents `e.items` (resolver order) with patch effects applied but
**not reordered**. (a) selfcheck: after extraction (§6), assert the named stage list
(tamper-guard style, `mod.selfcheck:31-34` pattern); plus a direct #444-class check —
`applyX` output key-sequence === input key-sequence, length-equal.
(b) runtime: dev-only assert in the morph block: key-sequence of `shown` at completion ===
key-sequence of `e.items` — **this is the assertion that would have caught #444** (it fails on
the `:407-413` flip because `blendItems` emitted asset-group order).
(c) runbook: "assert fires → the completion frame re-ordered; re-emit in `toItems` order (#444)."

**G6 — Index-alignment tripwire (TRACKS' #444-analog)** *(cheap)*
Invariant: I8 — `patch.to` (panel ordinal over **all** content layers) resolves to the same
track as `content[]` lookup and `pushSource(i)`. (a) selfcheck: layers `[A visible, B hidden,
C]` → assert mapping equality — **fails today**; lands with the F8 fix (needs Matt, Q1).
(b) runtime: when `patch.mode !== 'off'` and `content[patch.to]` is `undefined` or the ordinal
map disagrees → `diagnosticsLog.record({kind:'tracks/index-drift', …})` once per change (works
even before the fix — turns silent retarget into a visible diagnosis).
(c) runbook: "index-drift → hidden/reordered layer under an armed patch; solo or reorder is the
usual trigger."

**G7 — Dead graph API disposition + single-sweep assert** *(cheap)*
Invariant: I4. Either delete `scheduleFrame/hasCycle/tapePreflight/activePatches/armed`
(zero consumers, verified by grep) or wire them: fold `scheduleFrame` into the extraction-stage
compile step and `tapePreflight` into `tapeBudget` (F10). Selfcheck: assert "one sweep" by
construction — patch stage returns after one pass (structure test post-extraction). Decision →
Q3. Until then: G4's MOD open-loop assert is the living proof.

**G8 — FEED memory visibility** *(cheap)*
Selfcheck: `feedTextureBytes` math (`trackGraph.js:199-203`) + unconditional-`pushSource` cost
documented; runtime: session-once `diagnosticsLog` entry with feed count + bytes when any FEED
patch arms (reuses existing ring buffer; no new subsystem). Governor shed for FEED = new
feature → embargo-blocked; log only.

**#444 verdict for TRACKS:** TRACKS cannot *originate* the order-flip class today — every pass
is a length/order-preserving `map`/zip (`liveResolve:360-377`, `trackGraph:152-166,193-196`), and
nothing re-sorts (the renderer's non-sorting is exactly why #444 exists — `renderer.mjs:264`).
**G5's key-sequence assert is the guardrail that would catch #444's class** and it doubles as
TRACKS' own zip contract; **G6 is the TRACKS-specific instance of that class** — a stored-index
vs live-array drift (F8) that flips *which track is patched* in one frame, silently, on hide /
reorder / solo / remove. TRACKS' equivalent of "#444's contract" is *index identity*, not draw
order — and it is currently broken and undetected.

## 6. Extraction plan — toward `KINETICS.md:127-131` (thin liveResolve pipeline)

Ordered, hash/parity-safe, behavior-preserving until step 4. **[1W] = touches a one-writer file.**

1. **Wire the orphan selfcheck** — add `feedLive.selfcheck.mjs` to `package.json:11`; extend
   `mod/field/feedLive` selfchecks with G1/G2 asserts (NaN), G3 (≤4 px + zip alignment), G4
   (600-frame bounded-drift). Kernel files only; no engine behavior change. *(cheap)*
2. **Extract the patch stage** — new `kernel/tracks/applyPatches.mjs`: move
   `liveResolve.mjs:341-381` verbatim (`toNorm/toNormVel/patchStrength/HOP_MAX_PX/clampHop`
   included; cap moves out of the one-writer file into the kernel where it belongs).
   `[1W liveResolve.mjs]` — golden hashes + parity byte-identical; QA: FEED hop ≤4 px, FIELD
   pull, MOD glow on a swarm source, morph start unchanged. *(med)*
3. **Stage-list assert** — named pipeline constant
   `[… TRACKS.patches, TRACKS.feedCommit, TRANSITIONS.morph …]` + selfcheck (G5) — tamper guard
   against reordering during future edits. Same PR as 2 or immediate follow-up. *(cheap)*
4. **Index/round-trip fixes (F7/F8/F11)** — ordinal→track resolution fix, `patch` preserved in
   `projectNormalize:122-131` (through `normalizePatch`), content-cap on load. **Behavior
   changes → needs Matt's nod first (Q1, Q2); embargo: fixes, not features.** `[1W if liveResolve
   index map changes]` — no golden hash should move (off-mode path identical). *(med)*
5. **Graph-API disposition (G7/G8)** — wire `tapePreflight` into `tapeBudget` for FEED bytes and
   fold `scheduleFrame` in as the patch stage's compile step, *or* delete all five exports.
   Q3 decides. *(cheap)*
6. **Runtime hooks** — G1 throw→renderFault, G3/G4/G6 → `diagnosticsLog` (all existing infra).
   `[1W liveResolve or post-extraction applyPatches]`. *(med)*
7. **Thin orchestrator** — `resolveLayers` reads CLOCK → LIFE.ambient → FIELDS.worldNoise →
   **TRACKS.patches** → TRANSITIONS.morph → items; each arrow an import with its own selfcheck.
   One PR, one writer, parity byte-identical (`KINETICS.md:127-131`). *(expensive — last)*

## 7. Open questions for Matt (decision-shaped)

1. **What does `patch.to` mean — a slot ordinal or a layer identity?**
   Options: (a) keep ordinals, remap on reorder/remove and resolve against *all* content layers
   (fixes F8, keeps the UI model); (b) store target layer id (robust, more surgery);
   (c) declare "ordinal = current stack slot, drift is intended" (document it, G6 log only).
   **Recommend (a)** — smallest change that kills the silent retarget; ships with step 4.
2. **Should patches survive save/load?** They're dropped today (`projectNormalize:122-131`).
   Options: (a) preserve via `normalizePatch` (default `mode:'off'` stays safe); (b) drop is
   intentional (patches = live performance state). **Recommend (a)** — losing an armed FEED
   silently after reload contradicts the honest-readout creed.
3. **Dead graph API: wire or delete?** `scheduleFrame/hasCycle/tapePreflight/activePatches/armed`
   have zero consumers. Options: (a) wire `tapePreflight` into tape budget (FEED bytes are real,
   F10) + fold `scheduleFrame` into the extraction stage; (b) delete all five (cycle is
   harmless-by-construction under one-sweep). **Recommend (a) for tapePreflight, delete
   `armed`/`hasCycle` unless (a) needs them** — dead exports rot the contract.
4. **TRACKS runtime warnings: which channel?** `governorEventLog` throws on unknown `cutKind`
   (closed shed-step schema, `governorEventLog.mjs:42,72-74`); options: (a) log to
   `diagnosticsLog` only (zero schema change — **recommend**); (b) add a `tracks` cutKind
   (extends the flight recorder, redefines "step"; needs `governorEventLog.selfcheck` update).
   **Recommend (a) now, (b) if post-set review should surface TRACKS events.**
5. **Is MOD being a no-op outside swarm modes intended?** Placement tracks emit no vx →
   metrics ≡ 0 → no glow/fade/displace in grid/fibonacci (F12). Options: (a) accept, document
   "MOD couples to DYNAMICS motion" (**recommend — honest coupling, no fake motion**);
   (b) derive frame-delta velocity (extra pass, dt-blind). Embargo: file as TRACKS feel question,
   don't build.
