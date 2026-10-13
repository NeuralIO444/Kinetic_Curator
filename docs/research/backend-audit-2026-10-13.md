# Backend audit, 2026-10-13

**Scope.** The systems that run without a face: the resolver and its inputs, the render worker path, the performance file and
replay, persistence (the project document), the creature pipeline (Phases 3 and 4), and the repo's own test and build
hygiene. **Method.** Everything that could be automated was: static scans over `app/src`, property tests, a cost and leak
probe in a child process with `--expose-gc`, an end-to-end record-and-replay. Each result below is something that ran, not
an opinion. Findings that need a decision are at the end; none was fixed by guessing.

## Clean

| Check | Result |
|---|---|
| Selfcheck manifest completeness | 343 suites on disk, 343 listed, none orphaned, none listed but missing. The runner already fails on an unlisted suite or a duplicate. |
| Timers and listeners | No file with a `setInterval` and no `clearInterval`, none with an `addEventListener` and no `removeEventListener` (a per-file heuristic: it can miss a cross-file leak). |
| Clock and random reads in `engine/` and `curator/` | Every hit is a comment saying there is none, a diagnostic timestamp (`patchDiag`, `diceCrowns`), or an injectable default. Nothing a frame's output depends on. |
| Persistence, hostile input | `projectDocument.fuzz.selfcheck.mjs`: 400 seeded mutations of a real document (junk numbers, strings, deep objects, `__proto__` keys, whole-field replacement). `parseProject` never threw; sanitising is a fixed point (a parsed document parses to itself); results are plain JSON with no prototype keys; one bad field did not damage the attach points or the creature count. 265 repaired, 135 refused. |
| Resolver cost | 0.17 ms a frame with no creature, 0.25 ms (p95 0.40) with four, in a 300-mark `random` scene. Budget 16.7 ms. |
| Leak | Heap after GC flat over 3500 frames of parameter churn and a seed change: +0.15 MB in `random`, +0.26 MB in `swarm`. |
| Replay, end to end | One 361-frame session with auto spawn, formation, limbs, Davis's shifts and hover replays to all 7 checkpoints; editing a moth's traits, or removing a moth from the take, is caught; the same session twice is the same take. |

## Findings

### F1. The render worker path is not at parity (needs a decision)

The in-thread live loop sends 44 resolver inputs; the opt-in render worker sends 28. **17** are missing there, and each is a
feature silently absent in worker mode. Real consequences, read from the code:

- **the canvas size is not sent**: the resolver places on the default 1000 x 700 whatever size the artist chose;
- **`reducedMotion`**: the OS reduced-motion preference does not damp palette-breath;
- **audio-routed scale and alpha** (`scaleMul`, `alphaBoost`, `effective*`): placements use the layout's own ranges;
- **`soloStash`** (a MATH solo), **`motionSmoothing`**, **`phraseWrapGen`**, **`focusSwap`**, **`mixSeconds`**;
- **creatures** (`dishFormed`, `dishLimbs`, `dishTraits`, `assetAttach`): none form in worker mode.

The default instrument never runs on the worker (`renderWorker` is off; a URL or setting turns it on), so a performer does not
meet these by default. They were found, not introduced. **Done:** `gl/resolverInputParity.selfcheck.mjs` lists every gap with
its consequence and fails on any NEW live-loop input that is neither sent to the worker nor listed, so the gap can no longer
widen by accident (it nearly did for `dishPins`). **Needs a decision:** restore parity, or retire the worker path.

### F2. Two specs pinned exact wiring strings and a panel height (fixed, lesson recorded)

Adding a CREATURES row to the DIRECTORS body broke two e2e specs the unit suite did not cover: the panel-fit spec (the body is
exactly full at a 1280 x 720 window: 484 of 484) and the regroup spec (five labelled sections in a fixed order). The count
now lives in the panel header. **Lesson:** a change to a panel body needs the fit measured, not guessed; the fit is checked
at four window sizes in the PR.

### F3. Three selfchecks matched source text so exactly that a harmless edit failed them (fixed)

`formation`, `dishPressure` and `director` each matched one exact line of `App.jsx` or an allowlist. Loosened to what they
mean (the frame tap calls these functions; these files are logic, not surface).

## Added by this audit

| Tool | What |
|---|---|
| `npm run verify:take <file.kcperf>` | Replay a recorded performance through a fresh resolver and check every checkpoint. Exit 0 replays exactly, 1 not (names the first frame), 2 not a take. |
| `npm run bake:regions` | Rebuild the region mattes for the built-in library (#1432); `--check` verifies the committed data. |
| `gl/resolverProbe.selfcheck.mjs` | Cost and leak, measured in a child process, generous bounds. |
| `gl/resolverInputParity.selfcheck.mjs` | Worker parity, as above. |
| `state/projectDocument.fuzz.selfcheck.mjs` | The persistence fuzz, seeded so a failure reproduces. |

## Not audited (honestly)

GPU paths (WebGL context loss, atlas rebake under churn) need a browser and are covered by the parity suite and e2e, not
here; audio and MIDI input handling; the Tauri shell; network and sync (there is none). Ids from the baked region mattes were
produced with resvg while the browser uses a canvas: they agree for flat art, which the detector is built for, but the two
rasterizers were not compared pixel by pixel.
