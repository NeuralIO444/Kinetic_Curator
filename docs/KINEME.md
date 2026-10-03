> **2026-10-03:** stale below the review. #782 (frame-strip revert) and #784 (Build A: spin, rock, pulse, blink, bob) are merged. Instance floats 18 and 19 are spent. Do not rebuild Build A. §6 stepped-cell question is still open.

# Handoff: KINEME — the decoupled animation system

**Status:** DRAFT for Matt's review. No build authorized yet — decisions pending (see Review §6).

## Review — 2026-09-30 (post-draft corrections)

Since the draft below was written, part of it already happened: **revert PR #782** is open,
**motion spec issue #781** is filed, and **#594** carries comments marking part 4 superseded by #781.
Verdict: **approve the direction** — library, assets stay plain, author in the asset tools, perform in
DAVIS, one source-of-truth issue. **Fix four things before any build.**

### Blocking corrections (verified in code 2026-09-30)

1. **A must not live in the render worker.** The worker is opt-in: `CanvasPanel.jsx:80–83` needs
   `?worker=1`, the `kc:worker` flag, or `renderWorker` layout param — default is the in-thread loop.
   That is exactly why #699 never moved on the default path. Per-instance motion (breath, drift,
   scale) is computed in **`gl/liveResolve.mjs`**, which both `liveLoop.mjs` and `renderWorker.js`
   share. Stills/exports use a separate **`studio/render.mjs` `resolveLayers`** (its own breath,
   L221). So A needs one of: **(a)** a pure `kineme.mjs` evaluator called from `liveResolve.mjs`
   *and* `studio/render.mjs`, or **(b)** GPU evaluation in `QUAD_VS` (the #781 approach).
   `renderer.mjs` is shared by all three paths, and there are 2 spare instance floats
   (`packInstanceData`: `buf[o+18]`, `buf[o+19]` are always 0 — verified). Recommend **(b)**:
   one place, and stills get motion from `time`. Either way, the acceptance gate must be
   **pixel motion measured on the default in-thread loop**.
2. **The "0 changed pixels" evidence is misattributed.** Headless screenshots of a worker-owned
   (OffscreenCanvas) canvas never change, so that reading measured nothing. The real finding is
   structural: the default loop has no frame-strip code at all. Do not re-derive from the pixel claim.
3. **A covers fewer #705 items than claimed.** Instance motion moves the *whole mark*. A chevron
   chase or spec-bar chase happens *inside* one asset (several chevrons in one SVG), so it is a
   C (cells) job — unless phases are spatially ordered across separate marks, which a seed hash
   is not. A honestly covers: dot pulse, whole-mark spin, rock, blink.
4. **C belongs in shared packing, not the worker.** The UV-window rewrite should happen where UVs
   are packed: `renderer.mjs` `packInstanceData` (`cells[...] || cells[it.asset]`), driven by a
   contract field (instance → rig + cell index). The asset id stays stable, so the #776 Hold rule
   holds, as the handoff says.

### Already done / stale (verified 2026-09-30)

- **Revert PR #782** ("revert: asset sub-animation frame strips (#699)") is **open with no
  conflicts** — the draft's predicted manual resolution in `globalSlice.js` + `selfcheck.manifest`
  did not happen. One thing the revert had to handle: `allEraGolden.selfcheck` renders the whole
  catalog, so its hash was re-pinned (removing the 3 demo assets changes picks). Open question 3
  becomes: merge #782 whenever Matt likes; the default path loses nothing visible.
- **#781 exists**: "KINEME — motion library, assets as source (instance motion + cell kinemes)".
  **#594** has two comments: part 4/5 (frame strips) superseded by #781, then refined — part 4 is
  **re-scoped as KINEME Build C (#781)**, part 5 (parallax drift) unchanged.
- **Discrepancy:** the review this section is based on claimed "#705 is closed as superseded" —
  verified on GitHub 2026-09-30: **#705 is still OPEN**. Its rewrite is still pending (see actions).

### Smaller notes

- **Taxonomy:** "motion reads as SYSTEM" collides with TAXONOMY.md, where System = placement mode
  (`layoutParams.mode`), and MOTION chips are already their own axis. KINEME as a new face noun is
  a MINOR bump plus a TAXONOMY entry. Pick its row: its own noun, or under the Motion axis.
- **"Perform in DAVIS"** depends on #717 (DAVIS tiles), which waits on #780. Sequence the KINEME UI
  after them.
- **Governor:** agree — one registry entry, shed = freeze motion / pin to cell 0. On GPU (b), freeze
  comes free from loop time.
- **Stepped vs smooth:** with (b), smooth whole-mark motion is free. Cells only where parts demand,
  and stepping there is fine and on-brand (TE).
- **#725:** don't un-park for this. Stopgap = author a needle-only static part asset and compose it
  as a C part.

### Reconciled actions (GitHub only, no code — PENDING Matt's approval, not done)

1. Make **#781** the KINEME source of truth: retitle to "KINEME — motion library (assets as
   source)" and fold in the handoff's library model (named rigs, referenced by id; author in asset
   tools, perform in DAVIS), with corrections 1–4 above.
