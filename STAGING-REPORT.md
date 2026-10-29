# STAGING REPORT — #1815 warm-up exports (local only, not pushed)

Builder staging record, branch `feat/1815-warmup-exports` in `~/workspace/kc-1815-build`, stacked on `feat/1813-wet-look` (37efae51, PR #1874) as assigned — not pushed, no PR; the coordinator verifies, rebases onto main, and publishes. This file replaces the report that was at the worktree root (#1813's); that report remains in git history.

Issue (verbatim): **"WET: warm-up exports — deterministic field for stills"**

## Premise check (done before any code)

- The premise **holds**. On the composed tree the wet field is entirely live-only in the still paths: no wet reference in `renderer.mjs`'s still paths or the export entrypoints; `renderAccumSequence` builds its recipe from opts only (wet terms default off in `accumRecipeParams`); `renderScene` has no wet consumption; `renderFrameOffscreen` drops the wet-look the live presentation applies (only `presentUpscaled` runs it). Nothing steps or reads the field for a still. ✔
- The service is callable without a live loop (`createWetFrameService().frame(req)` is pure JS over its slot), so a Node-side rehearsal is possible without inventing a second sim. ✔
- #1813's exports were kept as pure functions precisely so this slice can match live (`wetLook.mjs` header + its handoff). ✔
- One pointer in the issue is stale: it names `docs/ACCUM.md` as carrying the live-only list. ACCUM.md contains no wet text at all (grep-verified); the list lives in `docs/BUGLIST.md`'s WETNESS row and the `vortex.mjs` header. Both were updated; flagged below.

## What shipped, in plain language

A still of a wet project now exports wet. Before rendering, the export rehearses the project's wet field — the same simulation the live instrument runs — for a fixed warm-up of 90 steps over the project's own marks, then renders the still with the field that rehearsal built: the trails drink from it, the pigment (with its dried edges) sits in it, and the finished picture gets the same wet-look finish the audience sees live. Run the same export twice and the two files are byte-identical, because the field is a pure function of the project, the seed, and the warm-up length. The export says what it did: its readout prints **"wet: warm-up K=90"**. A project with WETNESS at zero skips the rehearsal entirely and exports exactly as it did before this change — byte for byte. Nothing new to operate: the still follows the WETNESS the performer already set.

## How

- **`app/src/gl/wetWarmup.mjs`** (new) — the warm-up contract as one module: `WET_WARMUP_STEPS = 90` (1.5 s of field time at the sim's fixed dt), `WET_WARMUP_CEILING_MS = 2000`, the readout string, `warmUpWetField` (a fresh service, K identical frames, returns the final served field or null when dry), `warmUpForScene` + `wetLayoutParamsOf` (THE derivation both still entrypoints share — contract seed/canvas/instances + the first non-FX resolved layer's layout params, motion via the live loop's own `motionAmount`), `wetExportPayload` (the ferried form: recipe terms with packs base64, plus the #1813 display state assembled exactly as liveLoop arms `setWetLook`, ground parsed from the still's own background), and `hashWetField` (the byte-identity probe). No new layout params — K is a recipe constant, never project state (replay-divergence trap).
- **`app/src/gl/renderer.mjs`** — the one-shot renderer gains `applyStillWetLook`: the #1813 pass (same program, same constants, same uniform recipe) driven by the payload's display state, into the finished frame's ping-pong partner, in linear before the resolve. `renderScene` applies it when `payload.wet.display` rides in; `renderAccumSequence` takes a new `wet` opt — its recipe terms join the base params (the field held for the whole sequence, the service's freeze-hold semantics) and the final texture finishes through the same pass. The live renderer's `renderFrameOffscreen` gains the twin pass (`applyWetLookTo`, dedicated mask texture so the live one is never clobbered mid-frame) driven by a payload-carried display state; without one it returns through the exact pre-#1815 line. No new programs (the table stays at seven).
- **`app/src/gl/liveLoop.mjs`** — `captureFrame` assembles the display state from the capture frame's OWN served field (the tick's `setWetLook` assembly, same gate: `wetStep === 1 && wetMask`) and hands it to `renderFrameOffscreen` in the payload. No field → no key → capture unchanged. The ACCUM-on readback branch is untouched (it already carries the field).
- **`app/src/gl/exportStill.mjs`** — `renderExport` warms from its built contract, passes the payload form through, and returns `wetReadout`; the CLI prints it after the output path per seed.
- **`app/src/gl/accumStill.mjs`** — warms from frame 0's contract (progress 0, the state the sequence rises from) + the first resolved layers, logs the readout, passes `wet` through `renderAccumViaGL`.
- **`app/src/gl/parity/glDriver.mjs` + `glHarness.html`** — `wet` rides `buildRenderPayload` and the accum payload; the harness decodes the packs back to `{n, rgba}` for both still paths.
- **`app/src/gl/parity/corpus.mjs`** — `KNOWN_DIVERGENCES` records the signed SVG divergence ("mask absent → static blend", #1815); the corpus itself stays at WETNESS 0, so the sweep is untouched.
- **Doctrine** — `vortex.mjs` header + cost-tier notes, `wetFrame.mjs` header pointer, `docs/BUGLIST.md` WETNESS row, and `docs/WET_ENGINE.md` (status paragraph, §3 gap 1 closed, Phase C row landed) now state the warm-up contract where the live-only text stood.
- **`app/src/gl/wetWarmup.selfcheck.mjs`** (new) + one manifest line — the acceptance suite below.

## Verification (sandbox; CI is authoritative for the browser suites)

All suites run solo on this tree, after the last code change and again after prettier.

| Suite | Result |
|---|---|
| wetWarmup (new) | **21/21** — incl. GL: wet export byte-identical across runs; wet ≠ dry; dry export byte-identical to the shared candidate render; wet accum sequence byte-identical across runs and ≠ dry sequence; corpus dryness + signed divergence record |
| accum (solo, 3 GB heap) | **OK (83/83 cases)** |
| vortex / wetFrame / wetLook | 34 · 15 · 16 |
| composite | 15 (program table unchanged — no re-pin needed) |
| grainFinish | PASS — its exact source-shape pins (`renderScene`/`renderFrameOffscreen` finish nesting) preserved verbatim, no re-pin |
| accumFeed / accumGuard / accumInput / accum.seam / accum.inventory | PASS · PASS · OK (7) · PASS · PASS |
| exportStill / canvasSizes / presentOrientation / contactShadow / spectrumMarks / atlas.skip | PASS ×6 |
| parity / glDriver / uniformLocations / pigmentKM / costTiers / liveLoopSwell / clock.inventory | PASS ×7 |
| `npm run build` | **exit 0** (✓ built in 2.43 s) |
| eslint + prettier on touched code files | clean |

Warm-up timing (the issue's pinned ceiling): K=90 at the 128-grid constants over still-shaped inputs (48 tinted instances, no velocities — a still's contract instances carry none) measured **476–514 ms** across runs in this sandbox, asserted `< 2000 ms` with the figure logged in the suite.

Two things caught during the build, chased down rather than waved at:

- **A real GL bug in my first cut:** `renderFrameInto` returns a *spread copy* of its read target, so choosing the wet-look ping-pong partner by object identity missed, and the pass drew a texture into itself (GL 0x502, caught by renderScene's error check). Both still passes now choose the partner by **texture** identity. Worth knowing for #1814: any future pass over a composed frame has the same trap.
- **`npm run build` failed on first run here** — not the known @tauri-apps environmental failure: this fresh worktree simply had no local `node_modules` (resolution fell through to a shared install that lacks the package). A fresh `npm install` fixed it; the base worktree (kc-1813-build) builds green too, and so does this build. `package-lock.json` untouched.

## Decisions flagged for #1814 / the coordinator

1. **accumStill warms from frame 0** (progress 0 — the project state the sequence rises from), field held across the sequence. If #1814's dish/trails work wants the field rehearsed at a different anchor (e.g. mid-sequence motion), the anchor is one line in `accumStill.mjs` + the readout wording.
2. **The readout's reach:** it prints on both CLIs and returns from `renderExport` (`wetReadout`). It does **not** land in studio.py's sidecar manifest: studio.py drops exportStill's stdout, and its sidecar block is deliberately seed-independent while the warm-up is seed-dependent. Wiring it per-edition needs a studio.py change (parse the CLI line) — the issue's acceptance ("appears in the export's manifest/readout") is met on the readout; the sidecar hook is a follow-up if Matt wants it.
3. **`renderFrameOffscreen` takes its state from the capture frame, not the armed tick state** — one source of truth per render, assembled identically. If a future caller wants the armed state instead, the renderer's contract (payload-carried display state) is the seam.
4. **No new cost tier was registered for the warm-up.** It runs the already-registered `gl/vortex` work on the export path (offline, not governor-shed); the issue's cost acceptance is the pinned ceiling + timing log, both in the suite. WET_ENGINE's Phase C row mentions "cost tier for the new sampling" — if the coordinator wants an export-path registration as well, it is a small follow-up, not part of the issue's acceptance text.
5. **Issue pointer discrepancy (premise note above):** the live-only list the issue located in `docs/ACCUM.md` actually lives in `docs/BUGLIST.md`; ACCUM.md has no wet text. The BUGLIST row and the vortex header carry the replacement contract.
