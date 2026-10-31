# STAGING REPORT — #1830 exposure: a cinematic photoreal light model at the resolve

**Verdict: BUILT.** The previous staging pass verified every premise,
designed the build, and stopped at the one-writer boundary in
`app/src/gl/liveLoop.mjs`, exactly as ordered. The coordinator routed the
decision: **exactly one field** in that file was authorized. This pass
executed the plan as written. Base `origin/main` 888efe24; branch
`feat/1830-exposure`. Not pushed, no PR — the coordinator publishes.

---

## 1. Premise verification + the boundary (record of the previous pass, kept)

Every premise in the issue is TRUE against the tree (issue read in full;
it has 0 comments, so the body is the whole spec):

| # | Issue premise | Evidence |
| --- | --- | --- |
| 1 | #1800 spectral fade shipped (film-like colour aging, in the loop) | `app/src/gl/accum.mjs` — the fade pass consumes a per-channel spectral keep vec3 (`u_keep`) from per-channel half-lives. |
| 2 | #1801 shipped: a highlight shoulder in the loop, invertible, because ACES in the loop was rejected | `app/src/gl/accum.mjs` — `highlightSoftCeiling`, Reinhard shoulder, knee 1.0 / ceiling 2.5; header records: *"ACES is non-invertible and compounds — it stays at the resolve, #532"*. |
| 3 | #1803 shipped: palette halation | `app/src/gl/accum.mjs` — halation tint derived from the active palette's centroid chroma. |
| 4 | #532 keeps ACES at the resolve | `app/src/gl/resolveFs.mjs` — Narkowicz ACES in `RESOLVE_FS`; `resolveBind.mjs` live defaults ACES on, Bayer on, exposure 1.0, "No panel this PR." |
| 5 | Settled law: filmic curves at the resolve only, never in the loop | Held in the tree before this build; this build adds nothing upstream of the resolve. |
| 6 | What is missing is the _model_: an exposure stage in stops + the resolve read as one system | Confirmed missing: `u_exposure` existed as a bare linear multiplier bound to the constant 1; no stops semantics, no stop table, no performer control, no module naming the resolve as one lighting model. |

**The boundary.** The final-image resolve chain is `resolveFs.mjs` (shader)
← `resolveBind.mjs` (binder) ← `renderer.mjs` `setResolveOptions` bag ←
pushed from exactly one place: `liveLoop.mjs` (one-writer). An exposure
control built everywhere except that block would be a **dead control** —
the panel would move and the canvas would never change. The previous pass
specified the needed change to the line and stopped.

**The routing (this pass).** The coordinator authorized exactly one change
in `liveLoop.mjs`: the single `exposureStops` field in the existing
`setResolveOptions` bag. It is the only line-set changed in that file
(§2); `liveResolve.mjs` and `particles.js` are untouched (0 diff lines).

## 2. The authorized one-writer change (verbatim diff, complete)

```diff
           weave: st.weave ? gateWeaveOffset(performance.now(), frameCount) : null,
+          // #1830: resolve exposure in stops — the exposure model's
+          // countable, hand-played quantity; resolveBind turns stops
+          // into the linear gain the resolve shader applies pre-curve.
+          exposureStops: st.exposureStops ?? 0,
         });
```

+4 lines (3 comment + 1 field), nothing else in the file. It rides the
standing #740/#741 discipline: the loop re-pushes the store value every
frame, so a recreated live renderer never loses it. The bag feeds both
the live present and the readback/export path — what you see is what you
export, exposure included.

## 3. What was built (the plan, executed as written)

