# ACCUM round-3 audit — "no trails in LEAVE / RIBBON / COMET"

- **Build audited:** `aedccbe0` (current `origin/main`; the live demo's footer build)
- **Worktree:** `~/workspace/kc-accum-audit2`, branch `audit/accum-no-trails`
- **Method:** read-only — no app code changed. Probe scripts under `audit/`,
  evidence under `~/workspace/kc-accum-audit2-shots/`.

## Verdict: DEFECT FOUND — the live loop throws before it can accumulate

**On the shipped build, accumulation never engages — in any trail mode.**
The first frame that tries to step the accum buffer throws, the loop catches
it, and silently falls back to plain rendering for the rest of the attempt
cycle. Plain render = crisp marks, zero trails. That is exactly Matt's
screen, and it is not his settings.

The app's own console, captured live in this audit from a session seeded
with Matt's state (a) against this build's dist
(`dist/assets/index-PzLFJ2ZP.js`):

```
[gl-live] ACCUM fault — falling back to plain render: ReferenceError: trailSteerLive is not defined
```

It fired repeatedly in the session (fault → 2 s retry → fault → …), matching
`noteAccumFault`'s retry-then-poison cadence in `liveLoop.mjs`.

### The mechanism (source-level, not a bundler artefact)

`app/src/gl/liveLoop.mjs`:

- `trailSteerLive` is **defined** at line 747 — a `const` inside
  `buildFrame` (lines 493–~1200), where it is also used at 751 and 821.
- It is **used** at lines **1470** (`ageBuffer: DEBUG_AGE || DEBUG_TRAILGRID || trailSteerLive`)
  and **1536** (`if (trailSteerLive) updateTrailSteerGrid(accumObj)`) — both
  inside **`tick()`** (starts line 1268), a different function scope.
- There is no other binding anywhere: the identifier occurs only on those
  five lines in the file, and nowhere else in `src/`.

A sibling function's local is invisible in `tick`, so evaluating the accum
params object at line 1470 throws `ReferenceError` on **every** frame that
reaches the accum step. The throw happens while *constructing* the params —
before `accumRecipeParams` is even called — so it fires with accum on
regardless of trail mode, look, or steering state (in the production bundle
the same bare identifier survives verbatim at both tick call sites, verified
in the `aedccbe0` and `58f8784e` dists). With accum **off** the params object
is never constructed and the app is otherwise healthy — which is why the
demo looks fine except for the missing trails.

### Regression origin

- **Commit `db31a36c` — PR #1878, "ember-following drive on the moth —
  ACCUM rung 2 slice 2 (#1837)", merged 2026-10-30.** `git log -S
  trailSteerLive` shows it is the only commit ever to touch the identifier:
  it added the `buildFrame` definition and the two `tick` references in one
  change.
- This **predates** #1895/#1911 and `58f8784e`. It is not a Strata Q, loot,
  Book, FIELD, or Beast regression. Round 1 (43eb699, Oct 31) measured the
  *composition* layer (correct — see Level 1) and its live-app A/B was
  inconclusive; the fault was already live then.
- One piece of prior evidence I cannot reconcile: the #1910 builder's report
  describes real-UI LEAVE screenshots at `58f8784e` showing an (immortal)
  smear, which a tick that throws on every accum frame should not produce.
  Flagged for the coordinator; it does not affect the findings below, which
  rest on this build's source, bundle, and live console.

### Why every suite stayed green

- Unit/selfcheck suites exercise `accum.mjs` and `buildFrame`-level pieces;
  nothing executes `tick()`'s accum branch against a real store frame.
- The one full-app test, `e2e/accum-recording.spec.js`, runs against the
  production build — but its fade-differential assertion was removed (the
  spec's own comment: cross-context timing made the ratio unreliable). What
  remains asserts the recordings contain *motion* (frame counts, mean frame
  diff), which a plain-render fallback passes easily. CI on PR #1913
  (this build): e2e-smoke, lint-build-selfcheck, selfcheck-browser all pass.
- The fallback is silent in the UI: no pill or badge tells the player the
  accum path faulted. The only trace is the console line above.

## What is NOT broken

### Predicted keeps — composition math (executed from the tree's own code)

`accumRecipeParams` + `halfLifeToKeep`, fed exactly the inputs `liveLoop`
builds per state:

| State | Predicted keep | Half-life |
|---|---|---|
| (a) LEAVE, trail 0.05, accum 3.0f | **0.9500** | 13.5 frames |
| (b) LEAVE, trail 0.05, accum 5.4f | **0.9500** (identical — trail governs) | 13.5 frames |
| (c) RIBBON, accum 3.0f | **0.9600** | 17.0 frames |
| (d) plain accum, 5.4f | **0.8795** | 5.4 frames |
| COMET, accum 3.0f (context) | 0.7200 | 2.1 frames — faint **by design math** |

The #1894 "longer fade wins" law and #1911's leaveFade = 0 hand-over compose
correctly.

### Level 1 — the GPU feedback loop on this build

The repo's own probe page (`src/gl/parity/accumProbe.html`: `createAccum` +
`accumRecipeParams` + `accum.step`, the same calls the live loop makes),
driven by `audit/probe-gpu.mjs` — one white disc stamped, then N empty
frames, held-buffer brightness read back per N (raw series:
`audit/probe-gpu-results.json`; chart: `kc-accum-audit2-shots/level1-decay-strip.png`):

| Fed keep | Fitted per-step keep | Verdict |
|---|---|---|
| 0.9500 (states a/b) | **0.9502** | exact |
| 0.9600 (state c) | **0.9600** | exact |
| 0.8795 (state d) | 0.8733 | exact within 8-bit quantisation |
| 0.9500 @ resDiv 2 (retina) | **0.9502** | exact — DPR-2 path clean |

**The accum engine persists exactly as composed.** The erase is not in the
engine, the shaders, the recipe, the resample path, the pattern ground, the
exposure resolve, or the WET wash — the buffer is simply never stepped,
because the loop throws before `accum.step` is reached.

### Level 2 — the live app

Two independent seeded app sessions against this build's dist reproduced
the fault line above (states seeded exactly as `e2e` seeds them:
`kc:project:v1`, `?boot=factory`, echoes off, accum on). A pixel-decay fit
of the fallback is moot — the fallback *is* the plain render, so there is no
buffer and no decay to fit; Matt's four screenshots are the fallback's
portrait. (Rig notes: screenshots starve behind the live SwiftShader loop —
frames were pulled via `canvas.captureStream` + `ImageCapture` on the
secure 127.0.0.1 origin; the app boots watchdog-paused and needs Escape
then Space, verified via the PERF PAUSED pill. Two early probe runs were
lost to my own process cleanup mid-flight; the fault evidence comes from
the runs that completed their wake phase.)

## fps / dt (asked explicitly)

- The fade keep is per presented frame with **no dt compensation** (`dt`
  feeds only the age buffer — traced in `liveLoop.mjs`/`accum.mjs`).
- Once fixed, state (a)/(b)'s designed half-life is 13.5 frames =
  **0.45 s at 30 fps**, 0.54 s at 25 fps, 0.225 s at 60 fps; a wake stays
  above 10% brightness ~45 frames ≈ **1.5 s at Matt's 30 fps**. His frame
  rate was never the problem — there is no wake at all.

## Smallest fix shape (described, NOT implemented)

`buildFrame` already computes `trailSteerLive`, and `tick` already holds
its return value (`const frame = buildFrame(dtSec, loopTimeMs)`, line
1328). Add the boolean to `buildFrame`'s return object and read it as
`frame.trailSteerLive` at the two `tick` sites (lines 1470, 1536). ~3 lines,
one file (`liveLoop.mjs`, a one-writer file — coordinator to land).

Guard that would have caught it: an e2e/selfcheck that boots the preview
build with accumulation on and fails on any `[gl-live] ACCUM fault` console
line — and/or restoring a real fade differential to
`e2e/accum-recording.spec.js`.

## Bottom line for Matt

Your settings were right, twice over. A steering feature merged Oct 30
(PR #1878) left a loose wire in the frame loop: every time the show tries
to lay a trail, it trips over the wire, quietly gives up, and draws the
marks plain. The trail engine itself is perfect — measured. The fix is
about three lines.
