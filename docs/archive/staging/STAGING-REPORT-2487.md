# STAGING REPORT — #2487 (A9): BG WHITE blank canvas

Branch `feat/2487-bg-white-blank` on base main `e4dd35f9`. Local only — not pushed, no PR (coordinator publishes in line order).

## Shape verdict: (e) — not reproducible on this tree

The recorded sequence (BG PALETTE > TRANSPARENT > WHITE, lock S1, shuffle,
harmony COMPLEMENTARY, open/close the lab) was driven end-to-end in the built
app on this tree, across a palette spread, with ACCUM on and off, FREEZE/CLEAR
included, governor on and off. In every controlled run the presented frame in
WHITE mode carried the scene's marks. One blank was observed exactly once,
under sandbox GPU collapse, and never recurred (see "the one blank" below).

### Pixel evidence (presented frame read via `__kcPresentedGrid`, 48×48 unless noted)

Healthy WHITE-mode readings (modal cell = the white field; "dev" = share of
cells deviating from it by > 25 in any channel; the field reads [205,205,205]
when the boot look's resolve has ACES on — 205 ≈ ACES(1.0) × 255, a display
tonemap that applies in every mode):

| Run | Palette / conditions | WHITE reading |
|---|---|---|
| c | ochre-wall, no ACCUM, recorded sequence | 83.7% of cells markedly non-white; marks present pre- and post-shuffle |
| d | boot pastel palette, no ACCUM | marks down to ~[125,150,153] against the [205] field; CDP screenshot of the displayed canvas confirms marks visible |
| f | smoke, ACCUM on, shuffle in PALETTE | dev 27.6%, sat 3.9%; CDP screenshot shows the scene (VOID stamps, circles) clearly on white |
| g | perihelion, ACCUM on, governor ON, shuffle in WHITE, decay series | dev 9.9% → +4f 9.9% → +12f 10.0% → +28f 9.8% → after 9 s real time 11.5% |
| h | praystation, ACCUM on, governor OFF, exact recorded recipe | dev 31.6% → shuffled +6f 31.4% → +20f 31.6% → after real time 30.2% → WHITE again 31.7% |
| pin | praystation + smoke, governor OFF (the landed selfcheck) | all 11 groups pass, incl. WHITE, WHITE+shuffle, WHITE+lab, WHITE+ACCUM, WHITE+FROZEN, WHITE+smoke |

### The one blank (run e)

Praystation boot palette, ACCUM on, governor ON (no `__KC_GOVERNOR_OFF`),
SwiftShader: WHITE+ACCUM read dev 26.7% / sat 5.1% (frame 74); after lock S1 +
COMPLEMENTARY shuffle it read dev 1.4% / sat 0.0% (frame 86), and the frozen
ACCUM buffer was 100% modal [205,205,205]. Nodes still resolved (158 → 136).
Conditions at the blank samples: the watchdog had tripped (`running=false` at
two samples) and the governor was shedding under software-GL fps collapse.
The identical recipe on the same palette with the governor off (run h) and on
a second palette with the governor on (run g) is clean, as are four other
boots. No tree mechanism was found that produces it (below), and it did not
recur in six further attempts. It is recorded here as an unreproduced
observation under degraded sandbox rendering, not as a WHITE-mode defect.
The session itself ran at fps 60.0 on a real GPU, where the governor is idle.

### Why each candidate shape is eliminated

- **(a) white ink on white** — WHITE mode changes only the frame's `bgCss`
  (`liveLoop.mjs` buildFrame: white → `'#ffffff'`); item tints come from the
  palette and the WASH/FADE tint machines, which never see `canvasBg`. In all
  clean runs the marks on white carry the palette's own colours.
- **(b) white composited over the nodes** — the DOM `.canvas-bg` div sits
  UNDER the GL canvas (canvas zIndex 1); the renderer clears the frame target
  with the bg colour and composites layers over it; the present shader mixes
  hold/live scene textures only. No post-marks white pass exists.
- **(c) zero alpha in WHITE mode** — non-transparent modes clear the target at
  alpha 1; the mark alpha path is mode-independent; measured deviation and
  saturation in WHITE match PALETTE in every clean run.
