# QA Swarm Synthesis — Kinetic_Curator @ c86eb33 (PR #260 + #261)

5 evidence-only workers, fresh read-only clones. No fixes, no PRs.
Worker 1: real headless-Chromium screenshot proving the live WebGL loop renders.
Worker 2: drove the real governor modules in Node across 13 adversarial fps traces on a virtual clock.
Workers 3–5: static tracing, Node fuzzing (55+ hostile project cases, OOM probes), iOS-doc + emulation review.

## Critical

**C1 — HUE ROTATE slider freezes the live canvas (user-triggered, silent).**
Dragging HUE ROTATE off 0 → `gl/renderer.mjs:459-461` throws `'[gl] layer hueRotate is not implemented in Phase 1'` every frame; the tick try/catch swallows it, canvas holds last frame, and `captureFrame()` also throws — stills, batch, and print all break too. Only console (throttled) shows anything.
Repro: LAYOUT panel → drag HUE ROTATE.

**C2 — WebGL context loss permanently wedges the canvas black, silently.**
`bridge.mjs:339/354` drops handles on `webglcontextlost` but on restore only recompiles bridge programs — `atlasTex`/`grainTexs` (`renderer.mjs:705-718`) and persistent targets `T` (`:692-703`) are never re-uploaded; `ensureTargets` early-returns and no rebake fires. Loop keeps spinning, no pill, no badge. Only reload recovers.
Repro: `WEBGL_lose_context` lose/restore in DevTools.

## Major

**Governor (all executed against real modules):**
- **M1 — Cut 2 (quality tier) is a one-way ratchet: never auto-restores, invisible to the ShedBadge.** Recovery block (`usePerformanceGovernor.js:177-197`) restores renderScale/assetThin/clamps but nothing ever restores `quality`. Trace: 60s@25fps → quality `performance`; 10s@60fps → everything restored *except quality, stuck forever*. `shedSummary` omits quality — only the MasterBar "Q" meter silently reads PERF. Trap #2: silent, permanent degradation, contradicting the file header ("Every cut … auto-clears on recovery").
- **M2 — Watchdog manual resume is a no-op; contract inverted.** Space/RUN dispatch only `SET_RUNNING`; neither clears `slowRender`. The "hard stop" auto-clears at ≥30fps but ignores the documented manual resume. `lastWatchdogReason` is never cleared anywhere → after full recovery the ShedBadge shows `⚠ shed · watchdog` for the rest of the session.
- **M3 — `gpuSaturated` gate makes cut 1 (resolution) unreachable on genuinely GPU-bound machines.** `gpuSaturated = gpuFps < shedFps && fps >= shedFps` — when *both* rAF and GPU fps are below 28 (GPU demonstrably the bottleneck), the gate is false. Trace: 25fps + 40ms GPU frames for 60s → sheds were quality/assetThin/countClamp×4/slowRender — resolution never moved, ladder walked straight to motion-freeze. The gate only fires in the vsync-lying case, contradicting its own rationale.
- **M4 — Resolution shed triggers a full atlas rebake per step (self-defeating).** `liveLoop.mjs:42` `staticKeyFor` includes render size → every renderScale step re-runs `bakeLiveAtlas` (sequential SVG rasterization of every combo); the atlas is resolution-independent, only grain LUTs need the new size. Up to 4 full rebakes per shed cycle — the fps-saving mechanism does its heaviest main-thread work exactly when fps is worst.
- **M5 — perfTier1 has no hysteresis; flaps wipe ACCUM trails.** Restores the instant fps ≥ 16 while the main ladder uses 28/30. FPS hovering ~16 → `dropAccum()` every ~2s destroys the feedback buffer. Same single-threshold pattern PR #260 fixed on the main ladder.
- **M6 — Watchdog shed/restore `cutKind` mismatch blinds the flap detector** (`'watchdog'` shed vs hard-coded `'slowRender'` restore) — flap pairing never counts watchdog cycles.

