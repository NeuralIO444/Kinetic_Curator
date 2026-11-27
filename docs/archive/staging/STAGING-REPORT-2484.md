# STAGING REPORT — issue 2484 (A6): BUILD swarm HIGH segments cannot be clicked

Branch `feat/2484-swarm-high-click`, base `f35792b6`. Builder report for the
coordinator; nothing pushed, no PR opened.

## Verdict: defect REPRODUCED, root cause proven, fixed

The covering element is the panel's own **value dock** (`.te-dock`) — the
"editor control" the filed issue suspected. While any exact-value editor is
open, the dock's full-height slab intercepts every tap over the panel's
right strip, including the HIGH segment of every mode row in the panel —
and swallows it silently.

## Reproduction (base tree, before the fix)

Method: the built app served by `vite preview`, driven in Playwright's
bundled Chromium (SwiftShader, fake-host route interception — the working
sandbox pattern), swarm mode entered by loading the flagship SWARM voice
through the shipped `__KC_UI__` bridge; geometry by `getBoundingClientRect`

- `document.elementFromPoint`, clicks both as Playwright locator clicks and
  as raw mouse input at measured centres.

Dock **closed** — no defect at any size (1600×1000, 1440×900, 1280×720):
PARTICLES and GRAVITY cells are equal-width (143.9px at 1600px viewport;
the matrix is `repeat(4, minmax(0, 1fr))`), and every sample point across
both HIGH segments hit-tests to the segment itself; real clicks on HIGH
apply for both rows.