- **(d) palette-dependent** — measured over the whole catalog: every one of
  the 39 palettes resolves with ≥ 3 swatches at relative luminance ≤ 0.5
  (minimum 3: vortex-rwb, river-delta, solar-max, persona-reas,
  persona-menkman), and every harmony generation — any anchor (incl. pure
  white) × any of the 6 schemes — yields ≥ 2 such swatches (worst case:
  monochrome from a teal anchor). No standing or shuffled palette can be
  all-near-white. The lightest palettes (smoke, perihelion) were also driven
  live on white and read clearly.

## What was built

No production code changed — there is no defect on this tree to fix. Landed:

- `app/src/gl/bgWhiteScene.selfcheck.mjs` — the invariant pin, in the
  accumFreezeClear pattern. Section A (runs everywhere): the two luminance
  floors above + the BG cycle order in `globalSlice`. Section B (browser,
  skipped when no Playwright browser is present): builds the app, serves
  `dist`, drives the shipped `__KC_UI__` bridge with the governor gated off,
  and asserts at each step of the recorded sequence — BG cycle to WHITE,
  lock S1 + COMPLEMENTARY shuffle, palette-lab open/close, ACCUM on, FREEZE
  hold, and the smoke palette — that with `nodeCount > 0` and
  `canvasBg === 'white'` the presented frame is a white field WITH the
  scene's marks: modal ≥ 170 per channel and the accumFreezeClear flatness
  bar cleared (distinct ≥ 8, range ≥ 40 on a 32×32 grid; a blank reads
  ~1/~0). Deviation share is printed on failure but not gated — a sparse
  healthy scene measured devShare 0.026 with distinct 29 / range 90, while
  the blank read a 100% modal field. White-state samples allow two re-reads
  so a stale grid under sandbox load cannot fail the pin; a stable blank
  fails every read. Result on this tree:
  `bgWhiteScene.selfcheck: ok (11 groups)`, browser section not skipped.
  Pin history, for honesty: the first version (which also gated deviation
  share ≥ 4%) passed standalone twice, failed once inside the loaded sweep,
  and failed once standalone on the sparse scene above — that failure is
  what moved the gate to the flatness bar. The shipped version passes
  standalone; CI is the authoritative runner for it either way.
- `app/selfcheck.manifest` — one line registering the suite beside the
  accum/composite cluster.

## Verification

- Pin: `bgWhiteScene.selfcheck: ok (11 groups)` (full browser run).
- Neighbour suites, all exit 0: composite (15 cases), canvasSizes (62 cases),
  paletteMix, tintWash (17 tests), tintInject, palettes (data), harmony
  (engine, 6 schemes), presentOrientation, renderFault, exportStill,
  accumFeed (15 cases), accumGuard, accumInput (7 cases), accum.seam,
  accum.inventory.
- Lint: 0 errors (11 warnings, none in the new file — `eslint` on
  `bgWhiteScene.selfcheck.mjs` is silent).
- format:check: clean on the final tree (the new file was prettier-formatted;
  the only other flags were this lane's own scratch repro scripts, deleted).
- Build: `npm run build` green (✓ built in 6.78s).
- Full manifest sweep (all 835 entries, continue-on-error, per-suite exit
  codes counted): **834 PASS / 4 FAIL**. The four failures are all
  sandbox-environmental, none caused by this change (which touches no
  production code): `swarmWasm` exit 1 and `rollSafety` exit 1 — both
  A/B-verified by my own runs to fail identically on a pristine `e4dd35f9`
  worktree; `accum` exit 134 (V8 abort in its browser section) — likewise
  A/B-verified identical on pristine `e4dd35f9`, standalone and in-sweep;
  `bgWhiteScene` exit 1 in-sweep only (the first pin version, under load,
  immediately after the accum abort, with a second lane's browser suites
  sharing the box) — see the pin history above; the shipped version passes
  standalone.

## Visible-change note (lane routing)

**Nothing changes for the performer.** No production code was touched; WHITE
mode looks exactly as it did. This is a test-only, zero-behaviour-change
landing: it closes the A9 question with evidence and leaves a regression pin
standing guard. Route as a no-look item (coordinator publishes; no review-lane
ceremony needed). If the blank is ever seen again on a real GPU, the pin's
grid metrics (deviation share / distinct / range) are the first measurement
to take — they separate "marks absent from the presented frame" from "marks
present but faint" in one read.
