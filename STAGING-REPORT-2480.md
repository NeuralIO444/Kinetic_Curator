# Staging report — issue 2480 (A2): DIRECTORS FREEZE + CLEAR leaves a black stage holding 740 nodes

**Verdict: root cause PROVEN by code-path audit; the fix lives in a one-writer file
(`app/src/gl/liveLoop.mjs`), so per the standing rule this slice stops at the seam —
no production code was changed. The exact seam is specified below for the loop's owner.**

Base: `f35792b6` (current origin/main). The session build `f260b74` differs from this
base in exactly one commit touching the relevant files — the test-only still-render
path (issue 2477) — and none of its hunks touch the freeze, clear, or present lines
below. The mechanism on this tree is the mechanism the session hit.

## The session evidence (from the issue and the stress report)

P07 DIRECTORS → TRAILS. Sequence: ACCUM on, FREEZE, CLEAR, SWELL, role deal off.
After: canvas pure black, 740–746 nodes, fps 60.0, tape 0%, LIVE. THAW recovered the
stage at once (735–784 nodes, fps 42.5, tape 80%).

## Root cause — the mechanism, line by line

Three facts, each read directly off this tree, compose the defect:

1. **FREEZE makes the canvas show the accumulation buffer and nothing else.**
   The gesture lands via DavisPanel → bus → CanvasPanel on `loop.setAccumFrozen`
   (`panels/CanvasPanel.jsx:108–114`), which sets the loop's `accumFrozen` flag
   (`gl/liveLoop.mjs:2362–2364`). In the frame tick, when frozen, the loop presents
   the buffer texture and **skips both the scene render and the buffer step**:
   `if (frozen && accumObj) { live.presentUpscaled(accumObj.texture()); }`
   (`gl/liveLoop.mjs:1917–1920` — "FREEZE: hold the feedback image, skip render + step").

2. **CLEAR empties that buffer to the flat background.**
   `loop.clearAccum()` (the only caller chain is the gesture above) re-begins the
   buffer from the shown background: `accumObj.begin(beginBg)`
   (`gl/liveLoop.mjs:2374–2392`). `begin()` clears both ping-pong textures to the
   flat background colour and voids the age field (`gl/accum.mjs:2553–2574` —
   its own comment: "a begun buffer holds no light"). That is correct behaviour
   for a clear while live: the next frame steps the scene back in.

3. **While frozen, no next frame ever steps the scene back in.**
   So after FREEZE → CLEAR, every presented frame is the flat background, forever,
   until THAW. The scene itself is unharmed: `buildFrame` still resolves it every
   tick and publishes the count (`gl/liveLoop.mjs:1237–1247` — the count is computed
   from the resolver's placements before the present branch is chosen), which is
   why the footer honestly reports ~740 nodes over a pure-black canvas. The count
   reads the resolver; the canvas reads the buffer; FREEZE + CLEAR drives them
   apart. That disagreement — not a dead scene — is the trap state the issue names.

Every other session observation follows:

- **fps 60.0, tape 0%** — presenting one static texture upscaled is nearly free;
  the tape fill is measured frame cost against the 60 fps budget
  (`components/TapeCounter.jsx`), so a frozen, cleared stage reads as an idle stage.
- **SWELL did nothing** — `swellAccum()` only records `swellStart`
  (`gl/liveLoop.mjs:2365–2367`); the envelope is consumed inside the recipe params
  of `accumObj.step()` (`gl/liveLoop.mjs:1593`), which the frozen branch never runs.
- **Role deal off changed nothing** — the switch flips a beast-settings flag
  (`components/BeastSettings.jsx:66–81`); it never touches this path. The trap
  simply persists through any action that is not THAW.
- **THAW recovered the stage at once** — clearing the flag returns the tick to the
  render + step branch; the first thawed frame composites the live scene into the
  buffer and presents it.

## Reproduction attempts (live browser, this sandbox)

Four runs against the built app (vite preview + Playwright's bundled Chromium,
SwiftShader WebGL2, route-interception serving a fake host), driving the shipped
`__KC_UI__` bridge through the issue's exact gesture sequence and sampling the
presented canvas (both drawing-buffer readback and compositor screenshots):

- The gesture path itself works in this environment in bursts — with ACCUM
  effective (canvas corner reading "· ACCUM") the trails scene rendered and
  responded — but the sandbox could not **hold** the loop's live preconditions
  long enough to observe the frozen + cleared composition: at the authored
  1000×700 the governor's tier-1 shed latches within seconds under the software
  rasteriser (corner reads "ACCUM HELD", and a shed ACCUM makes FREEZE/CLEAR
  no-ops by design), and at reduced canvas sizes the fps watchdog trips and
  stops the show (`running=false`), after which the tick presents nothing at
  all (`paused: !s.running`, `gl/liveLoop.mjs:1639,1822`) and any pixel sample
  shows the paused hold, not the frozen buffer. Each run was stopped by a
  different one of those two environmental gates, never by the mechanism.
- One run's readings are consistent with the mechanism but confounded, and are
  recorded as such, not as proof: with ACCUM effective and FREEZE + CLEAR
  applied, the presented buffer sampled uniformly `[0,0,0]` (1 distinct colour)
  across two samples seconds apart while the node count read 164 → 370 — but
  the watchdog had also tripped in that window, so the sample cannot be
  credited to the frozen branch alone.

This matches the repo's standing sandbox caveats (software-GL measurements
differ from real hardware; the governor and watchdog react to sandbox CPU
starvation). The hosted build at real frame rates — where the session ran at
fps 60 with ACCUM effective — holds exactly the preconditions the code path
needs, and there the mechanism above is deterministic: it has no branch that
can produce any other outcome.

