# STAGING REPORT — #1823 Loot: MarkovJunior — grid rewrite rules for patterns and creature growth

**Branch:** `feat/1823-markovjunior` in worktree `~/workspace/kc-1823-build`, based on `origin/main` 888efe24. (This file replaces the previous lane's report, per the staging ritual.) Not pushed, no PR — coordinator publishes. **Review lane: Matt judges feel and merges.**

## Premise check (stop-rule honoured, premises held)

- Pattern modes (QUILT/GLYPH/FIELD/TIDES) do deal finished grids — verified in `patternSource.buildGrid`. No MarkovJunior or grid-rewrite machinery exists in the tree (grep: the only "markov" is the curator's unrelated Markov-chain transition picker). The L-system the issue contrasts against exists (`engine/lsystem.js`) and is indeed context-blind. No premise was false; the build proceeded.

## What shipped — the first honest slice: the PATTERNS home

The issue names two homes, patterns first, creatures second (the creature wiring touches the ALife set #1734–#1738 and is its own slice). This build delivers the engine + the pattern home, complete:

1. **A generic MarkovJunior-style rewrite engine** — `app/src/engine/kernel/markov.js` (kernel, so the creature home can import it later without depending on `src/pattern/`):
   - Rules are small rectangular patterns authored as strings over a caller's alphabet; one written rule matches in **every dihedral symmetry** (4 rotations × reflection, deduped, input/output paired by transform).
   - `*` wildcard: input matches any state; output keeps the cell.
   - A program is a **sequence of phases**; a phase fires one rule application per step until its step limit or **exhaustion**, then the next phase runs — the semantics that make the reference's grow-then-seal maze idiom work.
   - Two declared deviations from the reference, both forced by KC-1 law and documented in the file header: the match-choice stream is the house seeded PRNG (trajectory = f(seed), replay law), and a phase's rules are chosen by **weight** among matching rules (the reference has no weights; KC-1 needs MIX to steer rule appetite).
2. **PATTERN mode REWRITE** — `app/src/pattern/rewrite.js`, a peer of TIDES in every respect:
   - **Ruleset:** seeded heads (growth tips) on an empty grid; `extend` (head advances), `spawn` (path buds a new head, weight = MIX), `seal` (leftover heads die into path once growth stalls). Both growth rules are **3×3 context rules**: the target's other neighbours must still be void — this is what makes one-cell-wide corridors that never merge instead of flood fill, and it is the issue's own point (the rule sees its neighbourhood). Proven in selfcheck: **no 2×2 block of path can ever form**, and every path cell is connected to a seeded head.
   - **First cut corrected in-flight:** the naive 1×2 rules (`H·→PH`) flood-filled the grid into patchwork (looked fine, wasn't a maze). The renders exposed it; the context rules fixed it.
   - **Colour = growth order:** path cells wear the palette's non-ground swatches sorted dark→light, stepped by birth step (oldest trunk darkest, sealed dead-ends lightest); live heads wear the ramp's top. Palette only — asserted per-pixel.
   - **Budget (the issue's hard constraint):** `REWRITE_MAX_STEPS = 1024` rule applications per run, a hard stop; measured runs take ≤ ~175 steps at the default grid and stay far under at the largest (density 12). A budget-cut run would render mid-growth, heads lit — never loop.
   - **Time:** DRIFT is the growth's clock. DRIFT 0 = finished growth, drawn once and cached like any still. DRIFT > 0 replays growth over 6 DRIFT-seconds, holds 2, regrows; a frame is the state after k steps and k is a pure function of (seed, params, drift, t) — every frame replays exactly, and the whole trajectory is stored as two per-cell step arrays (born / bornHead), never re-run per frame.
   - **Registration/plumbing, TIDES-identical:** `PATTERN_MODES` + defaults (density 10, mix 0.4 — both are PATTERN_STOPS stops, per the DS law), `PATTERN_FIELD_LIKE` (no element motion; editor disables KIN/MOVERS with the reason), `patternSource` grid/frame branches, `ground.js` sampler branch (`rewriteCellAt`: marks lean toward the cell's state colour; unborn cells read as ground), cost tier **0** declared at registration (`pattern/rewrite`, timeMs 3 with the one-off growth noted), editor mode chip + hints.
   - **Not dealt:** like TIDES, REWRITE is hand-picked only — `PATTERN_DEAL_MODES` unchanged, so every existing seeded KIN/CURATOR deal (and replay) deals what it always did. Asserted by deep-equal pin + 400-deal sweep in the selfcheck.
3. **Spec:** `docs/PATTERN_SPEC.md` — REWRITE added to the mode list, a Composition (REWRITE) section, the Parameters table, and the Motion section.

## Design decisions (each Matt-overruleable at review)

1. **Mode name REWRITE** (the mechanism), grid rhythm borrowed from TIDES (cols = 2 × DENSITY). If the name should be the picture (MAZE/GROWTH), it's a rename in `patternTrack.js` + spec.
2. **Colour by birth step** rather than one flat path colour — the growth's history is the visual dividend of a rewrite mode; a flat colour throws it away. Bands quantise to the palette's swatch count (≤ 6).
3. **Weighted rule choice** (spawn weight = 0.3 × MIX) instead of MJ's match-count probability — deviation declared in the engine header. MIX also sets the opening head count (1 at MIX 0 → 4 at MIX 1): MIX 0 grows a single sparse trunk (~14% fill measured), defaults grow a dense maze (~48% fill, near the geometric ceiling of one-wide corridors with one-cell gaps).
4. **Growth loops** (grow 6 s → hold 2 s → regrow) rather than growing once and freezing — the house "never static" rule; DRIFT 0 still gives the finished still.
5. **Heads placed with a min-separation preference** (Manhattan ≥ 4, bounded 64 tries) so trunks start as separate growths.
6. **`RW_WALL` state reserved** in the alphabet but unused by this ruleset — the obstacle/seeding hook for a later ruleset or the creature home; not a stub feature, just the alphabet's fourth letter.
7. **No BUILD surface changes** beyond the mode chip the editor already renders from `PATTERN_MODES`; no new panel (per repo contract).

## Verification

- **New suites:** `kernel/markov.selfcheck` 8/8 (symmetry generation + dedupe, wildcard semantics, grow-to-exhaustion→seal idiom on a hand-checkable 5×1 corridor, phase step limits, hard budget on a never-exhausting program, zero-weight rule never fires, step-for-step replay). `pattern/rewrite.selfcheck` 10/10 (mode registration + deal exclusion, cost tier, trajectory invariants incl. connectivity + 2×2 corridor guarantee, monotonicity void→head→path at every step, budget at max density, MIX behaviour incl. measured path counts, age-band colour endpoints, palette-only pixels, replay law incl. regrowth cycle equality, ground-sampler agreement at every cell centre, step clock, cost timing: growth build ≈ 6 ms one-off at default size, moving 1000×700 frame median ≈ 0.15 ms vs 3 ms declared).
- **Touched-file pin sweep** (grep selfchecks for every touched file, run them): patternTrack (17 ✓, one re-pin below), tides 12 ✓, patternRoll 7 ✓, patternRender 20 ✓ (its per-mode pixel loop extended to REWRITE — added coverage, same assertions), rasterFast 8 ✓, quilt 24 ✓, glyph 30 ✓, field 30 ✓, motion 19 ✓, elements 10 ✓, patternEditor 6 ✓, blockStops 10 ✓, groundNudge / groundSnap / dishGround ✓.
- **Re-pins (2, each with cause recorded in place):**
  - `patternEditor.selfcheck.mjs` — the offered-mode list pin gains `'REWRITE'` (cause: #1823 adds the mode).
  - `patternTrack.selfcheck.mjs` — `PATTERN_DEFAULT_DENSITY` deep-equal gains `REWRITE: 10` (cause: the new mode's default joins the table).
  - No check was weakened or deleted; `PATTERN_DEAL_MODES` and all existing modes' behaviour are unchanged.
- **e2e:** new `e2e/pattern-rewrite.spec.js` mirrors the TIDES spec (mode tile writes through, density default 10, element motion disabled with the reason, drift writes through) + live-stage screenshots. Passes, and `pattern-tides.spec.js` still passes beside it. No existing e2e selector was affected (no surface converted; the chip row renders from the mode list). Grep of `e2e/` for mode enumerations found no other spec counting modes/chips.
- **Full manifest sweep: all 551 suites accounted for.** The official runner passed everything up to `swarmWasm` (line 86); a segment runner then covered lines 82–551 (470 suites). Total failures: exactly 2, **both proven environmental / base-identical on pristine `origin/main`** (888efe24, run in a clean worktree): `kernel/bake/swarmWasm` — `cargo not found on PATH` on both trees; `fx/rollSafety` — Playwright `page.evaluate: Target crashed` on both trees (the documented sandbox-browser failure). The known kineticSweep flake (#1822) did not fire. Everything else passes, including both new suites in-sweep.
- `npm run format:check` clean (prettier applied to the 3 new files only). `npm run build` clean. `npm run lint`: 0 errors (11 warnings, all pre-existing in untouched files).

## Visual evidence (`~/workspace/kc-1823-shots/`)

- `rewrite-1280-canvas-grown.png` — **the real built app, live stage**: a finished REWRITE pattern (added through the actual UI in the e2e run, DRIFT set to 0 for the still). Corridors + age bands read exactly as designed.
- `rewrite-1280-canvas.png` — the same live stage mid-growth (DRIFT 1): the headless watchdog (PERF PAUSED, the documented harness state) froze the growth a few steps in — heads lit, first path born. Honest limit, stated plainly: the sandbox harness cannot hold the loop open long enough to film the full growth; the offline renders below carry that story.
- `rewrite-finished-seed1823.png`, `rewrite-midgrowth-seed1823.png` — **offline renders of the rasterizer's actual output** (`patternPixels`, praystation palette, seed 0x1823): finished maze and the same growth mid-flight.
- `rewrite-finished-seed99-mix0.png` — MIX 0: one trunk, its timeline readable along its length. `rewrite-finished-seed7-mix1.png` — MIX 1: the bushy maze.

## Files

New: `app/src/engine/kernel/markov.js` + `markov.selfcheck.mjs` · `app/src/pattern/rewrite.js` + `rewrite.selfcheck.mjs` · `app/e2e/pattern-rewrite.spec.js`.
Edited: `app/src/pattern/patternSource.js`, `app/src/pattern/ground.js`, `app/src/state/patternTrack.js`, `app/src/panels/build/PatternEditor.jsx` (mode hint + MIX/DRIFT hint copy), `app/selfcheck.manifest` (+2 lines), `docs/PATTERN_SPEC.md`.
Re-pinned (causes above): `app/src/panels/build/patternEditor.selfcheck.mjs`, `app/src/state/patternTrack.selfcheck.mjs`. Coverage extended: `app/src/pattern/patternRender.selfcheck.mjs` (mode loop +REWRITE).
Untouched, per orders: `liveLoop.mjs` / `liveResolve.mjs` / `particles.js` (the renderer consumes the mode through patternSource's existing contract).

## What this does NOT do

- The **creature home** (context-sensitive growth for #1734–#1738 bodies) is not wired — the engine is kernel-resident and ready for it; that slice is its own build.
- No XML/rule authoring surface: rulesets are code, as the issue prescribes ("KC-1 would implement the rewrite loop in its own JS kernel idiom"). A second ruleset (e.g. a river/branch variant) is a follow-up if Matt wants the mode to have moods.