**Capture honesty:**
- **M7 — Non-ACCUM capture resizes the *live canvas* to capture size and back.** Every 2×/4× SNAP/RENDER FINAL/PRINT DESK flashes the visible canvas; an active WebM recording sees a mid-stream resolution jump.
- **M8 — ACCUM stills are a 2D upscale of the live-res feedback buffer.** Readback at live renderScale size (as low as 330×231 when shed), then 2D-upscaled; grain LUTs baked at live size get stretched/blocky. Print desk markets this as a 2× print still with no disclosure.
- **M9 — ↓ SNAP silently swallows capture failures** (`SnapRecordRow.jsx:30` `.catch(() => {})`): if a bake starts between `waitForReady` and `captureFrame`, it throws with no retry and no feedback. Button appears to do nothing.

**Fault visibility:**
- **M10 — Any persistent per-frame exception freezes the canvas with zero UI signal.** rAF scheduled before frame work and everything caught, so the loop never dies — but deterministic failures skip `present()` forever while the app looks alive. Only throttled `console.error`. (The class C1 belongs to.)
- **M11 — Deterministic atlas-bake failure = infinite rebuild loop + unthrottled console spam.** One unrasterizable custom asset → permanent blank canvas + console flood.

**Dead controls (all traced end-to-end):**
- **M12 — Five dead controls:** SWELL (emits `ACCUM_GESTURE {action:'swell'}`, no listener — the comment describes code that doesn't exist), RECOLOR (nothing reads it repo-wide), SHADING FLAT/GLOSS (only consumer is dead SVG `Layer.jsx`), MATERIAL buttons (GL renders everything flat), SMOOTHING checkbox (only consumer is a CSS transition in dead `Layer.jsx`).
- **M13 — FREEZE desync:** freeze state in React `useState` vs loop closure `accumFrozen`. Turning ACCUM off drops the session but never resets the loop var; re-enable → trails never appear while the button shows inactive. Recovery requires pressing FREEZE twice.
- **M14 — CanvasPanel "ACCUM" pill lies under governor shed:** pill reads `layoutParams.accumulation`, loop computes `accumOn = accumulation && !perfTier1`. Under LOAD SHED the pill claims "GPU accumulation buffer is live" while it's off.

**Mobile (verified vs inferred split honored):**
- **M15 — Zero DPR handling anywhere** (verified by grep): canvas fixed 1000×700, CSS-stretched. Soft on all retina displays.
- **M16 — 4× no-ACCUM export allocates ~582 MB at once**, near the ~700 MB texture budget that jetsam-killed Safari on iPhone 12. Print desk 1×/2× (~157 MB, safe-ish). Inferred — needs a real device.
- **M17 — iOS sticky-error freeze risk, same class as #261** (inferred): iOS Safari runs ANGLE→Metal. `step()` still throws on any error during its own passes. Cannot verify without a device.

**Hostile inputs (executed in Node):**
- **M18 — `buildPlacements` has no absolute count ceiling → uncatchable OOM.** `clampCount` trusts `caps.maxCount` blindly; count=1e7 → V8 heap OOM (fatal).
- **M19 — Hostile `caGrid` in project snapshots: unbounded.** `projectNormalize.js:74` accepts any array; 1000×1000 grid survives `parseProject`, bloats every undo push (~2 MB), seconds-long main-thread stall on first CA render, blurred field retained forever in module cache. Reachable via project import.
- **M20 — Latent sticky-freeze class in the resolver:** `layers:[null]` → TypeError `liveResolve.mjs:129`; `rotate:null` → TypeError `placement.js:174`; `particleCount:-50` → `RangeError` (`new Array(-50)`). All currently gated by firewall/normalize — latent, but any future raw caller reintroduces a permanent canvas freeze via M10's catch-and-hold.

## Minor (selected)
Governor oscillation across the 28–30 band flaps (30 sheds/29 restores in 240s; flap detection is readout-only); toggling autoQuality off silently clears a watchdog hard stop; NaN fps throws in the tick (unreachable via `useFpsMeter`). Batch edition unusable while paused/tab-hidden (12s timeout). Unmount-while-recording loses the WebM silently. Misleading SVG-era labels: `+ ADD FX` tooltip "SVG filter effects", NODES meter "SVG node count", grain/scanlines tooltips referencing the retired FX shed ladder, 30FPS lock title (only gates the life-LFO, not the GL loop). No pinch-zoom, no `viewport-fit=cover`, `100vh` vs iOS toolbar untested. `applyPreset` bypasses the state firewall (latent). `staticKeyFor` rebuilds a ~¾ MB string per frame (GC pressure). Dead SVG-era modules (`panels/canvas/Layer.jsx`, `FxFilterDefs.jsx`, `MaterialSheet.jsx`, `useSwarmTick`, `useCanvasItems`) still in tree.

## Verified solid (do NOT touch)
GOV TUNE overrides cannot recreate the trap (setters enforce shed<recover adversarially); event log bounded at 128; "play is what renders" holds for in-app captures (shared `buildFrame()`); undo bound holds (50/50, 8 MiB); 55-case project fuzz — hostile SVG dropped, `__proto__` rejected, 200 layers→16, 500 assets→32; rapid preset switching 25×3 cycles, 0 failures, no bake storms; governor thresholds display-agnostic; live-path GPU only ~88 MB; post-#261 ACCUM branch has no remaining sticky-error freeze.

---

## Targeted refactor proposal (for Matt's approval — nothing built)

Five structural causes, each a contained change, not a rewrite. Ordered by user-visible harm:

**Phase 1 — Honest rendering (the bug class that shipped twice).**
1. **Declarative governor cuts** — each cut becomes `{shed, restore, badge}`; restore iterates cuts in reverse instead of the hand-maintained block that forgot quality. Fixes M1 structurally; also fix the inverted watchdog contract (manual resume must clear `slowRender`; auto-clear only the soft freeze) and clear `lastWatchdogReason` on recovery (M2); fix shed/restore `cutKind` pairing (M6); correct the `gpuSaturated` predicate so cut 1 fires when GPU-implied fps is the binding constraint (M3). Add hysteresis to perfTier1 (M5).
2. **RENDER FAULT state** — first deterministic per-frame fault → store flag + "RENDER FAULT" pill, canvas keeps last good frame; sticky until cleared by recovery or reload. Applies the honest-readout creed to the loop itself (M10, M11, whole sticky-freeze class M20).
3. **Context-loss restore that actually restores** (C2): re-upload atlas/grain textures and realloc targets on `handleContextRestored`, or tear down and cold-restart the renderer.
4. **HUE ROTATE: implement in GLSL or remove the slider** (C1) — needs Matt's product call.

**Phase 2 — Honest capture.**
5. Capture renders to offscreen targets at capture size; never resizes the live canvas (M7).
6. ACCUM stills: re-render the accum chain at target size or label the upscale honestly in the print desk (M8).
7. SNAP: retry-on-baking + error toast instead of swallowed catch (M9).

**Phase 3 — Dead-control sweep + hardening.**
8. Product decisions: implement-in-GL vs remove for SWELL, RECOLOR, SHADING, MATERIAL, SMOOTHING (M12); fix FREEZE reset on session end (M13); ACCUM pill reads effective `accumOn` (M14); delete dead SVG modules; fix misleading tooltips/labels.
9. Absolute count ceiling in `buildPlacements`; `caGrid` size cap in `projectNormalize`; null guards in `liveResolve`/`placement` (M18–M20).
10. Rebake only grain LUTs on renderScale change, not the full atlas (M4).

**Phase 4 — Mobile (needs Matt's iPhone for verification).**
11. DPR handling for the canvas (M15, known gap); pinch gesture or honest disable; `viewport-fit=cover`; 4× export memory guard (M16); iOS ANGLE sticky-error exposure (M17) can't be fixed without a device to reproduce on.

**Explicitly out of scope:** undo, project firewall, preset switching, event-log bounds, capture-content fidelity — all verified solid; no rewrite of anything working.
