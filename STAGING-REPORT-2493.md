# A15 (#2493) — BUILD layout change applies late

**Verdict shape: (b) — the deferral is lawful/by-design; the defect is the missing pending indication. Evidence + invariant pin only; no production code changed. The indication itself is Matt's design call — decision spec in §5, STOPPED there per the brief.**

The filed hypothesis ("a voice mix at 50% may have held the change") is half right: a mix *is* what stands between the press and the pressed chip — it is the layout's own dissolve, working as ruled. A *scrubbed* mix at 50% does hold its target indefinitely, but it cannot hold a layout press: the press replaces it. Details in §3.

## 1. The mechanism (code path, this tree @ c587a618)

Press → pressed, link by link:

1. `TeaMatrix.jsx` — the tile's `onClick` fires `onChange(id)`; `aria-pressed` is `selected`, and `selected` is exactly `id === value`. The chip has no state of its own.
2. `CompositionTiles.jsx` — `onChange` is `emit(Events.MODE_LOAD, { id })`; the matrix `value` is the `mode` prop.
3. `BuildPanel.jsx` — that prop is `mode={layoutParams.mode}`: **the chip reads the committed store state, nothing else.**
4. `eventBus.emit` is synchronous; `wireEventBus.js` maps MODE_LOAD → `dispatch({ type: A.LOAD_STUB_MODE, id })`; `dispatchPipe.js` passes it through synchronously (only param-drag actions coalesce).
5. `layoutSlice.loadStubMode(id)` merges `{ mode: id }` against the **committed** `layoutParams` (respecting `lockedParams`); if unchanged it is a no-op; otherwise it returns `openParamsMix(state, merged, …)` — it sets `voiceMix` and **does not touch `layoutParams`** ("Live state stays untouched until commitVoiceMix lands it in one undo step", #284/#517).
6. The mix: `auto: true`, `durationMs = 2000` (authored `blendSeconds: 2`), stamped on `loopClock.ms` / `loopClock.presentedMs`.
7. `useVoiceMixDriver` (rAF, mounted in App) advances `t` on loop time and lands the mix through `commitVoiceMix()` by exactly three paths: **completion** at t=1; the **#1935 ceiling** (presented age ≥ 1.5 × duration, while running — ruled by Matt 2026-11-02); the **#806 held-cut** (engine held with t=0 → commit on the 20th tick). Only at commit does `layoutParams.mode` change, and only then does the pressed chip move.

Meanwhile the **stage is not late**: `resolveLiveRenderState` blends via `mixVoiceState`, whose enum rule (Spine E) takes the *target* for any t>0 — "the live target renders while the held outgoing frame dissolves over it". From the first advanced tick the stage is already laying out as the pressed tile; continuous params glide over the 2 s. What lags is only the committed record and its chip.

Two corollaries the same code gives, both observed in the pin:

- **Every press restarts the dissolve.** A press mid-mix re-opens from the committed state with a fresh 2 s stamp. Fifteen presses at sub-dissolve spacing commit *nothing* between them; the last press lands one full duration after itself. The filed sequence (cycle → VORONOI still pressed → solo GRID press → still VORONOI → next observation GRID pressed) is this arithmetic, exactly.
- **Pressing the still-pressed tile mid-mix is a no-op.** `loadStubMode`'s change test reads committed state, so pressing VORONOI while a GRID dissolve is in flight does not cancel it — GRID lands anyway. Going back mid-dissolve takes the MixBar ✕, not the tile.

## 2. Built-app reproduction (this tree, sandbox harness)

Built app (vite build + Playwright SwiftShader, store exposed via `__KC_EXPOSE_STORE`), real DOM clicks on the tiles. The sandbox engine sat watchdog-held (`running:false`) throughout, so landings came via the held-cut rather than the 2 s dissolve — timings differ from the hosted build, the shapes are the filed ones:

- Click **voronoi cells**: mix opens at once (`to=voronoi-cells, auto, dur 2000`); committed in ~0.6 s (held-cut).
- Click **grid**: at +400 ms — `pressed=[voronoi cells]`, `layoutParams.mode=voronoi-cells`, mix standing toward grid. **The filed observation, verbatim.** GRID pressed ~1.9 s after the press.
- Fast cycle of all 15 tiles ending GRID: sandbox clicks are ~2.3 s apart on this heavy page, so each dissolve landed before the next press (held-cut) and GRID already read pressed at +400 ms — the restart-chain needs sub-dissolve press spacing, which the Node pin drives deterministically instead (§4, group "filed cycle": 16 presses at 300 ms sim spacing, zero mid-cycle commits, final press lands 40 frames after itself).
- Scrub case: press **rails**, scrub its mix to 0.5 via `setVoiceMixT` (the MixBar's own action): +4 s later the mix still stands at exactly t=0.5, mode still grid — the target never lands under a scrub. Then press **fibonacci** with that scrubbed mix standing: it is replaced by a fresh auto mix toward fibonacci, which lands. **A standing 50% mix does not hold a layout press.**

## 3. The issue's 50% hypothesis, settled

- A mix standing at 50% **because it is mid-dissolve**: that is the layout change itself in flight; the chip lands when it completes (≤2 s loop time; ≤3 s presented under drag, per the #1935 ceiling). Most plausible reading of the session's note.
- A mix standing at 50% **because it was scrubbed** (`setVoiceMixT` sets `auto:false`; the driver skips non-auto mixes forever): its target — voice, preset, or layout — never lands until ⏵ resume, a scrub to the end + resume, or ✕ cancel. That is the performer's own hand on the crossfade, and it is B19's UX finding ("stayed at 50% for many minutes… the user must scrub it manually to commit, with no prompt"). It still cannot hold a *subsequent* layout press (the press replaces the mix wholesale — §2, scrub case).
- No path drops, retries, or mis-derives a press: dispatch is synchronous, the store write is the mix open, and the pressed state is a pure derivation of the committed mode. Nothing here is verdict (a).

## 4. The pin — `app/src/state/layoutPress.selfcheck.mjs` (manifest-registered)

13 groups, all against the real store + `resolveLiveRenderState`, driving the mix through a replica of the driver's decision order (the #1935 pin's pattern), with source pins binding the replica and the chip wiring to the shipped code. Assertion messages carry measured values (frame counts, blend positions, modes). It pins the invariant the verdict rests on: **pressed state converges to the pressed layout within a bounded number of driver frames after the last press** — healthy engine (lands frame 40/40, not 39), the 50% moment, the filed 15-tile cycle, the committed-tile no-op corollary, the scrub hold + press-through + scrub/resume, and the held engine (20-tick cut; freeze-holds-dissolve; ceiling on resume).

Discrimination, demonstrated:

- **On pristine base c587a618** (pin copied into a scratch worktree): **PASS, 13 groups.** The invariant already holds on the base tree — that *is* the (b) evidence: there is no apply-path defect to fix.
- **Teeth A** (scratch: Spine E enum rule in `voices.js` inverted so the stage takes the target only at t=1): **FAIL, exit 1** — "at t=0.001 the stage already renders grid (got voronoi-cells)". The stage-promptness group has teeth.
- **Teeth B** (scratch: the driver's `if (t >= 1)` completion branch disabled in `useVoiceMixDriver.js`): **FAIL, exit 1** — "completion is tested before the ceiling" (driver-wiring source pin). The replica cannot drift from the shipped driver silently.

## 5. Decision spec — STOPPED for Matt's ruling

The one thing missing is a pending indication on the tile itself. (The MixBar does show the mix — target name + % — but it sits in the CAST section, is labelled "Voice mix", and the stress observer watched the tiles and read the standing pressed tile as "my click didn't take".) Adding any chip-level indication is new visible UI state, so it is Matt's call. The question:

**While a layout dissolve is in flight (up to ~2 s), what should the layout tiles show?**

1. **Pending mark on the target tile (recommended).** The pressed tile keeps naming the committed layout; the target tile wears a distinct pending treatment (e.g. a blinking outline / hollow state) until the commit moves pressed to it. Both facts stay true at once: where you are, and where you are going. Smallest change, no new words, dies naturally if the mix is cancelled (✕) or retargeted.
2. **Pressed moves to the target at press time.** The tile claims the new layout immediately; the stage blends behind it. Feels fastest, but pressed stops meaning "committed". The case that sustains that downside is the scrub hold: scrub the in-flight mix and hold it (`auto:false`), and the tile claims a layout that may not land for minutes — or until resume or ✕ — and a cancel would have to move pressed back. A held engine is narrower than it first reads: a press made at t=0 under a hold lands via the #806 held-cut in 20 ticks (§1); the hold strands the claim only when the mix is already in flight at t>0 when the engine stops, and then only until the engine resumes.
3. **No tile change; strengthen the MixBar instead.** Leave the tiles as-is; make the existing mix indication read as a layout change (e.g. "→ GRID" naming, or surfacing it beside the tiles). Cheapest, but the filed session is the evidence that a signal away from the tile gets missed.

Scope note for the ruling: the ruling covers **layout tiles and MOTION tiles**. MOTION rides the same road and lags the same way: `loadMotion` opens the same params mix (`openParamsMix`, layoutSlice.js:1335), and the MOTION shelf derives its lit chip from the committed `layoutParams` (MotionShelf.jsx:26) — a MOTION chip names the standing motion until the commit lands the new one, exactly like a layout tile. **Voice chips are excluded — they do not have the defect.** A voice rides the same road for its parameters, but `loadVoice` sets `activeVoiceId` in the same `set()` that opens the mix (voiceSlice.js:173–198), and both voice shelves light the chip from `activeVoiceId` (VoiceTiles.jsx:57–70, VoicesShelf.jsx:117): a voice chip names its target from the moment of the press, and only its parameters land at commit. That makes the voice shelf the standing production precedent for option 2's indication behaviour — chip names the target at press, parameters land at commit — already shipped and played. The corollary in §1 (pressing the committed tile mid-mix cannot cancel) rides along with any of the three — under option 1 it at least becomes visible that the in-flight target is not the pressed tile.

Until ruled, nothing visible changes: this delivery is evidence + pin only.

## 6. Verification

- New pin: **PASS (13 groups)** on this tree; PASS on pristine base (see §4).
- Neighbours, all PASS: `stubMix`, `useVoiceMixDriver`, `voiceSlice`, `voices`, `shapeMix`, `scripts/runSelfcheck.selfcheck.mjs` (manifest integrity with the new line).
- `npm run format:check`: clean (the pin was Prettier-formatted; tree-wide check passes).
- `npx eslint` on the pin: clean. `npm run lint` tree-wide was not re-run; the only new/changed code is the one selfcheck file, linted directly.
- `npm run build`: green.
- Full manifest sweep: not run — the change touches no shared or production path (one new selfcheck + one manifest line + this report), per the brief's condition.
- One-writer files untouched: `liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff (read-only evidence came from them).

## 7. Lane routing

This delivery changes **no performer-visible behaviour at all** — evidence, a test pin, and a decision spec. It routes as a test-only/backend change (automatic lane). The follow-up fix, once Matt rules in §5, **is** review lane: a visible tile state is his to look at. If he rules option 3 (MixBar wording/placement), that is also review lane (visible copy/placement).

## 8. Files

- `app/src/state/layoutPress.selfcheck.mjs` (new, 13 groups)
- `app/selfcheck.manifest` (+1 line, after stubMix)
- `STAGING-REPORT-2493.md` (this file)

## QA fix round (2026-11-25)

QA Review returned NOT CLEAN on one blocking finding (F1) plus one NIT — both report-text defects in §5, verified against the code and corrected there. No code or pin changes in this round.

- **F1 — the scope note overclaimed.** It said MOTION tiles and voice chips "ride the same road and lag the same way". The MOTION half is true (same params mix; the shelf derives its lit chip from committed `layoutParams`). The voice half was wrong: `loadVoice` sets `activeVoiceId` in the same `set()` that opens the mix, so a voice chip names its target from the press and only its parameters lag to commit. §5 now scopes the ruling to layout + MOTION tiles, excludes voice chips (they don't have the defect), and names the voice shelf as the standing production precedent for option 2's indication behaviour.
- **NIT — option 2's downside overstated the held-engine case.** A press made at t=0 under a held engine lands via the #806 held-cut in 20 ticks; a hold strands the claim only when the mix is already in flight at t>0. The scrub hold alone sustains the downside, and option 2's text in §5 now says exactly that.

## PR #2540 hardening (2026-11-26) — pausedRecallPresent convergence waits

**Diagnosis verdict.** PR #2540's `selfcheck-browser` CI failed twice on `app/src/gl/pausedRecallPresent.selfcheck.mjs`, both times as convergence-wait expiries. A full A/B diagnosis (10 runs on the PR tree: 4 PASS / 6 FAIL; 12 runs on pristine main `fed78912`: 7 PASS / 5 FAIL; suite code byte-identical between the trees) proved a suite/environment race — not a production defect, and not caused by this PR. Every failure was the same shape: after the A→B setState, the presented grid's mean luminance parked at 138.9–169.4 against the >170 threshold for the full 180 s wall-clock budget — the scene converges over presented frames (the bake/resolver pipeline advances per present), and CPU contention starves the frame count long before it starves the clock; two runs missed the threshold by 1–4 points. Every run that got past scene B passed all 18 groups, both paused-recall groups included.

**The three changes (suite only — no production code touched).**

1. **Convergence waits are budgeted in presented frames, not wall seconds** (the #2541/#2542 pattern: measure in the actor's own turns). `waitScene` and `waitPresented` now poll until the existing criterion is met, the presented count (`g.n`) has advanced by `FRAME_BUDGET` frames past the wait's baseline, or the count stops advancing entirely for `HANG_MS` (the wall clock remains only as that hang detector). Criteria are unchanged: same luminance thresholds, same presented-scene comparisons, same group assertions at full strength — only the budget currency changed.
2. **Boot gate: the scene-A set is maintained inside the read's own turn.** The old gate applied the set once (twice on retry) ahead of the read, so a boot hydration landing after it could strand the wait. `waitScene` with `maintainSceneA` samples the store and re-applies the set in the same synchronous page turn that reads the presented grid — the #2542 sample-and-act pattern — so a late hydration is corrected on the very next read. Boot assertions unchanged.
3. **`waitPresented` failures carry measured values** (house rule): last `g.n`, `nPre`, and the caller's description of the last frame — dA/dB at both recall sites, presented size at the resize site — so a future failure is diagnosable from the log alone. `waitScene` keeps its last-luminance report and adds frames waited plus the threshold.

**Frame-budget choice.** `FRAME_BUDGET = 2400` presented frames; `HANG_MS = 120000`. Diagnosis data: passing runs present the light scene well within a few hundred frames even when slow, so 2400 frames is ≈6–8× headroom over observed convergence; the two near-miss failures needed marginally more presented frames, not marginally more seconds. A budget in frames is contention-invariant: under load the wait takes longer in wall time instead of failing, and a genuinely wrong scene still fails — after 2400 presented frames of it, or after 120 s with no presented frame at all (hang).

**Verification.**

- Hardened suite, standalone, this sandbox: **8 completed runs, 8 PASS (18 groups each), zero criterion failures, zero convergence expiries** — batch 1: 3 PASS (216 s / 235 s / 213 s, start loads 5.20 / 0.58 / 5.89); batch 2: 2 PASS (288 s / 413 s, loads 0.80 / 0.34); batch 3: 3 PASS (222 s / 177 s / 123 s, start loads 0.85 / 4.62 / 0.51).
- **The formal 12-consecutive count is still owed — the sandbox destroyed all three batches before run 12, every time environmentally, never on a suite verdict:** batch 1's run 4 was killed mid-run by a sandbox cell restart; batch 2's run 3 stalled 51 min under a sibling agent's parallel browser sweep (its SwiftShader GPU process spun at ~120–140 % CPU the whole time while presented frames trickled below any usable rate; killed for evidence — its captured output shows the 5 source groups passed and the browser section starved before its first group, i.e. frame starvation, not a failed criterion); batch 3's run 4 slowed under returning contention plus a heavyweight page state, then was killed mid-run by a second cell restart. Recommendation: collect the 12× on CI's dedicated runner (real GPU; `selfcheck-browser` is authoritative) or in a quiet sandbox window. The A/B diagnosis plus the 8/8 banked passes are the evidence the fix removes the CI failure mode: the waits now spend the currency the scene actually converges in.
- `layoutPress.selfcheck` (this PR's own pin): **PASS, 13 groups.**
- `npm run lint`: 0 errors, 11 warnings (the standing count). `npx prettier --check` on the touched file: clean. `npx eslint` on the touched file: clean.
- Production diff: empty — `git diff` names only `app/src/gl/pausedRecallPresent.selfcheck.mjs` and this report.