Dock **open** (PARTICLES exact editor, opened by tapping the PARTICLES
readout — the row's own editor): the dock occupies the panel's right
228px (x 1369–1597 of the 599px panel at 1600px viewport).

- PARTICLES HIGH (x 1445–1589): hit test returns `DIV.te-dock-body` at
  20%, 50% and 80% across the cell — fully covered.
- GRAVITY HIGH: same, fully covered. (MID is covered from its centre
  rightward; OFF/LOW are clear.)
- Playwright locator click on GRAVITY HIGH is refused: _"…from
  `<div class="te-dock open" aria-label="Edit PARTICLES">` subtree
  intercepts pointer events"_ — the session's "refused 'covered'", verbatim
  in substance.
- Raw mouse click at GRAVITY HIGH's centre: **nothing happens** — GRAVITY
  stays at MID, the dock stays open. The tap is silently swallowed. This is
  the human form of the defect, end to end.

The session's "HIGH narrow / MID wide" phrasing is the automation's
impression of the dock-covered matrix; the cells are in fact equal-width,
and what varies is how much of each the dock covers.

One inference, stated plainly (QA's note): the filed issue does not record
whether the session had an editor open. The open-dock mechanism is the
only covering mechanism that exists in the code — the dock-closed case is
clean at every size tested — and it reproduces the session's symptom
exactly, including the verbatim "covered" refusal, so the reproduction
above is read as the session's state.

## Root cause

Three facts compose it:

1. `.te-dock` is `position: absolute; top: 0; bottom: 0; right: 0;
width: 228px` inside the panel, and while open it carried
   `pointer-events: auto` across its **whole box** — a full-height slab
   over the panel's right strip. Its body below the editor is dead space,
   but it took events everywhere.
2. Mode rows put their extreme detent, HIGH, at the row's right edge —
   exactly under that strip. Every mode row in the BUILD panel is affected
   the same way; the swarm rows are simply where the session hit it.
3. The dock's dismissal contract ("Escape or tap-outside dismisses",
   ValueDock.jsx) cannot rescue these taps: a tap aimed at a covered
   control lands **inside** the dock's box (target = the dock body), so
   the tap-outside handler does not fire. The tap neither dismisses the
   editor nor reaches the control — no feedback at all. (Taps on
   never-covered segments behave better today: one tap both dismisses the
   editor and applies, because their pointerdown lands outside the dock.)

## The fix (CSS only, `app/src/styles/panels.css`)

The dock's **hit footprint becomes its interactive content, not its
painted box**:

- `.te-dock.open` no longer sets `pointer-events: auto` — the slab keeps
  the base rule's `pointer-events: none` in all states.
- `.te-dock-head` and `.te-dock-body > *` (the editor root, `.te-editor`)
  get `pointer-events: auto` — the head (title, × button) and the editor
  itself stay fully interactive.

A tap on the dock's dead space now passes through to the control beneath;
that control's pointerdown lands outside the dock, so the existing
tap-outside handler dismisses the editor on the same tap and the tap
applies — the behaviour never-covered controls already had. No JSX, no
state, no layout changes.

### Post-fix verification (same harness, fixed build)

- Trap test inverted: dock open (PARTICLES editor), raw click at GRAVITY
  HIGH's centre → **HIGH applies** (aria-pressed true) and the dock
  dismisses on the same tap.
- Hit tests with the dock open: PARTICLES and GRAVITY HIGH are SELF at
  20/50/80% across the cell.
- Editor regression: the PARTICLES editor opens; clicking its slider
  changes the value (120 → 255) and setting it to max reads 500, dock
  open throughout; × closes it; Escape closes it; reopening works.
- Screenshot of the fixed build with the dock open confirms the slab
  paints exactly as before (full-height, panel's right edge).

## The pin

`app/e2e/dock-hit-area.spec.js` (new; runs in the existing `app` Playwright
project): seeds a swarm project (the midi.spec.js seed pattern), opens the
PARTICLES editor, asserts no sample point of either HIGH segment is
covered, taps GRAVITY HIGH and asserts it applies and the editor dismisses
on the same tap, then reopens the editor and asserts its slider still
drives the value live. On the base tree every one of those assertions
fails (the measurements above are the same checks run against the base
build).

Sandbox honesty note: in this sandbox the @playwright/test runner starves
against the app's software-GL load (the app idles at ~0.2 fps here; the
failure point wandered run to run — boot, a locator click's stability
wait, a late expect — never the same step twice, and the spec's core pin
assertions passed in the runs that reached them). Every assertion in the
spec was additionally verified step-for-step through the direct driver
harness on both the base and fixed builds (results above). CI's
e2e-smoke job is the authoritative run for the spec, as with the other
app-project specs in this environment.

## Publish ritual

- `npm run lint`: **0 errors** (11 warnings, the pre-existing baseline).
- `npm run format:check`: **clean** (the new spec was prettier-formatted).
- `npm run build`: **green** (run on the fixed tree before the post-fix
  verification above).
- Full manifest sweep (continue-on-error, verdict lines counted from the
  sweep log only): **829 PASS / 3 FAIL of 832**. The three failures are
  the established sandbox-environmental set — swarmWasm (exit 1),
  rollSafety (exit 1), accum (exit 134) — the identical three with
  identical exit codes the A2 builder's sweep recorded on this same base
  `f35792b6`; this branch changes no production JS and no selfcheck, so
  nothing in the sweep is attributable to it. (The sweep shell was
  OOM-killed once at suite ~405 and resumed in chunks from the log; the
  final counts are over the full 832.)
- Targeted neighbours: the dock's other choreography (open via readout →
  drive slider → Escape) is the fx-row-opens-editor spec's middle act;
  it was replicated exactly in the driver regression above on the fixed
  build and passed. A full in-sandbox run of that spec was not attempted:
  app-project specs starve in this sandbox regardless of tree (see the
  pin note), and CI runs it.

## Visual change note (for lane routing)

**Nothing visual changes.** The dock paints identically (same box, same
background, same slide transition); only its pointer-event footprint
shrinks to its interactive content. The one behavioural change: a tap on
the dock's dead space now dismisses the editor and applies to the control
beneath, instead of being silently swallowed — i.e. covered controls
become reachable, which is the defect being fixed.

## Deliberately not done

- **No change to the dock's size, position, or painted form.** A narrower
  or content-height dock would also uncover the segments but redesigns a
  deliberate surface (#1202: the dock overlays panel content, never the
  canvas) to fix what is purely a hit-testing defect.
- **No reflow/push of panel content while the dock is open.** Same
  reasoning — a layout redesign, not a hit-area fix.
- **No change to ValueDock.jsx.** The dismissal logic was already
  correct; it simply never saw the taps that landed inside the slab.
- Scratch repro drivers were deleted; the sweep log (`sweep-2484.log`,
  gitignored) remains in the worktree root; the preview servers were
  stopped. The npm-install lockfile churn (a `license` field) was
  reverted. One-writer files untouched — this change is one CSS file.
