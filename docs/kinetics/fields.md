# FIELDS — deep design brief (spatial structure motion reads)

Umbrella: `docs/KINETICS.md` §FIELDS (:73-88). Read-only analysis; all line refs verified
2026-09-22 against the files as they stand. One-writer files touched by this system:
`gl/liveResolve.mjs` (worldNoise, warp, prune), `engine/particles.js` (curl wind, scent),
`gl/liveLoop.mjs` (loopTimeMs, FLOW wiring).

## 1. Contract

FIELDS owns every *spatial* field motion reads: the simplex/fBm kernel, the per-project
world noise lifecycle, the displacement warp (baked + live), placement fBm, the scent/
FIELD diffusion grids, curl, and FLOW's trail advection. Inputs: seed(s), `loopTimeMs`/
`dtSec` (CLOCK), `lp.displacement/noiseFreq/noiseSpeed/jitter` (LIFE-drift-mutated), item
positions. Outputs: warped item coordinates, wind forces, density/gradient values,
advected trail UVs.

Testable invariants:

- **I1 seed→field determinism** — `createNoise(s).fBm3D(x,y,z,3)` is bit-identical for a
  given (s, x, y, z, octaves), across instances and interleaved use (`noise.js:158`;
  perm isolation `noise.js:16-29`).
- **I2 nt phase continuity** — a layer's warp phase (`wp.base`) advances monotonically by
  `∫ noiseSpeed dt` (`liveResolve.mjs:300-304`) and must not jump on: prune+re-show,
  focus swap, pause/resume, governor slowRender edges, chip morph completion, reseed
  (reseed is an allowed *field* re-roll, but not a *phase* reset on the same field).
- **I3 placement byte-stability** — under `slowRender`/stills the warp pass never runs
  (`liveResolve.mjs:287`); geometry output is the seed-slice pin
  (`placement.js:109`), so golden hashes and SNAP/still bytes never move.
- **I4 warp amplitude tracks `lp.displacement` within clamp** — live delta =
  `(fBm3D(ntLive) − fBm3D(nt0)) × displacement` (`liveResolve.mjs:317-324`); displacement
  is LIFE-clamped `[0,250]` (`:58`), noiseSpeed `[0.1,3]` (`:61`); amplitude 0 ⇔ pass off.
- **I5 curl from one instance** — every curl/wind sample in a frame comes from the
  injected `worldNoise` (`liveResolve.mjs:274` → `particles.js:640-641,766-776`), with
  domain offset `seedOffsets.noise*100` (`:275`, `particles.js:669-670`); two same-seed
  tracks read the same field.
- **I6 order/count preservation** — the warp pass (`items.map`, `liveResolve.mjs:311-326`)
  preserves length and index order, and runs *before* the TRANSITIONS morph (`:389-418`)
  every frame, including the completion frame.

## 2. Inventory

