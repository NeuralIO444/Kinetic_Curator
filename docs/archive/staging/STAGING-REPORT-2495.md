# STAGING REPORT — #2495 (Stress A17): BUILD cast level cap (4) refuses a fifth cast with no warning

**Branch:** feat/2495-a17 · **Base:** d605f92a (current main) · **Verdict shape: (e/b) — the behaviour is lawful by design; the silence was the defect. Silence fixed, behaviour untouched.**

## The filed observation

P03 BUILD → CAST → shapes. Turn on random / grid / fibonacci / radial (4 chips, level 1). Press the noise-warp chip. After: noise warp stayed level 0. The panel says "Up to 4 on" (in the chips' tooltips) but gives no warning when the fifth is refused.

## Mechanism (measured on pristine base, real store path)

- The CAST shapes shelf is the #733 shape mixer: 15 mixable chips (the layout-costume shape sets — `random`, `grid`, `fibonacci`, `radial`, `noise` "noise warp", …), each cycling off → 1 → 2 → 3 → off. State: `shapeLevels` + `enabledAssets` in the layout slice; the press path is ShapesShelf → `Events.SHAPES_CYCLE` → `cycleShapeLevel`.
- The cap is `SHAPE_MIX_MAX = 4` (`app/src/data/voices.js`), enforced in `cycleShapeLevel` (`app/src/state/slices/layoutSlice.js`): `if (at === 0 && on >= SHAPE_MIX_MAX) return {};` — a pure no-op.
- Reproduction probe on base (flagship pool start, four chips on at 1, fifth press on `noise`): levels unchanged `{random:1, grid:1, fibonacci:1, radial:1}`, pool byte-identical, undo depth 5 → 5, and **no feedback anywhere** — no state field records the refusal (the store's refusal/note keys on base: `fieldGateRefusal`, `midiLearnRefused`, the `*Note` family — none of them is written by this press). The old code comment even claimed "the refusal is the visible constraint"; nothing was visible. The chip's only mention of the cap is its hover tooltip ("Up to 4 on"), which the performer sees before the press, never as its result.

## Cap provenance — established, not accidental

- `git log -S SHAPE_MIX_MAX`: commit ad83d957, "feat(shapes): 4-state intensity mixer — off/1/2/3, **cap 4**, weighted pick (#733)" (PR #778). The cap is a headline parameter of the designed mixer, documented at the constant ("Chips that may be on at once. A fifth tap is refused, never evicts") and in the action's doc comment.
- Neighbouring caps behave the same way by design (refuse, never evict/clamp): the FX 4-cap (#341) and `MAX_USER_VOICES = 12` in the same CAST row, whose capture button at least renames its tooltip when full ("Voice shelf is full (12)"). The shape cap had no equivalent naming at all.
- Conclusion: cap and level are deliberate → no decision spec for Matt; fix the silence only, per the A7 discipline (one honest line where the performer is already looking, in the surface's own idiom).

## The fix (silence only — what a press does is unchanged)

1. **`cycleShapeLevel`** (layoutSlice): the cap-refusal branch now returns `{ shapeMixRefusal: { id } }` — the refusal is banked on the same press, in the store's established refusal-record discipline (`fieldGateRefusal`, the `*Note` family; session-only, no undo entry, mix/pool untouched). Any cycle that lands clears the record (`shapeMixRefusal: null` on the success return). Initial state `shapeMixRefusal: null` beside `shapeLevels`.
2. **`shapeMixRefusalLine(refusal, levels)`** (new pure helper in `data/voices.js`, the A7 `evolveWaitReason` shape): returns the one line — `noise warp stays off — shapes full (4/4 on)` — **only while the record still describes the stage** (refused chip still off, mix still at cap). A stale record (chip freed, pool rewritten, chip since turned on) reads as null, so the line can never name a state that no longer holds.
3. **ShapesShelf**: renders the line under the shapes matrix when the helper returns one (`role="status"`, new `.shapes-refusal` class in panels.css — the dim one-liner idiom: `var(--dim)`, 9px, lois-line spacing). No new surface, no layout change beyond the line appearing under the matrix it describes, no registry text change (the `build.shapes-cycle` entry's description and channel are unchanged; uiRegistry selfcheck re-run green).

Out of scope, noted: the mixer's other refusal — the last chip at level 3 cannot go off (never an empty pool) — is also silent. It is not the filed defect; this slice banks no record for it and the pin asserts that scope. Flagging it here for the coordinator in case a follow-up is wanted.

## Pin — `app/src/state/shapeMixRefusal.selfcheck.mjs` (manifest-registered)

Drives the real store through the filed repro and asserts, with measured values in every message:

- four chips on at 1 → no refusal banked, no line;
- the fifth press (noise) banks `{ id: 'noise' }` while levels, pool and undo depth are provably unchanged, and the derived line is exactly `noise warp stays off — shapes full (4/4 on)`;
- a repeat press re-banks the same record; a cycle that lands (on-chip 1 → 2 at the cap) clears it; freeing a slot clears it;
- the pure gate: stale record under a 3-on mix → null; record for a chip now on → null; null record → null; unknown id → null;
- scope: the never-empty refusal (last chip at 3) and a non-mixable (flagship) press bank nothing.

**Discrimination (demonstrated):** the pin on pristine base d605f92a (scratch worktree, since removed) fails immediately — `shapeMixRefusalLine` is not exported by base's `voices.js` and base banks no `shapeMixRefusal` (probe showed the field `undefined` after the filed press). On this branch: `shapeMixRefusal.selfcheck: OK`. The pre-existing `shapeMix.selfcheck` (which pins the mix behaviour itself, including "fifth tap: pool untouched / no undo entry") still passes unchanged.

## Verification

- Pin + neighbours run green: `shapeMixRefusal` (new), `shapeMix`, `stubMix`, `uiRegistry` (333 controls, ShapesShelf is a registered source), `evolveProgress` (the A7 pattern neighbour). Re-run post-install in the fix round below: all five PASS again.
- `npm run format:check` — whole tree clean. (Re-run post-install in the fix round: exit 0.)
- `npm run lint` — 0 errors; 11 warnings, all pre-existing react-hooks warnings in untouched files (App.jsx, FavoritesTray, ShelfView, DataExportRow, LootRow). (Re-run post-install in the fix round: exit 0, same 11 warnings.)
- `npm run build` — succeeds post-install (exit 0; see the correction below — the original claim that it fails identically on base was an artifact of the missing install).

### Correction (fix round, 2026-11-26): the first sweep and its A/B were invalid

The original version of this report claimed "840 suites, 806 pass, 34 fail — every failure A/B-proven environmental" and that `npm run build` fails identically on pristine base. **Those claims were wrong and are withdrawn.** The first sweep ran in a worktree with **no `app/node_modules` installed at all**: `npm run build` resolved vite 8.0.12 from a shared tree lacking `@tauri-apps/api` and failed on Rolldown resolution, and every suite that shells out to a build or resolves packages failed with it. The "pristine base" scratched for the A/B also had no install, so the two worktrees failed identically because both were identically broken — that is not an environmental proof. QA caught this in review (finding F1), installed `app/node_modules` in this worktree, and the build immediately succeeded. At least 3 of the 31 suites originally classed "environmental" (composite, patternRender, accumFreezeClear) were in fact missing-install failures; the rest of that set was unclassified until re-run. The corrected post-install record follows; the original numbers stand nowhere.

### Post-install verification (fix round, 2026-11-26)

- **Full manifest sweep, re-run with `app/node_modules` installed: 840 suites, 836 PASS, 4 FAIL.** Every failure classified:
  - `swarmWasm` (exit 1) and `rollSafety` (exit 1) — the standing documented sandbox set. A/B against pristine base d605f92a **with node_modules installed there too**: both fail on base with exit 1, identical to this branch. Base-identical environmental.
  - `livingMotion` (exit 1) — failed on its wall-clock budget assertion (floor cost 2.33 ms vs the 2 ms budget at 800 marks). Standalone re-runs straddle the budget on **both** trees (branch: 2.61 ms fail, then PASS ×3, then 2.44 ms fail; base: 1.38 ms PASS, PASS ×2, then 2.86 ms fail). A raw timing measurement on the shared sandbox CPU — load-dependent environmental, not a tree difference.
  - `bgWhiteScene` (exit 1) — failed in the sweep on a flat scene-grid read under full-sweep load. Standalone post-install it **PASSES with all 11 groups on this branch, and PASSES with all 11 groups on installed pristine base**. Load-dependent environmental.
  - `accum` — the third member of the documented sandbox set (exit 134 in earlier sweeps) — **passed** in this sweep.
- `npm run build` post-install: **exit 0** on this branch.
- Pin + neighbours post-install: `shapeMixRefusal`, `shapeMix`, `stubMix`, `uiRegistry`, `evolveProgress` — all PASS.
- Sweep logs and per-suite verdicts from the fix round are preserved with the coordinator's staging record.

## Lane recommendation

**Review lane.** The performer-visible change is one new dim line under the shapes matrix in BUILD → CAST, appearing only after a refused fifth press. No behaviour change: the cap, the refusal, the mix, the pool and undo are exactly as before — the press now names itself. Matt's check: BUILD → CAST, turn on any four shape chips, press a fifth — the line "〈chip〉 stays off — shapes full (4/4 on)" appears under the shapes grid; turn one of the four off and it clears.