## The seam (for the loop's owner — `app/src/gl/liveLoop.mjs` only)

**Fix shape: a clear while frozen re-seeds the held buffer with one live frame.**
The performer's intent is legible from the two gestures: FREEZE holds the stage
still; CLEAR removes the trails. After both, the stage should show the current
scene as a still — trails gone, hold preserved, count and picture back in
agreement. Concretely, all inside `liveLoop.mjs`:

1. Add a loop-owned flag beside `accumFrozen` (~line 415), e.g. `accumReseedPending`.
2. In `clearAccum()` (line 2374), after `accumObj.begin(beginBg)`: if `accumFrozen`,
   set the flag. (No other caller-visible behaviour changes; `clearAccum` already
   guards on `accumObj && accumActive`.)
3. In the tick's accum branch, let a set flag take the normal render + step path
   for exactly one frame despite the freeze — e.g. compute the hold decision as
   `frozen && !accumReseedPending` where line 1917 now tests `frozen` — and clear
   the flag once that frame has stepped. No new render code: the existing
   else-branch does the work.
4. Sibling cases for the same flag, at the owner's discretion: the other two
   `begin()` sites can produce the same trap if a freeze is already standing —
   the enable path (~line 1909) when FREEZE was set via MIDI with ACCUM off
   (the panel disables its button then; `midi/targets.mjs:135` does not check),
   and the dpr-rebuild path (~line 1928). Setting the flag wherever a `begin()`
   lands while `accumFrozen` covers all three with one mechanism.

**Rejected alternative:** handling it in CanvasPanel's gesture router (clear while
frozen also thaws, plus a re-sync gesture for the panel's mirror). It avoids the
one-writer file but changes CLEAR's meaning with freeze state, silently drops the
performer's hold, and covers only the bus path — any future direct `clearAccum()`
caller reopens the trap. The loop is where the state's one truth already lives
(the take recorder reads the frozen state from the loop for exactly this reason,
`gl/liveLoop.mjs:2358`).

**Decision flagged for the coordinator/Matt:** the fix changes what FREEZE + CLEAR
shows (a held still of the live scene instead of black) — that is the defect's
removal, but the resulting still is a feel-visible outcome, so the published PR
belongs in the review lane, not the auto-merge lane.

**Pin for the fix** (to land with it): while ACCUM is effective, node count > 0
must never present as a flat-background frame. Browser-level via the bridge on a
real-frame-rate build: ACCUM on → FREEZE → presented frame is the held scene
(non-background share > 0) → CLEAR → presented frame still shows the scene
(non-background share > 0) with the node count unchanged (± scene drift) → THAW →
accumulation resumes. In-sandbox, the test-only still path (issue 2477) plus the
canvas checksum is the deterministic route: freeze, clear, force the frames,
and the checksum must differ from the flat-background checksum.

## What was built in this slice

- This report only. **No production code, no test files changed.**

## Deliberately not done

- **No edit to `gl/liveLoop.mjs`** — it is a one-writer file; the root cause lives
  there, so this slice stops at the seam per the standing rule.
- **No workaround in CanvasPanel or DavisPanel** — rejected above, on the record.
- **No selfcheck suite** — a suite written now could only pin the defective
  behaviour or fail against it; the honest pin lands with the fix (specified above).
- **No change to `begin()` / CLEAR semantics while live** — CLEAR while unfrozen
  is correct today (verified in the audit and consistent with the control step of
  the live runs: a live clear re-steps the scene on the next frame).

## Verification

Publish ritual run on this tree (which changes no code — the report is the only
file):

- `npm run lint`: **0 errors** (11 warnings, all pre-existing — the same count
  the A1 slice recorded on the base).
- `npm run format:check`: **clean** (this report is prettier-clean).
- `npm run build`: **green**.
- Full manifest sweep (continue-on-error, runner verdict lines counted from
  the sweep log only): **829 PASS / 3 FAIL of 832**. The three failures are
  the known sandbox-environmental set, each A/B-proven identical on a pristine
  origin/main checkout of the same base (`f35792b6`), same exit codes:
  swarmWasm (exit 1), rollSafety (exit 1), accum (exit 134 — the suite aborts
  under sandbox memory pressure on both trees). Nothing is attributable to
  this branch; it changes no production or test code.