1. **`app/src/gl/exposureModel.mjs`** (new) — the exposure model as one
   named system:
   - `EXPOSURE_STOPS`: the detent table — half-stop detents
     `[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]`, authored frozen data in the
     Strata Q stop-table style.
   - `stopsToGain(stops) = 2^stops` (exactly 1 at 0), `gainToStops`,
     `snapExposureStops` (clamp + nearest detent; ties land low, the
     modeStops precedent; junk rests at 0), `formatExposureStops`
     (`+1.0 EV` / `0 EV` / `−1.5 EV`).
   - `acesNarkowiczMirror` + `ACES_NARKOWICZ`: a JS mirror of the shader
     curve for CPU probes, constants copied from `resolveFs.mjs` and
     pinned to its source text by the selfcheck (the #1801 GPU/JS-mirror
     pattern). `resolveCurveMirror` composes gain-then-curve per pixel.
   - The composition law is documented in the module header: #1800 (fade),
     #1801 (invertible shoulder) and #1803 (halation) shape the HDR buffer
     in the loop; the resolve is the buffer's only exit — **exposure
     (stops) → filmic curve → dither last** — and no curve ever moves
     upstream (ACES compounds; #532/#1801 law). ACES stays the curve.
2. **`app/src/gl/resolveBind.mjs`** — `bindResolveProbe` accepts
   `exposureStops`: precedence is **explicit linear `exposure` wins**
   (probes/goldens untouched), else stops → `stopsToGain(snap(stops))`,
   else the default. The `exposure = 1` default literal is intact, so the
   existing `resolve.selfcheck` pin passes unmodified. **No shader change**
   — `RESOLVE_FS` already applies `u_exposure` first, pre-ACES.
3. **`app/src/state/slices/globalSlice.js`** — `exposureStops` as a
   per-machine display pref on the exact fxaa/weave pattern: own
   localStorage key `kc:exposure:v1`, default 0, snapped on write and on
   read, persisted on change, **never project content**. Reason entry
   added to `bundle.js` `BUNDLE_LEFT_OUT` beside `kc:fxaa:v1` /
   `kc:weave:v1` (the `bundleKeys` scan requires the decision in code).
4. **Event chain** (mirroring `DISPLAY_FXAA`/`DISPLAY_WEAVE` end to end):
   `Events.DISPLAY_EXPOSURE` (`display:exposure`, `{ stops }`) →
   `eventRegistry` wire entry → `wireEventBus` → `A.SET_EXPOSURE_STOPS` →
   `applyAction` → `store.setExposureStops`.
5. **`app/src/panels/pipeline/DisplayBlock.jsx`** — an **EXPOSURE** row
   beside FXAA/weave in the Pipeline display block: an `AmberValue`
   stepper (the DS primitive for editable values — its button IS the
   readout) over the detent table, step 0.5, formatted by
   `formatExposureStops`. Help copy added (`output-exposure`).
6. **Selfchecks** — new `app/src/gl/exposureModel.selfcheck.mjs`
   (13 checks, §5), registered in `app/selfcheck.manifest` (one line).
   `app/src/state/fxaa.selfcheck.mjs` extended with the exposure pref
   (default 0, persistence, snap/clamp on write, refused storage → 0) and
   its project-document pin now also names `exposureStops`.
7. **Cost** — governor Δ = 0 by construction: exposure is a uniform on
   the existing resolve pass, whose registry entry already reads
   _"final resolve: exposure + ACES + dither, one tap; structural, never
   shed"_ (tier 0). No new pass, nothing to shed, no registration change
   needed; `costTiers.selfcheck` green.

**Recorded defaults (Matt-overruleable at review, built as planned):**
half-stop detents −2…+2 · ACES stays the curve · performer-control-first,
**Look-stamping deferred** (it composes with Davis's his-only tier
grades; bolting it on here would entangle two systems — recorded as the
follow-up question, not silently decided) · control shape = stepper with
the stop readout as its value.

## 4. Byte-identity at rest — proven, not asserted

At stops 0 the gain is exactly 1, so the resting frame must be the frame
the instrument has always resolved. Proven at three levels:

- **Unit (uniform stream):** `exposureModel.selfcheck` deep-equals the
  full uniform stream of `bindResolveProbe({ exposureStops: 0 })`
  against both `bindResolveProbe({})` and `bindResolveProbe({ exposure: 1 })`
  — identical, `u_exposure === 1`.
- **End to end (real shader, both trees):** a synthetic HDR buffer
  (deep-shadow gradient, flat graphic blocks, an 8-step wedge 0.01→4.0,
  an HDR highlight core at 6.0 with a palette-tinted halation bleed, a
  specular streak at 12) was resolved through the production `RESOLVE_FS`
  + `bindResolveProbe` at production defaults (ACES on, Bayer on), on
  this tree via `exposureStops: 0` and on a pristine `origin/main`
  checkout via its linear `exposure: 1`. **Raw RGBA: 0 differing bytes,
  0 differing pixels of 368,640 (desktop 768×480) and 0 of 230,400
  (phone 360×640); the PNGs are byte-identical too.** Re-proven on fresh
  renders after a sandbox restart wiped the first run's working files —
  the render is deterministic (saved shot == fresh render).
- **System (goldens):** the full manifest sweep (§5) — every golden,
  parity and replay suite in the tree passes unmodified. No golden was
  re-recorded, no check re-pinned, for this build.

## 5. Verification (final tree)

- **New/changed suites:** `exposureModel.selfcheck` 13/13 ·
  `resolve.selfcheck` green (the `exposure = 1` pin passes unmodified) ·
  `fxaa.selfcheck` green (incl. the new exposure section) ·
  `bundleKeys.selfcheck` 5/5.
- **Touched-file sweep:** every suite naming a touched file was grepped
  and run — `resolveTap`, `presentOrientation`, `wetLook` (16),
  `grainFinish`, `liveLoopSwell`, `costTiers`, `eventRegistry`
  (164 events), `eventBus`, `busChain` (142 wired events), `helpCopy`,
  `labelCase`, `census`, `chiaroscuro` (10), `overlayRoundtrip` — all
  green. No e2e spec references the display block's selectors (nothing
  was converted; a row was added with existing DS primitives) — the
  e2e grep for `FXAA|gate weave|DisplayBlock` returns no hits.
