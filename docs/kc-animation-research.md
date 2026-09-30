# Animation-system research — decoupled from the asset system

Research-only. No repo files modified, no branches, no issues filed, no revert performed.
Worktree read: `~/workspace/kc-main-review` (detached at `main` 7c457f7). Date: 2026-09-30.

Context: PR #699 (commit `31f453d`, merged 2026-09-27) baked animation **into the asset system** —
frame strips (`<id>__f0…__fN` atlas cells), a `sub` rig field on assets, an Asset Studio ANIM editor.
Matt wants a replacement that is **decoupled from the asset system**. A builder proposed reverting #699
outright; no revert is authorized — this is the design research that precedes that decision.

Matt's hard requirements for the new system:
1. **4–8 cells** — a short cell strip per animation, not unbounded frame counts.
2. **A break-up system** — assets can be broken into independently-animatable parts.
3. **Uses the existing asset library** — plain static SVG assets (incl. the 20 micro-HUD ornaments from #697).
4. **Not bundled into / stored in the asset system** — rigs live elsewhere (instance layer, motion layer, …).

Use cases it must serve (open issue #705): dial needle sweep, chevrons chase, dot pulse, waveform scroll,
spec bars chase.

## 1. What #699 actually built (from `git show 31f453d`)

14 files, +610/−36. Mechanics:

- **Rig format** (`app/src/assets/subAnim.mjs:1-40`): `sub: { frames, period, rig }` stored **on the asset**.
  `rig: [{ svg, anim }]` layers with anim kinds `spin / osc / pulse / blink / march`
  (rotate 360°, sinusoidal rotate/scale, square-wave on/off, seamless x-translate).
- **Bake**: each rig is pre-sampled at N times; every frame becomes its own atlas cell
  (`<baseId>__f0 … __fN`). Atlas cells are 400×400px (`gl/atlas.mjs:27`, `CELL_PX`).
- **Per-tick** (`gl/renderWorker.js`, #699 hunk): the worker rewrites each animated instance's
  `it.asset` to the current frame id — **a string swap**. Because the placed-asset *ids* change every
  tick, the atlas key is computed from **base ids** (`baseAssetId`) as a bake-storm guard, and one bake
  expands to all frames.
- **Cost** (`app/src/assets/cost.js:17-19`): `getAssetCost` multiplies by frame count —
  an animated asset costs ~frames × static.
- **Studio** (`app/src/panels/AssetStudioModal.jsx`, +138): ANIM section — per-part motion editor
  (kind/period/amount/phase), live filmstrip, SAVE TO POOL persists the rig through
  `ASSETS_INGEST`/`ASSETS_REPLACE` → `overlay.js` (`validSubRig`, malformed rigs fail closed to static).
- **Pool** (`app/src/panels/AssetPoolPanel.jsx:148`): ANIM badge. **Demo assets**
  (`app/src/data/assets/assets-sub-demo.js`): `anim_dial_01` (12 frames — note: over Matt's 4–8 budget),
  `anim_chevrons_01`, `anim_dot_01`.
- **Phase offsets** (`subAnim.mjs:131-137`, `phaseFor`): per-instance phase via hash of
  `seedOffset:key` — #705's "phase offsets between copies" requirement is already solved here;
  any replacement must keep an equivalent.
- `workerLiveLoop.js:80` uses `expandSubFrames()` to serialize frame SVGs into the worker's svgMap.

## 2. Engine facts the new system must respect (verified in code)

- **Instanced billboard quads.** `gl/shaders.mjs:38` (`QUAD_VS`): every node is a quad;
  silhouette is texture alpha from the baked atlas. Per-instance attributes:
  `a_inst0` = position + scale, `a_inst1` = rotation + opacity + UV-rect half,
  `a_inst2` = UV-rect half + velocity-smear displacement, `a_inst3/4` = ink/accent colors.
- **Per-instance motion already exists, computed CPU-side.** Flap/breath/scale/rotation are evaluated
  per tick in the render worker (`gl/liveResolve.mjs`, e.g. #451 breath, #309 velocity smear) and packed
  into the rotation/scale attributes; the vertex shader only *applies* the transform. Correction to the
  brief: motion is not "in the vertex shader" today — the shader is a dumb transform applier.
  The honest reading of "direction A" is therefore: extend the per-instance motion params in the
  worker's existing per-tick loop (same place flap/breath live), which is *less* code than new shader
  attributes. A true GPU-side variant (new instanced attrs + `u_time`) is possible but strictly more work.
- **The per-instance UV rect already exists** (`v_uv = mix(a_inst1.zw, a_inst2.xy, a_corner)`).
  This is the key enabler for direction C: a cell strip can be advanced by **rewriting the UV window**,
  never the asset id.
- **Atlas Hold rule (#776).** The placed-asset set may change **at most once** per MIX; mid-blend
  asset-id changes force atlas rebakes. #699's per-tick `__fN` id swaps skate by on the base-id key
  guard — but the ids still churn. A system that never changes the asset id satisfies the Hold rule
  trivially, with no guard code at all.
- **Governor cost tiers** (`gl/costTiers.mjs:79`, `registerCostTier`): every effect declares its tier at
  registration; the shed ladder reads the registry. A new animation system declares one tier entry
  (not per-asset multipliers), and both candidate directions degrade gracefully under shed
  (freeze motion / pin to cell 0).
- **#594 part 4 was written for #699.** Issue #594's Capture list, item (4): *"Frame strips — generalize
  the wing-ladder `u` selector to N-frame strips with rate param (atlas cost declared; static assets pay
  nothing)."* Any replacement **re-scopes #594 part 4** — it cannot ship as written without #699.
- **#705 depends on #699's vocabulary** (sweep/chase/pulse/scroll rigs "via the sub-animation system").
- **The micro-HUD ornaments are plain statics** (`app/src/data/assets/assets-micro-hud.js`): 20 assets,
  zero `sub:` fields. And `mic_dial` is **one blob** — face ticks and the accent needle are a single SVG.
  There is no separate needle asset. This is the entire break-up problem in one line: to move the needle
  independently you must segment the blob (#725), split it into two static assets (stopgap), or bake
  rotated-needle cells (frame strips).

## 3. Dependency check: does anything else on main depend on #699?

**No.** Verified by grep across `app/src` (2026-09-30, main `7c457f7`):

- `subAnim` / `frameId` / `baseAssetId` / `validSubRig` / `__fN` referenced only in:
  `assets/subAnim.mjs`, `assets/subAnim.selfcheck.mjs`, `assets/cost.js` (frames multiplier),
  `assets/overlay.js` (rig passthrough on ingest/replace), `data/assets/assets-sub-demo.js` (3 demos),
  `data/assets/index.js` (demo import), `gl/renderWorker.js` (per-tick swap), `gl/workerLiveLoop.js`
  (`expandSubFrames`), `panels/AssetStudioModal.jsx` (ANIM editor), `panels/AssetPoolPanel.jsx`
  (ANIM badge), `state/AppContext.jsx` (INGEST_ASSET / REPLACE_CUSTOM_ASSET `sub` passthrough),
  `state/slices/globalSlice.js`, `composition/wireEventBus.js`, `selfcheck.manifest`.
- The builder's claim holds: **the only open-issue dependent is #705**. Nothing on the default render
  path uses a rig — frame strips never animate unless the user places one of the 3 demo assets or
  authors a rig in the studio. Reverting takes away nothing anyone sees today.

## 4. What a revert PR would touch

Exactly the 14 files in `git show 31f453d --stat` (3 deleted outright:
`subAnim.mjs`, `subAnim.selfcheck.mjs`, `assets-sub-demo.js`; 11 reversed hunks).
**Not conflict-free**: 5 later commits touched 2 of the 14 files —
`globalSlice.js` (FXAA #740: `fa6fadd`, `c59be60`) and `selfcheck.manifest`
(FXAA #740, taxonomy `ab817ff`, #532 `97e7616`, #735 `8380fe8`).
So a revert needs manual resolution in **exactly those 2 files**; the other 12 revert cleanly.
(Not authorized — stated here so the revert PR, if Matt orders it, is scoped correctly.)

## 5. Candidate directions

### A. Instance motion vocabulary (continuous, no cells)

Small motion set — `spin / osc / pulse / blink` (+`march`) — as **per-instance motion params**
evaluated in the worker's existing per-tick loop (where flap/breath live), packed into the current
rotation/scale/opacity attributes. One RATE + per-instance phase (keep the `phaseFor` hash idea).
No baking, **zero atlas cost**, works on every asset, both loops, stills, governor-safe by construction.

- 4–8 cells: **does not apply mechanically** — motion is continuous. Two honest options: (a) note the
  mismatch and let A be cell-free, or (b) quantize time to 4–8 steps/period for a deliberate
  stepped/GIF read. (b) is a real aesthetic choice, not a hack — flag it as a Matt question (§7).
- Break-up: **none** — moves the whole mark. The dial spins as a whole; no needle-over-face.
- #705 score: **3/5 full** (chevrons chase = phase-offset blink ✓, dot pulse ✓, spec bars chase ✓),
  waveform scroll partial (whole-mark osc; true scroll-in-window needs clipping or cells),
  dial needle sweep ✗.
- Atlas/governor: nothing to declare beyond the existing per-instance path; shed = freeze params.
- Complexity: **S** (CPU-side). The GPU-attribute variant is M and buys little — the worker already
  iterates every instance per tick.

### B. Parts-level motion as layered marks (composition, no cells)

A "rig" = **several ordinary static assets drawn stacked on one pivot**, each part its own instance
with its own instance motion (from A). `liveResolve` gains rig expansion: one placement → N instances
sharing a pivot. Assets stay plain static SVGs; the needle effect comes from composition, not baking.

- 4–8 cells: does not apply (continuous motion per part).
- Break-up: **the rig IS the break-up** — but only for assets that exist as separate parts.
  `mic_dial`'s needle is baked into the blob: B needs a needle-only static asset (new, tiny, plain)
  or a faceless-dial variant. No auto-segmentation; the artist composes parts from the library.
- #705 score: dial needle ✓ (with a part asset), chevrons/dot/spec bars ✓ via A on single parts,
  waveform scroll ~ (still wants cells or a clip window).
- Atlas/governor: parts are normal static cells — **zero marginal atlas cost**; governor sees N
  ordinary instances. Hold rule: part set is fixed per rig — stable, no guard needed.
- Complexity: **M** — rig expansion in the placer, pivot bookkeeping, rig definitions somewhere
  (see §7 Q2). Risk: pivot/anchor semantics for stacked parts is the fiddliest bit
  (echoes #725's anchor-point warning).

### C. Motion-layer cell strips, advanced by UV window (the 4–8-cell answer)

Keep the *cell* idea, move it **out of the asset system**: a rig is a motion-layer object —
`{ cells: 4–8, period, parts: [{ asset: <plain static id>, transforms per cell }] }` —
stored on the voice/recipe/motion library, **never on the asset**. At bake time the motion layer hands
the baker N static SVG strings (each cell = composed plain assets with per-part transforms for that
cell); the asset system only ever sees static bake requests. Per tick, the worker **rewrites the
instance's UV rect** (`a_inst1.zw/a_inst2.xy` already exist per instance) to the current cell window.
The asset id **never changes**.

- 4–8 cells: **literal** — Matt's budget is the strip length. (Note #699's dial used 12; 4–8 steps on a
  needle sweep = 45–90°/step, visibly stepped — same aesthetic question as A(b).)
- Break-up: cells are **composed of plain assets** (B's composition idea, frozen per cell) —
  parts are separate static assets from the library; and/or #725 region mattes when un-parked.
  No rig layers in code, no `sub` field.
- #705 score: **5/5** — dial needle ✓ (cells of face+rotated needle), chevrons ✓, dot ✓,
  waveform scroll ✓ (translate-in-window bakes cleanly), spec bars ✓.
- Atlas: 4–8 cells × 400×400px per rig (~0.64MB/cell RGBA8 + ~33% mips → ~2.5–7MB per rig).
  Declared once per rig via the cost-tier registry (replacing `getAssetCost`'s per-asset multiplier);
  static assets pay nothing. **Hold rule: trivially satisfied** — ids never churn, no bake-storm guard,
  no base-id key hack. Governor shed = pin to cell 0 (a static, honest degradation).
- Complexity: **M–L** — the atlas baker needs strip allocation (N adjacent cells + strip metadata
  recording the origin; current packing is a simple grid with gutter, `atlas.mjs:96`), the bake path
  must accept motion-layer cell SVGs, and the worker writes UV rects per tick. All contained in
  `gl/` + the motion layer; `assets/` untouched.

### Comparison

| | A: instance motion | B: layered marks | C: motion-layer strips (UV advance) |
|---|---|---|---|
| 4–8 cells | n/a (or stepped-time option) | n/a | literal — strip length |
| Break-up | none (whole mark) | rig = composed parts (needs part assets) | cells composed of plain-asset parts; and/or #725 |
| Uses asset library | yes, untouched | yes, untouched | yes, untouched |
| Lives outside asset system | yes (instance layer) | yes (motion layer) | yes (motion layer) |
| #705 dial needle | ✗ | ✓ (needs needle asset) | ✓ |
| #705 chevrons/dot/specbars | ✓✓✓ | ✓✓✓ | ✓✓✓ |
| #705 waveform scroll | partial | partial | ✓ |
| Atlas cost | zero | zero (N plain cells) | 4–8 cells/rig, declared per rig |
| Hold rule (#776) | unaffected | unaffected (fixed part set) | trivially satisfied (ids never change) |
| Governor shed | freeze params | freeze params | pin to cell 0 |
| Complexity | **S** | **M** | **M–L** |

## 6. Open-issue mapping

- **#705** (sub-animation rigs for micro-HUD): **re-scope, don't close-yet** — its 5 use cases are the
  acceptance suite for the new system. Draft re-scope in §7.
- **#594 part 4** (frame strips): **re-spec required** — written for #699's id-swap strips.
  Under C it becomes "motion-layer strips, UV-window advance, 4–8 cells, atlas cost declared per rig."
  Under A it dissolves (no strips). Parts 1–3, 5 unaffected.
- **#725** (region mattes): **the designed break-up system** — cryptomatte-style stable region IDs,
  click-to-pick, per-region color cycling (cheap) then distortion (hard). Currently parked
  ("needs your call"). It is the only answer on the table for animating *inside* a flat blob
  (the `mic_dial` needle) without baking cells or authoring part assets. Un-parking it is a Matt
  decision (§7 Q3).
- **#699 follow-ons**: the ANIM studio section, ANIM badge, 3 demo assets, `validSubRig` ingest path,
  and the `getAssetCost` frames multiplier all go with a revert. The `phaseFor` phase-hash idea
  should be **salvaged** into the new system (it solves #705's phase-offset requirement).
- #740 (FXAA), #532 (ACES/dither): untouched by any of A/B/C. #776 (Hold rule): C is the only
  direction that interacts with it, and only to make compliance trivial.

## 7. Recommendation (sequenced)

**Build A first, then C; treat B as C's composition mechanism, not a separate system.**

1. **A — instance motion vocabulary (S).** `spin/osc/pulse/blink` per-instance params in the worker's
   per-tick loop (where flap/breath live), one RATE, per-instance phase (salvage `phaseFor`'s hash).
   Zero atlas cost, zero asset-system touch. Immediately covers chevrons chase, dot pulse, spec bars
   chase — 3 of #705's 5 — and whole-mark spin/osc for everything else.
2. **C — motion-layer cell strips (M–L).** Rigs live in the motion layer (placement/voice/recipe —
   Matt picks where, Q2); 4–8 cells each composed of plain static assets; per-tick advance by
   **UV-window rewrite** (not asset-id swap — this is the structural improvement over #699: the Hold
   rule is satisfied by construction, no bake-storm guard, no base-id key hack). Covers dial needle
   sweep and waveform scroll — the remaining 2 of #705. Re-scopes #594 part 4.
3. **B dissolves into C**: "layered marks" is just how C's cells get composed (parts = plain assets).
   No separate system needed.
4. **Revert #699 when C lands** (or now, if Matt wants the asset system clean first — revert PR is
   scoped in §4: 14 files, manual resolution only in `globalSlice.js` + `selfcheck.manifest`).
   Keep the studio ANIM *UI pattern* (filmstrip, per-part editor) as the design reference for the
   motion-layer rig editor — the UX was fine, the storage location was the problem.

### Draft re-scope — #705 (sub-animation rigs for the micro-HUD pack)

> Re-scoped off #699 (asset-bundled frame strips) onto the decoupled animation system
> (research: `kc-animation-research.md`).
> - chevrons chase, dot pulse, spec bars chase → **instance motion vocabulary** (phase-offset
>   blink, pulse; per-instance phase via seed hash; one RATE).
> - dial needle sweep, waveform scroll → **motion-layer cell strips** (4–8 cells, rigs defined in
>   the motion layer referencing plain static assets, per-tick UV-window advance; asset ids never
>   change, Hold rule unaffected).
> - dial needle needs break-up: `#725` region mattes (if un-parked) or a needle-only static part
>   asset as stopgap.
> Acceptance: each of the 5 ornaments animates on canvas with phase offsets between copies; static
> ornaments keep the unchanged path; atlas cost declared per rig (not per asset); governor shed pins
> strips to cell 0 and freezes instance motion; selfchecks green; review-lane PR; Matt merges.

### Draft re-spec — #594 part 4 (frame strips)

> Re-spec (was: generalize the wing-ladder `u` selector to N-frame strips on #699's id-swap).
> Motion-layer cell strips, 4–8 cells, UV-window advance in the existing per-instance UV rect
> (`QUAD_VS` `a_inst1.zw/a_inst2.xy`); asset ids stable across the strip so the #776 Hold rule holds
> with no guard code; atlas cost declared per rig at registration; static assets pay nothing.
> One fix per PR per the epic's Guide; play script: flutter cycles.

## 8. Open questions Matt must decide

1. **Stepped vs smooth.** 4–8 cells on a needle sweep = visibly stepped motion (45–90°/step). Is the
   step a desired aesthetic (GIF-like), or is 4–8 a cost cap — in which case direction A gives smooth
   motion for free and cells only where parts demand them?
2. **Where do rigs live?** Per-voice recipe field, a first-class MOTION library (fits the #735
   LOOK/VOICE/SYSTEM/CAST taxonomy — motion is arguably SYSTEM), or per-placement in the composition.
3. **Un-park #725?** Region mattes are the only designed break-up for flat blobs (`mic_dial`'s
   needle). Alternative stopgap: author/split tiny part assets (needle-only static) and compose.
4. **Revert #699 now or when C lands?** Revert PR scoped in §4 (14 files; manual resolution only in
   `globalSlice.js` + `selfcheck.manifest`). Keeping it until C lands avoids a motion-less gap;
   reverting now keeps the asset system clean while A+C build.
5. **#705 / #594-part-4:** adopt the re-scopes above, or close-as-superseded and file fresh issues?