| Piece | Location | Selfcheck / spec |
|---|---|---|
| Seeded 3D simplex + fBm + curl2, perm isolation, legacy `_default(444)` | `engine/noise.js:16-29,115-129,135-151,158-168,171` | `engine/kernel/noise.selfcheck.mjs` (AC1-AC3, octave pin); Rust mirror `kernel/bake/swarmWasm.selfcheck.mjs:53`, `rust/swarm-bake/src/lib.rs:733` |
| worldNoise lifecycle (per-project, focusSwap adopt vs reseed) | `gl/liveResolve.mjs:69-70,197-209,431-432` | `gl/liveResolve.selfcheck.mjs` #425 (held vs rerolled, :320-356); `docs/SPINE_REVIEW_C_F.md` :58 |
| Displacement warp, nt0 + accumulated warpPhase (#432/#436) | `gl/liveResolve.mjs:81,287-327` (nt0 :298, phase :300-304, samples :317-320) | `gl/spineF.selfcheck.mjs` :189-255 (breathes; t0==slowRender), :257-291 (layers bands) |
| warpPhase/cache prune on layer death | `gl/liveResolve.mjs:83-89` (warpPhase :88), call `:420` | **none** |
| Baked placement fBm (own instance, frozen nt) | `engine/placement.js:106-109,134-139`; stage split header `:9-22` | `goldenPlacement.selfcheck.mjs` (4 hashes incl. displacement + noiseOffset), `buildPlacements.selfcheck.mjs`, `engine/stagedEval.selfcheck.mjs` |
| geoSig / cache | `placement.js:214-222`; `buildPlacements.js:109-124,129-132,183-191` | `buildPlacements.selfcheck.mjs` (determinism), `useCanvasItems.selfcheck.mjs` |
| LIFE→FIELDS seam: drift mutates jitter/displacement/noiseSpeed → geoSig | `liveResolve.mjs:50-63` (call `:244`); #431 comment `:41-49` | `liveResolve.selfcheck.mjs` #425 drift pause/swap (:256-318) — no cadence assert |
| Scent diffusion grid (64×36, tier 0) | `engine/kernel/field/scent.js:34-103,105-112`; deposit/step `particles.js:1088,1091`, lazy create `:689` | `kernel/field/scent.selfcheck.mjs`; `engine/bioDrives.selfcheck.mjs:106-136` |
| FIELD density / CA mask / rejection sampling | `engine/kernel/field/index.js:21-127` (noise field mints own instance `:89`) | `kernel/field/field.selfcheck.mjs` (determinism, index-stability) |
| FIELD patch (point forces) + fieldHash | `kernel/tracks/trackGraph.js:2,144`; `gl/liveResolve.mjs:353-361` | `trackGraph.field.selfcheck.mjs`, `liveResolve.selfcheck.mjs` #343 |
| Curl wind (DYNAMICS consumer) | `particles.js:704,709-722,766-776` (point wind `:777-791`); reference `particles.reference.mjs:172` | `spineF.selfcheck.mjs` :47-71 (divergence 0), :73-105 (shared tracks — weak) |
| FLOW (#284) trail advection | `gl/accum.mjs:152,297-333` (flowVec `:320-329`), mirror `:751-757`, step `:1124-1134`; slider `data/layout-modes.js:71,166`; wiring `liveLoop.mjs:642` | `accum.selfcheck.mjs` :111-118, :539-547 (GPU↔JS mirror); spec `docs/ACCUM.md:41-43,210-220` |
| Downstream pack (array order = draw order) | `gl/renderer.mjs:254-284` (spine-B skip `:268`) | `sceneContract.selfcheck.mjs`; #444 exemplar |

Spec docs: `docs/NOISE_AND_LAYERS.md` (§2.1-2.4 = the FIELDS plan of record), `docs/ACCUM.md`,
`docs/SPINE_REVIEW_C_F.md`, `docs/ENGINE_PLAN.md` §3F + §6 (:213-223, all shipped),
`docs/KINETICS.md` :73-85.

## 3. Failure modes

| Failure | Canvas symptom | Detected today? |
|---|---|---|
| Reseed mid-play (focusSwap false, `liveResolve:198-208`) | worldNoise perm table re-rolls → warp offset + curl wind re-shape in ONE frame; usually masked because seed also re-scatters placement/swarm (geoSig / initKey contain seed) | PARTIAL — reseed *happens* asserted (`liveResolve.selfcheck:354`); the jolt itself not asserted, focus-swap continuity is (:353) |
| warpPhase prune (`:88` → re-show) | layer hidden (or `visible:false`) → prune deletes its phase; re-show recreates `base:0` (`:301`) → ntLive snaps to nt0 → warp delta drops to 0 → all items jump back to seed-slice positions in one frame | **NOT DETECTED** — no test hides/re-shows a layer |
| Governor/watchdog `slowRender` edges | entry: warp pass skipped (`:287`) → live delta vanishes instantly (pop to seed slice); exit: warpPhase frozen while skipped, and `loopTimeMs` kept advancing for presented frames (`liveLoop:760`, rolled back only on `!frame`/`paused` `:785/:794`) → catch-up `dSec` jump (`:302`) | **NOT DETECTED** — spineF only tests slowRender as a steady state |
| Perm-table aliasing between projects | two projects' fields correlate / leak | DETECTED — `kernel/noise.selfcheck.mjs` AC1/AC3 (interleaved-instance isolation). Latent: legacy `_default` (`noise.js:171`) is one shared instance if any legacy import survives |
| Placement rebuild spike (geoSig invalidation) | LIFE drift rounds jitter/displacement every frame (`:55-58`) → all three are geoSig fields (`placement.js:217-219`) → full geometry re-sample + fBm rebuild; the old quantized phase did it in lockstep per layer (documented #431 `:41-49`) | DOCUMENTED only — no cadence/miss-rate assert |
| Live/still hex drift (warp leaks into stills) | SNAP/still bytes move, golden hashes churn | DETECTED — gate at `:287`, `spineF:244-248` (t0==slowRender), `goldenPlacement` bit-identical (`SPINE_REVIEW:31`) |
| Curl/wind divergence (two instances disagreeing) | two same-seed tracks drift into different currents; placement warp and live delta sample *different* instances by design (placement `hashU32(CH.noise)` `placement.js:107` vs worldNoise) | **WEAK/NOT** — `spineF:73-105` only asserts non-zero velocities, never that both tracks read the same field |
| FLOW field ≠ world noise (GPU `vnoise`, **seedless**, not divergence-free — `ACCUM.md:220`) | trail braiding identical across projects; KINETICS:83 says "curl-advects" but code is a static curl-*ish* vector field | Mirror parity DETECTED (`accum.selfcheck`); contract divergence **NOT DETECTED** (doc/impl mismatch) |
| Scent grid persists across shuffle | deposits from the old seed's layout keep steering mold/chemotaxis after a re-roll (`particles.js:688-689` — persists by comment; `clear()` never called in engine) | **NOT DETECTED** — `clear()` only exercised in selfchecks |
| Non-finite fBm input (corrupt `lp`/NaN position) | NaN coords → `packInstanceData` packs them silently (`renderer.mjs:269`) → items vanish or garbage | MANUAL only — `gl/debug/flagPass.mjs` `nan` view; no automatic trip |
| Stage-order inversion (warp moved after morph in a future refactor) | targets double-warped during blend; completion frame = #444-class one-frame flip | **NOT DETECTED** (no order/stage assert exists) |

## 4. Blast radius

**Downstream.**
- *Warp displaces item pixels.* Amplitude read path: LIFE drift writes
  `lp.displacement` (`liveResolve:58`) → same field feeds BOTH the baked fBm
  (`placement.js:137-138` via `buildPlacements.js:121`) and the live delta
  (`liveResolve:306`), and `lp.noiseSpeed` feeds drift's rate (`:61`), the baked nt
  (`placement.js:109`) and the phase integral (`:303`). A future LIFE fBm-time-drift swap
  therefore changes warp *feel* automatically — it writes the same three fields. Any
  LIFE edit is a FIELDS feel edit; geoSig churn travels with it.
- *Placement geometry feeds TRANSITIONS + renderer.* Warped `e.items` are what
  `planMorph` pairs against (`liveResolve:403`), what FIELD/FEED/MOD patches read
  (`:353-381`), and what `buildSceneContract` packs (`liveLoop:537`) into
  `packInstanceData` (`renderer.mjs:254`) where array order IS draw order (no re-sort —
  the #444 mechanism).
- *FLOW changes how trails die.* Feed pass advects before fade
  (`accum.mjs:1124-1134`): decay direction braids; at flow=1 not divergence-free, trails
  dissipate (`ACCUM.md:214-220`).

**Upstream.**
- CLOCK: `loopTimeMs` (clamped dt 8–50 ms, `liveLoop:758-760`) is the sole warp/drift/wind
  clock; rejected frames roll it back (`:785/:794`) — phase arithmetic must stay tolerant
  (the `max(0, dSec)` guard `:302` is what makes rollback safe today).
- LIFE: drift mutates amplitude + rate + jitter AND invalidates geoSig (#431 seam) — see
  failure table; locks (`:241-244`) are the only brake.
- DYNAMICS: swarm forces sample worldNoise (`particles:766-791`) at *their* positions and
  their own `nt = time*noiseSpeed*0.001` (`:704`) — a different nt convention from warp's
  accumulated phase; both must stay fed by CLOCK, or wind and warp drift apart in rate.
- Project/seed: reseed vs focusSwap adoption (`liveResolve:198-208`), domain offset
  `seedOffsets.noise*100` (`:307-308,:275`).

**Peers.** CLOCK→nt rates (above). LIFE→params+geoSig (above). DYNAMICS→curl/scent
sample item positions FIELDS produced; scent state is owned by `ParticleSystem`, not the
resolver. TRACKS→patches run *post-warp* (`:353+`), MOD's displace knob adds px on top of
warp budget (`:376`). TRANSITIONS→morph runs post-warp, plan-once pairing assumes warp
runs every frame at the same stage (`:389-418`); completion frame `:410-413` is #444's
site. TRAILS→FLOW advects the buffer, curl wind shapes what lands in it. ACCUM/renderer
consume final coords with zero validation.

**One-writer flag:** any edit to `liveResolve.mjs` (worldNoise, warp, prune),
`particles.js` (curl, scent), or `liveLoop.mjs` (clock, FLOW) requires single-owner
staging — no concurrent coding agents, per AGENTS.md.

## 5. Guardrails

| # | Invariant | (a) selfcheck | (b) runtime hook (existing infra only) | (c) runbook entry | Cost |
|---|---|---|---|---|---|
| G1 | I1 determinism golden: pin exact literals for `createNoise(S).fBm3D(x,y,z,3)` and `curl2` at fixed coords (today's checks only compare instance-vs-instance — no pinned value) | extend `kernel/noise.selfcheck.mjs` with golden constants | none needed (CI is the gate) | "noise golden moved ⇒ kernel changed, not feel work — do not re-baseline for feel" | cheap |
| G2 | I2 phase continuity: probe warp delta at one fixed (x,y) across hide→show (prune), focusSwap, pause/resume, and a simulated slowRender on/off window; assert Δphase = ∫speed·dt only — no reset, no catch-up | extend `gl/liveResolve.selfcheck.mjs` (reuse `baseInput`/`#425` harness — layer toggle + phase probe) | `gl/governorEventLog.mjs` `recordGovernorEvent('warp-phase-jump', cause)` when per-frame probe delta exceeds the dt-clamped budget — ring buffer + TapeCounter pill already display it | "phase jump reported → check prune/reseed/slowRender edge, not the noise kernel" | cheap (selfcheck) / med (hook) |
| G3 | I3 live/still parity: slowRender frame ≡ t0 seed slice ≡ direct `buildPlacements` output (warp pass provably not executed); plus resolve twice at same loopTimeMs → byte-identical | `spineF.selfcheck:189` already covers t0; add the buildPlacements-equality + repeat-run leg | `gl/parity/diff.selfcheck` policy already gates still pipelines — reuse for any new still path | "stills differ from seed slice ⇒ warp leaked past the `:287` gate" | cheap |
| G4 | I6 order/count preservation (the #444 class): warp pass length and per-index `it.index` unchanged; morph completion frame output ≡ raw resolver output in BOTH values and order | extend `gl/liveResolve.selfcheck.mjs`: (i) assert `len/​index` across warp, (ii) generalize `#419`'s `done==raw` (:358-378) to ordered equality | debug overlay (`gl/debug/selfcheck.page.mjs` harness pattern): per-frame order-signature; `governorEventLog` on an order flip outside a morph window | "order flip without morph ⇒ a FIELDS stage reordered or filtered — check stage order before blaming itemMorph" | cheap |
| G5 | geoSig miss-rate bounded: with drift on, cache-miss count/sec per layer stays under a documented cadence; drift and warp must not invalidate on the same frame for all layers (the #431 lockstep regression) | add a miss-count assertion to `buildPlacements.selfcheck` / `stagedEval.selfcheck` driving `applyLifeDrift` inputs | count misses in the existing `cacheFor` object; report via `governorEventLog` when threshold exceeded | "rebuild spike → drift rounding × geoSig, throttle drift not the cache" | med |
| G6 | I5 curl single-instance: two same-seed tracks (domain offset 0) produce identical `curl2` outputs through the injected instance; particle fallback instance ≡ `noiseSeedFor` | strengthen `spineF.selfcheck:73-105` to compare actual sampled wind, not just non-zero vx | none (pure function of injected noise) | "tracks disagree → someone minted a second instance — check `layoutParams.noise` injection" | cheap |
| G7 | I4 warp amplitude clamp: output delta ≤ 2·displacement at every probe; NaN positions impossible (guard before map) | add clamp + finite assertions to `spineF`/`liveResolve` selfchecks | `gl/debug/flagPass.mjs` `nan` view for visual confirmation; `state/renderFault`/`gl/renderFault` do NOT catch NaN (no throw) — document that limit | "items vanish → flagPass nan view first" | cheap |
| G8 | FLOW contract documented: seedless GPU vnoise, not curl2 — docs match code | none (doc claim) | none | fix KINETICS:83 / ACCUM wording on next docs pass (embargo-safe: docs only) | cheap |

**#444 verdict for FIELDS:** FIELDS does not *cause* #444 today — its warp is an
order-preserving `items.map` (`liveResolve:311-326`) that runs before the morph every
frame, so the completion frame (`:410-413`) receives consistently warped targets. But
**nothing asserts that**. A future filter/NaN-guard/reorder inside the warp, or an
extraction that moves the warp after the morph, reproduces exactly the #444 symptom
(one-frame draw-order flip or darting morph pairs) with zero test coverage. G4 is FIELDS'
answer: order/count preservation + ordered completion-frame identity, cheap, in the
existing liveResolve harness.

## 6. Extraction plan (target: `docs/KINETICS.md` §Conventions 3 — thin liveResolve)

Ordered, hash/parity-safe; golden hashes, SNAP, and still byte-stability must be
IDENTICAL after every step (stills path is untouched by construction — never inject
worldNoise into `placement.js`, that moves `EXPECTED_HASH_DISPLACEMENT`).

1. **Extract worldNoise ownership** → `engine/kernel/field/worldNoise.js`
   (name already reserved by `NOISE_AND_LAYERS.md:93`): a pure
   `createWorldWeather(projectSeed, {focusSwap, prev})` returning the instance/seed pair.
   liveResolve keeps its call site but holds no logic. **ONE-WRITER (liveResolve).**
   Gate: `liveResolve.selfcheck` #425 + `spineF` byte-identical.
2. **Extract the warp offset pass** → `engine/kernel/field/warpOffset.mjs`: pure function
   `(items, worldNoise, {freq, displacement, nt0, phase, domainOffset, bandMode}) → items`,
   with G4's order/count contract asserted inside it. **ONE-WRITER (liveResolve).**
   Gate: spineF warp tests + golden hashes unchanged.
3. **Land G2 phase-continuity probe** as a selfcheck against steps 1-2 (prune semantics
   decided by Matt Q1 first — the extraction must not bake in the reset-then-fix).
4. **Move warpPhase state next to worldNoise** (both are FIELDS state in resolve's maps):
   one state object, prune logic in the FIELDS module; liveResolve's `prune()` calls one
   FIELDS function. **ONE-WRITER.**
5. **Align pipeline order explicitly** in resolve: `read CLOCK → LIFE.ambient
   (applyLifeDrift) → FIELDS.worldNoise+warp → TRACKS.knobs (patches) → TRANSITIONS.morph
   → items` — as comment-staged sections first (no behavior change), so the stage order
   G4 protects is written down. Actual code-split of TRACKS/TRANSITIONS is their letters,
   not FIELDS'.
6. **Explicit non-goals:** placement keeps its own `hashU32(CH.noise)` instance (goldens);
   FLOW/scent stay put (embargo, and scent is particle-owned); no noise.js kernel changes
   (KILLED per `NOISE_AND_LAYERS.md:155`).

## 7. Open questions for Matt

1. **Hide→show phase (prune).** Choice: (a) keep `warpPhase` for layers that still exist
   but are hidden (map is ≤4 entries — cost ~0), (b) current reset-to-0 (visible snap on
   re-show), (c) accept the snap as "re-entering re-settles." Recommend **(a)** — it makes
   I2 true for free and kills a one-frame jump nobody intends.
2. **slowRender edge behavior.** Choice: (a) hold — freeze the phase and keep presenting
   the last warp delta during a governor soft-freeze (both edges become no-ops),
   (b) current — drop to seed slice on entry, catch-up jump on exit. Recommend **(a)**,
   pending one runtime check that `loopTimeMs` really advances during cut6-style freezes
   (it rolls back only on `!frame`/`paused`, `liveLoop:785/794`).
3. **Reseed jolt on shuffle.** Choice: (a) keep full re-roll (new world for a new seed —
   current), (b) adopt-and-offset like focusSwap. Recommend **(a)** (shuffle *should*
   feel new) but add the G2 log event so a re-roll and a bug look different in the log.
4. **FLOW's identity.** Code is a seedless GPU vnoise field, docs call it curl. Choice:
   (a) docs-only correction now (embargo-safe), (b) later seed it from worldNoise so
   trails share weather (a feature — parked). Recommend **(a)** now, **(b)** as a
   post-embargo nicety only if trail weather matching ever matters in a play.
5. **Scent across shuffle.** Choice: (a) keep persisting (comment at `particles.js:688`
   says persists by design — "where the cast has been"), (b) `clear()` on genuine reseed
   so mold doesn't chase yesterday's map. Recommend deciding by feel on the live canvas
   with a bio-drive voice — it's a one-line change either way, but it's a *feel* call,
   so it's yours, not a default.