- **Full manifest sweep: 543 of 545 commands pass.** The official
  `npm run selfcheck` halted at command 80 (`swarmWasm`); the sweep was
  completed in three tracked segments over the whole manifest. The two
  non-passes are environmental, each **proven base-identical on pristine
  `origin/main`**:
  - `swarmWasm` — `build-wasm: cargo not found on PATH` (the sandbox has
    no Rust toolchain); pristine fails with the identical assertion and
    exit code, outputs differing only in the tree path.
  - `fx/rollSafety` — `page.evaluate: Target crashed` (sandbox Chromium),
    failing at the same point (5 checks in) solo on pristine main, solo
    on this tree, and in-sweep. This diff touches neither `fx/` nor the
    candidate renderer.
  - The `kineticSweep` ~1.5% flake (#1822) did not fire.
- `npm run lint`: exit 0 (0 errors; 11 warnings, all pre-existing in
  untouched files — `App.jsx`, `FavoritesTray`, `ShelfView`,
  `DataExportRow`, `LootRow`). `npm run build`: clean.
  `npm run format:check`: clean (prettier `--write` applied to
  `exposureModel.mjs` only, after which its suite re-passed 13/13).

## 6. Visual evidence

`~/workspace/kc-1830-shots/` — the synthetic HDR buffer of §4 resolved at
**−1 / 0 / +1 / +2 stops**, desktop (768×480) and phone (360×640), plus
the pristine-main 0-stop frame and a README stating exactly what the
frames are (probe renders through the production resolve — **not stage
captures**; the live stage shot belongs to the review lane on Matt's
machine, where the EXPOSURE row can be played). Measured size of the
change at played stops (share of pixels differing from the 0-stop frame
— the change's size, not a parity claim; a global gain moves nearly
every pixel): −1 EV 99.97% / +1 EV 99.19% / +2 EV 99.19% (+1 and +2
differ from each other — mid-tones keep separating). What the frames
show: at +2 the halation halo blooms and the shadow ground lifts while
the highlight core stays a soft disc (the ACES shoulder rolls it off —
no hard clip); at −1 the wedge's bright end separates into distinct
greys and the halo tightens to the core. That is the issue's thesis in
one frame set: photoreal light, graphic picture.

## 7. What was NOT done

- `resolveFs.mjs` untouched (no shader change); `liveResolve.mjs` and
  `particles.js` untouched; `liveLoop.mjs` changed by the one authorized
  field only (§2).
- No Look-stamping of exposure (deferred by the plan, §3); no new pass,
  no governor change; no panel beyond the one DisplayBlock row.
- The probe page/driver that produced §6's frames are evidence tooling
  kept with the build's working papers, not committed — no shipped
  selfcheck consumes them; the byte-identity claim is independently
  carried by the committed `exposureModel.selfcheck` uniform-stream
  proof and the golden sweep.