2. **Rewrite #705** to reference #781 (items split A vs C per correction 3). **Rewrite #594
   part 4** to reference #781 as its C.
3. Post this review as a comment on #781 so the correction trail is kept.
4. No build until the remaining questions are answered (stepped cells OK; #725 stays parked).

### Verification (for the eventual builds — record in #781)

- A: selfcheck (no motion → byte-identical GPU render; each kind measured on a real mark; phase
  differs across copies), plus a **live pixel diff on the default loop** at RATE 0/1/4.
- C: selfcheck asserts the asset id is stable across the strip and the UV rect advances; cost
  declared per rig; governor pins cell 0.
- Revert #782: CI green; default-path render identical except the re-pinned all-era golden.

---

## Original draft (2026-09-30, pre-review — superseded in parts by the review above)

## Context

PR #699 (commit `31f453d`, merged 2026-09-27) baked animation **into the asset system**:
frame strips (`<id>__f0…__fN` atlas cells), a `sub: { frames, period, rig }` field on assets,
an Asset Studio ANIM editor. Headless verification showed the demo assets frozen (0 changed
pixels); the frame strips never animated on the default path. Matt wants a replacement
**decoupled from the asset system**. Full research: `docs/kc-animation-research.md`
(read it first — options analysis, code evidence, and the revert scope are all there).

**The name is KINEME** (Matt's pick): like *phoneme* is the smallest unit of speech, a kineme
is the smallest unit of motion. A library of kinemes.

## Matt's decisions (locked)

- **Architecture:** first-class **KINEME library** — rigs are named, reusable objects; voices,
  recipes, and placements reference them by id. Most modular; later hooks (MIDI learn, import/export,
  preset packs) pipe into the registry. Motion reads as SYSTEM in the #735 taxonomy.
- **Panel placement:** author the rig wherever assets are authored; **perform it in DAVIS**
  (next to EVOLVE / MIDI learn). Animation is performed, not built.
- **Issue topology:** one KINEME source-of-truth issue; #705 and #594-part-4 get rewritten to
  reference it (not closed — the underlying wants are real).

## The plan (sequenced)

1. **File the KINEME issue** with the spec below. Everything else references it.
2. **Build A — instance motion vocabulary (S).** `spin / osc / pulse / blink` (+`march`) as
   per-instance motion params evaluated in the render worker's **existing per-tick loop**
   (where flap/breath live — verified CPU-side, not in the vertex shader). One RATE, per-instance
   phase via a seed hash (salvage the `phaseFor` idea from #699's `subAnim.mjs`, not the storage).
   Zero atlas cost, zero asset-system touch. Covers chevrons chase, dot pulse, spec bars chase.
3. **Build C — motion-layer cell strips (M–L).** Rigs live in the KINEME library:
   `{ cells: 4–8, period, parts: [{ asset: <plain static id>, transforms per cell }] }`.
   The motion layer hands the baker N static SVG strings; the asset system only ever sees static
   bake requests. Per tick, the worker **rewrites the instance's UV rect**
   (`QUAD_VS`: `a_inst1.zw`/`a_inst2.xy` already exist per instance) to the current cell window.
   **The asset id never changes** — the #776 Hold rule holds by construction, no bake-storm guard,
   no base-id key hack. Covers dial needle sweep and waveform scroll. Re-scopes #594 part 4
   (was: generalize the wing-ladder `u` selector on #699's id-swap — dead spec).
4. **Revert #699** — scoped in the research §4: exactly the 14 files of `31f453d`; 12 revert
   cleanly, manual resolution only in `state/slices/globalSlice.js` + `selfcheck.manifest`
   (5 later commits touched those two). Takes with it: ANIM studio section, ANIM badge, 3 demo
   assets, `validSubRig` ingest path, the `getAssetCost` frames multiplier. Keep the studio ANIM
   *UI pattern* (filmstrip, per-part editor) as the design reference for the KINEME rig editor —
   the UX was fine, the storage location was the problem.
5. **Rewrite #705** (micro-HUD rigs) and **#594 part 4** to reference the KINEME issue.
   Draft re-scopes are in the research §7.

**Explicitly not a separate system:** direction B (layered marks) dissolves into C — it is just
how C's cells get composed (parts = plain static assets from the library).

## Key technical facts (verified in code, don't re-derive)

- Renderer: instanced billboard quads sampling a baked atlas; silhouette is texture alpha.
- Per-instance UV rect exists today (`v_uv = mix(a_inst1.zw, a_inst2.xy, a_corner)`) — the cell
  advance mechanism. No new shader attributes needed for C.
- Per-instance motion (flap/breath/rotation/scale) is computed **CPU-side per tick** in the worker
  and packed into rotation/scale/opacity attributes — A extends this loop (S), no shader work.
- Governor: declare **one** cost-tier registry entry for the KINEME system (not per-asset
  multipliers). Shed = freeze instance motion / pin strips to cell 0 (honest static degradation).
- Atlas cost of C: 4–8 cells × 400×400px per rig (~2.5–7MB with mips); declared per rig at
  registration; static assets pay nothing.
- Nothing on main depends on #699 except open issue #705 (verified by grep 2026-09-30).
- The dial-needle break-up problem: `mic_dial` is one blob (face + needle, single SVG).
  Break-up options: #725 region mattes (if un-parked) or a needle-only static part asset as stopgap.

## Done criteria

- A: each vocabulary motion animates on canvas with per-instance phase offsets; static path
  unchanged (no perf regression); selfcheck green; review-lane PR; Matt merges.
- C: 4–8-cell strips advance via UV-window rewrite (assert asset id stable across the strip in a
  selfcheck); dial needle sweep + waveform scroll animate; atlas cost declared per rig; governor
  shed pins to cell 0; #594 part 4 acceptance (flutter cycles play script) met.
- Revert: #699's 14 files gone, CI green, default path pixel-identical before/after.

## Standing rules (non-negotiable)

- Build from fresh `main` in a separate worktree; clean PR per issue (A, C, revert are three PRs).
- `gh pr checks` verified by your own hand before review; inspect failures, don't trust badges.
- Review lane: detached worktree, `npm install`, Vite on 5173, footer hash matches PR head,
  screenshot, plain-language "Review this:" checklist, localhost URL. Matt merges — never you.
- Scope is polish/refine; this handoff is the authorized exception. Don't accrete features.

## 6. Open questions (needs Matt before build)

1. **Stepped vs smooth** — 4–8 cells on a needle sweep = visibly stepped (45–90°/step, GIF-like).
   Desired aesthetic, or is 4–8 a cost cap (A gives smooth for free; cells only where parts demand)?
2. **Un-park #725?** — region mattes are the only designed break-up for flat blobs. Or stopgap:
   author tiny part assets (needle-only static) and compose.
3. **Revert #699 now or when C lands?** — now = clean asset system while A+C build; later =
   no motion-less gap (A already covers 3/5 of #705, so the gap is small either way).