- The four live-browser reproduction runs are documented in the reproduction
  section above, with their environmental limits stated plainly; the root
  cause rests on the code-path audit, which needs no frame rate to hold.

## Fix addendum — the designated-writer slice (this branch)

The coordinator designated this slice's builder as the single writer for
`app/src/gl/liveLoop.mjs`; the seam specified above is implemented there, and
nowhere else (`liveResolve.mjs` and `particles.js` untouched). Diff:
`liveLoop.mjs` +29/−1, one new selfcheck suite, one manifest line.

**What was built** — the loop-owned reseed flag, exactly as specified:

- `accumReseedPending` declared beside `accumFrozen` in the ACCUM session state.
- `clearAccum()`: after `accumObj.begin(beginBg)`, the flag is set when
  `accumFrozen` stands.
- The tick's hold test is now `frozen && accumObj && !accumReseedPending` — a
  pending reseed falls through to the existing render + step branch for exactly
  one frame; no new render code. The flag is cleared at the end of that branch,
  so it is consumed whether the frame stepped cleanly or faulted into the plain
  fallback (which presents the live scene directly). The frozen hold resumes
  from the next frame, untouched otherwise.
- The session-end reset clears the flag beside the #268 `accumFrozen` reset, so
  no reseed outlives its session.

**Sibling begin sites** — both handled, per the report's one-mechanism rule:

- _Enable path:_ a real trap — FREEZE can be standing when ACCUM enables (set
  via MIDI with ACCUM off; the panel disables its button then, the MIDI target
  does not check). The enable site sets the flag when the frame's frozen read
  is true, immediately after `begin()` + `accumActive = true`, so the same
  tick's hold test already yields.
- _Dpr-rebuild path:_ this `begin()` sits inside the render + step branch, so
  the frame that lands it steps anyway and cannot itself trap; the flag is set
  there too (when frozen), and the same frame's branch-end clear consumes it —
  no behaviour change today, and any future route that reaches that begin
  while frozen is covered by the same mechanism.

**The pin** — `app/src/gl/accumFreezeClear.selfcheck.mjs` (registered in
`app/selfcheck.manifest` after `accumGuard`): 4 source-pin groups on the seam's
shape, plus 6 browser groups driving the BUILT app through the shipped
`__KC_UI__` bridge (`directors.accum` / `directors.accum-freeze` /
`directors.accum-clear` — the panels' own channels), frames forced through the
#2477 still path, the presented frame read as an 8×8 mean-colour grid
(`__kcPresentedGrid`). The governor is gated off (`__KC_GOVERNOR_OFF`, the
established e2e gate) so ACCUM stays effective under software GL; the suite
asserts that precondition (accumulation on, no tier-1 shed, no render fault,
count > 0) at the moment of CLEAR. Sandbox A/B, same driver: on this tree the
post-CLEAR grid reads **distinct 28 / range 151** at 48 nodes (the scene as a
still, trails gone); on the pre-fix tree it reads **distinct 1 / range 1** at
600 nodes — pure flat while the count read 600, the session's trap reproduced
in-sandbox. The suite is red on the pre-fix tree and green here (10 groups).
One route note: the still hook's `dropAccum` does not defeat the test —
`begin()` is a program-free clear on bridge-owned targets, so CLEAR still
flattens for real, and the reseed frame re-creates the accum object through
`ensureAccum`, exactly as the live path does after any drop.

**Verification**

- New suite: `accumFreezeClear.selfcheck: ok (10 groups)` — and red on the
  pre-fix tree.
- Targeted neighbours, 12/12 pass: accumGuard, accum.seam, liveLoopScope,
  liveLoopSwell, clock.freeze, grainFinish, trailGrid, clock.evolve-accum,
  accumInput, accumFeed, accum.inventory, playUndoStage (A1).
- `npm run lint`: **0 errors** (11 warnings, pre-existing — the base count).
- `npm run format:check`: **clean**.
- `npm run build`: **green**.
- Full manifest sweep (continue-on-error; only `PASS: node …` / `FAIL: node …`
  verdict lines counted — five phantom suite-stdout "PASS:" lines excluded):
  **830 PASS / 3 FAIL of 833**. The three failures are the known
  sandbox-environmental set, each re-run by this slice on the base tree (the
  fix stashed) with identical exit codes: swarmWasm (exit 1), rollSafety
  (exit 1), accum (exit 134). Nothing is attributable to this branch. (The
  sweep shell was OOM-killed at suite 664 and resumed from the verdict log;
  the tally above is the completed 833.)
- The outcome remains feel-visible (a held still of the current scene instead
  of black), so — as the report flagged — the published PR belongs in the
  review lane.
