# STAGING REPORT — #1830 exposure: premise check + BOUNDARY STOP

**Verdict: STOPPED at the one-writer boundary, per standing orders. No app code
was changed.** Every premise in the issue is TRUE against the current tree; the
build is fully designed below and needs exactly **one field added in one
off-limits file** (`app/src/gl/liveLoop.mjs`) before any of it can function
live. That change is specified to the line in §3 for the coordinator to route.
Everything else in the plan (§4) touches only editable files.

Issue read in full: body via `gh issue view 1830`; **the issue has 0 comments**
(API count verified), so the body is the whole spec. Base: `origin/main`
888efe24. Branch: `feat/1830-exposure` (this report is its only commit).

---

## 1. Premise verification (all TRUE, evidence on current main)

| # | Issue premise | Evidence |
|---|---|---|
| 1 | #1800 spectral fade shipped (film-like colour aging, in the loop) | `app/src/gl/accum.mjs:37,149,689` — the fade pass consumes a per-channel spectral keep vec3 (`u_keep`), derived from per-channel half-lives. |
| 2 | #1801 shipped: a highlight shoulder **in the loop**, invertible, because ACES in the loop was rejected | `app/src/gl/accum.mjs:174-196` — `highlightSoftCeiling`, Reinhard shoulder, knee 1.0 / ceiling 2.5, with the eval recorded in the header: *"ACES is non-invertible and compounds — it stays at the resolve, #532"*. |
| 3 | #1803 shipped: palette halation (lens bleed in the look's colours) | `app/src/gl/accum.mjs:62,112,209-223,432` — halation tint derived from the active palette's centroid chroma, fallback tint when no palette rides. |
| 4 | #532 keeps ACES at the resolve | `app/src/gl/resolveFs.mjs:3,23-33` — Narkowicz ACES fit in `RESOLVE_FS`; `app/src/gl/resolveBind.mjs` (#532 PR2): live defaults **ACES on, Bayer dither on, exposure 1.0 — "No panel this PR."** |
| 5 | Settled law: filmic curves at the resolve only, never in the loop | Holds in the tree today: the only filmic curve in the codebase is the resolve's ACES; the loop's shapes are the invertible shoulder (#1801) and the spectral fade (#1800). The planned build puts nothing upstream of the resolve (§4). |
| 6 | What is missing is the *model*: an exposure stage in stops + the resolve read as one system | Confirmed missing: `u_exposure` exists in the shader as a bare **linear** multiplier (`resolveFs.mjs:96,112`), bound to the constant `1` by `resolveBind.mjs`. No stops semantics, no stop table, no performer control, no module naming the resolve as one lighting model anywhere in the tree (grep: no `exposureStops` concept outside the unrelated MATH-layer `gain.exposure` param and dish-ecology counters). |

## 2. The boundary, read carefully

Two naming facts the coordinator needs, because the off-limits list and the
tree's names diverge:

- `app/src/gl/liveResolve.mjs` (one-writer) is the **scene** resolver
  (FEED/FIELD placement) — it is **not** on this build's path at all and needs
  no change.
- The final-image resolve chain is: `resolveFs.mjs` (shader, editable) ←
  `resolveBind.mjs` (uniform binder, editable) ← `renderer.mjs`
  `setResolveOptions` bag (editable) ← **pushed from exactly one place:
  `liveLoop.mjs`**, which is also one-writer/off-limits.

Evidence for "exactly one place": `grep setResolveOptions` across `app/src`
returns only `renderer.mjs` (definition/forwards) and
**`liveLoop.mjs:1389`** (the sole caller). The live renderer instance is
created and held only by `liveLoop.mjs` (`createLiveRenderer`, lines 152/218).
This is the house discipline for every global display state — #740 FXAA and
#741 gate weave are store-slice values that **only** reach the screen because
that one block re-pushes them every frame; #1813's wet-look state follows the
same pattern via `setWetLook`, and `wetLook.selfcheck.mjs` pins *"loop pushes
the state every frame"* as the contract.

Consequence: an exposure control built everywhere except that block is a
**dead control** — the panel would move, the store would hold the value, and
the live canvas would never change. Shipping that would violate the house's
honest-telemetry rule. The alternatives are worse: `renderer.mjs` importing
the zustand store directly breaks the layering the whole `gl/` tree observes
(`getState` is injected into the loop precisely so `gl/` never imports app
state), and a module-singleton side channel would silently fork the
`setResolveOptions` discipline. Hence the stop.

## 3. The precise change needed in the off-limits file

**File:** `app/src/gl/liveLoop.mjs`, the existing block at lines 1387–1393:

```js
      {
        const st = getState();
        live.setResolveOptions({
          fxaa: st.fxaa !== false && !st.fxaaShed,
          // #741: gate weave — live canvas (and so WebM recording) only; stills stay exact.
          weave: st.weave ? gateWeaveOffset(performance.now(), frameCount) : null,
        });
```

**Change:** add one field to that bag (nothing else in the file):

```js
          // #1830: resolve exposure in stops — the exposure model's
          // countable, hand-played quantity; resolveBind turns stops
          // into the linear gain the resolve shader applies pre-curve.
          exposureStops: st.exposureStops ?? 0,
```

That is the entire ask: **+1 field (+comment) in one existing call.** With it,
every other part of §4 works end-to-end; without it, none of it is live.

## 4. The build plan (all remaining files editable; ready to execute on routing)

Design rule honoured throughout: the mechanism is the smallest honest one —
**no shader change at all.** `RESOLVE_FS` already applies `u_exposure` as its
first resolve op and ACES after it; the house's own debug harness already
describes the pass as *"exposure -> ACES -> [FXAA] -> dither"*
(`app/src/gl/debug/sweepEffects.mjs:266`). The model names, owns and
parameterises that existing stage order; it does not bolt on a filter.

1. **New module `app/src/gl/exposureModel.mjs`** — the model as one named
   system:
   - `EXPOSURE_STOPS`: the detent table (countable, DS-style, authored like
     the Strata Q stop tables in `panels/build/te/modeStops.mjs`).
     Recommendation: half-stop detents `[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]`
     — fine enough to play, coarse enough to count. *(Matt-overruleable.)*
   - `stopsToGain(stops) = 2^stops` (exact `1` at 0), `gainToStops`,
     `snapExposureStops` (clamp + snap to detent).
   - `acesNarkowiczMirror(x)`: a JS mirror of the shader curve (constants
     copied from `resolveFs.mjs`) for CPU probes and selfchecks — the
     #1801 pattern of GPU pass and JS mirror sharing one source of truth.
   - The composition law, documented in the header: #1800 (spectral fade)
     and #1801 (invertible shoulder, ceiling 2.5) shape the HDR buffer in
     the loop; #1803 tints its glow from the palette; the resolve model is
     the buffer's only exit — **exposure (stops) → filmic curve → dither
     last** — and no curve ever moves upstream (ACES compounds; #532/#1801
     law).
2. **`resolveBind.mjs`** — accept `exposureStops` in the options bag:
   when present, `u_exposure = stopsToGain(snap(exposureStops))`; an
   explicit linear `exposure` keeps winning so probes and goldens stay
   byte-identical. Default remains stops 0 → gain exactly 1 → **every
   existing golden and the parity harness are byte-identical**
   (`resolve.selfcheck.mjs` pins `exposure = 1` in this file's source: keep
   that default literal intact, or the re-pin is named here in advance).
   `u_exposure` is already in `RESOLVE_UNIFORMS` — no list change.
3. **`globalSlice.js`** — `exposureStops` as a per-machine display pref
   modelled exactly on fxaa/weave (`globalSlice.js:85,101,367-375`):
   own localStorage key `kc:exposure:v1`, default 0, persisted on change,
   **never project content** (the `fxaa.selfcheck.mjs` pin: display prefs
   must not enter the project document; add the `bundle.js` reasons entry
   beside `'kc:fxaa:v1'`). Action via a `DISPLAY_EXPOSURE` event, mirroring
   `DISPLAY_FXAA`/`DISPLAY_WEAVE`.
4. **`DisplayBlock.jsx`** (Pipeline panel, beside FXAA/weave) — an
   EXPOSURE row whose readout is the stop value itself (TE renders the
   stop readout; DS: the value is countable). Detent selector over
   `EXPOSURE_STOPS`, readout formatted `+1.0 EV` / `0 EV` / `−1.5 EV`.
   *(Control shape Matt-overruleable; the stop readout is not.)*
5. **Selfchecks** — new `app/src/gl/exposureModel.selfcheck.mjs`
   (stops↔gain round-trip; snap/clamp at table edges; `stopsToGain(0) === 1`
   exactly; mirror-vs-shader constants agreement, read from the
   `resolveFs.mjs` source the way `resolve.selfcheck.mjs` does), registered
   in `app/selfcheck.manifest` (one line; never the package.json script).
   Extend the fxaa-style slice selfcheck for the new pref. Grep-and-run
   every suite naming a touched file (`resolve*`, `fxaa`, `presentOrientation`,
   `wetLook`, cost tiers for the resolve pass — exposure adds no pass, so
   its measured cost is zero by construction: the resolve is "structural,
   never shed", `renderer.mjs:411`).
6. **Open questions from the issue, dispositioned:**
   - *Curve family:* keep the Narkowicz ACES — it is #532's settled choice,
     and the issue asks for a model around the shipped step, not a new
     filter. The eval method is still owed at build time: probe the mirror
     on HDR values captured from the instrument's own scenes (via the
     resolve/parity harness) and report highlight-rolloff behaviour at
     stops −1/0/+1/+2; a family change would re-open every golden and is
     a separate ruling, not this build. *(Matt-overruleable.)*
   - *Performer control vs Look-stamped:* this slice ships the performer
     control only (display-pref precedent). Look-stamping composes with
     Davis's tier grades, which are his-only finish machinery — bolting
     exposure onto stamps in the same slice would entangle two systems;
     recorded as the follow-up question, not silently decided.
   - *Governor interaction:* exposure is a uniform on an existing pass —
     measured cost Δ = 0, nothing to shed. The real interaction is optical
     (bright scenes vs the #1801 ceiling and #1803 halation) and is probed,
     not assumed: before/after frames at −1/0/+1/+2 stops are part of the
     build's evidence.
7. **Visual evidence (at build time):** before/after captures at phone +
   desktop widths on frames chosen for highlights, halation and deep
   shadow; pixel-difference % reported against the house parity bar
   (<10% = pass; at matched stops 0 it must be 0.0% — byte-identical; the
   % at played stops is reported as the change's size, not a parity claim).

## 5. What was NOT done

- No file in `app/` was modified. `liveLoop.mjs`, `liveResolve.mjs`,
  `particles.js` untouched.
- No replacement task invented; the loot lane's remaining items were not
  touched.
- The only commit on `feat/1830-exposure` is this report. Not pushed, no PR
  (coordinator publishes).

## 6. Decision asks for the coordinator

1. Route the §3 one-field change (assign to the one-writer owner, or
   authorise it as part of this build).
2. Confirm or overrule the recorded defaults: half-stop detents −2…+2;
   ACES stays the curve; performer-control-first, Look-stamping deferred.
   Each is a one-line change in §4 if overruled.
