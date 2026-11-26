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
2. **Pressed moves to the target at press time.** The tile claims the new layout immediately; the stage blends behind it. Feels fastest, but pressed stops meaning "committed": under a scrub hold or a held engine the tile would claim a layout that may not land for minutes, and a cancel would have to move pressed back.
3. **No tile change; strengthen the MixBar instead.** Leave the tiles as-is; make the existing mix indication read as a layout change (e.g. "→ GRID" naming, or surfacing it beside the tiles). Cheapest, but the filed session is the evidence that a signal away from the tile gets missed.

Scope note for the ruling: MOTION tiles and voice chips ride the same road and lag the same way. Option 1/2 can be ruled for layout tiles only, or for every MIX-road tile at once. The corollary in §1 (pressing the committed tile mid-mix cannot cancel) rides along with any of the three — under option 1 it at least becomes visible that the in-flight target is not the pressed tile.

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
