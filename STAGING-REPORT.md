# E5 staging report — #1530 Davis variants (the variant engine)

**Branch:** `ember/1530-variants`, originally stacked on E4's staged tip `b07fa9e3`. (Conveyor note: while this stage's sweeps ran, the parent lane merged E4 (PR #1543) and rebased this branch onto the squash — the feat/test commits below kept their messages and content, new hashes `a6e4f442` / `2676a5c5`; the new-suite pass was re-verified on the rebased tree before this report was committed.)
**Status:** staged locally only — NO push, NO PR, no GitHub writes by this builder. Commits: feat, test, this report.

## What was built (plain language)

1. **A variant engine** (`app/src/curator/variants.mjs`). Given a recipe, it manufactures a new asset drawing from library parents — deterministically: same recipe + same seed = the identical svg string, forever. No `Math.random` anywhere; every draw comes from a seeded stream named in the recipe. Generation happens once, when a look is dealt — never per frame — and the module declares exactly that (`VARIANT_GENERATION`: deal-time, per-frame false, live cost none, tier offline).
2. **Eight operations.** One-parent (transform): **symmetry** (the drawing multiplied into a dihedral rosette — rotations, optionally mirrored), **tile** (a ring of small rotated copies), **restyle** (stroke/dash restyling in five modes: accent-swap, outline, dash, ghost, weight), **jitter** (every path point and leaf-geometry coordinate nudged by a seeded amount inside a declared tolerance). Two-parent (combine): **superpose** (the partner laid under a seeded rotation/scale/shift), **mask** (the partner clipped to the lead's silhouette), **splice** (the two drawing streams interleaved, paths split at subpath seams), **morph** (point-by-point interpolation — only where the two parents' path structures are identical; see the honest rule below).
3. **The miner gained a variant axis** (`miner.mjs`, `scripts/exploreRun.mjs --variants <0..1>`). A recorded fraction of dealt cast members are replaced by variants of themselves. The default is 0 — off — and with it off the run is byte-identical to E4's (no draws consumed, no sample changed; E2's and E4's suites pass untouched). When on, the run id says so (`xpl-1530-120-12-var30`), the config records the fraction, and the report carries a variants block: drawn, dealt, fallbacks, per-op counts, variant members among finalists.
4. **Recipes ride the records** (`provenance.mjs`). A candidate whose cast carries variants carries their recipes in `provenance.variants` — the E3 provenance shape, extended additively. Crowning such a candidate through the real shelf door (KEEP_ADD) and into the taste ledger keeps the recipes whole — proven end-to-end in the new suite. A keep therefore stays reproducible forever: the recipe IS the asset.
5. **The tray distinguishes them** (`CandidateTray.jsx`). A card whose provenance carries recipes gets a second tag, VARIANT, top-right of the still (the mined tag stays top-left). The provenance label counts a variant under its lead parent's family and ends with a plain `· variant` segment.

## The recipe shape

```js
{ parents: ['org_blob_01'] | ['lead_id', 'partner_id'],
  op: 'symmetry'|'tile'|'restyle'|'jitter'|'superpose'|'mask'|'splice'|'morph',
  seed: <uint32>,
  params: { …per-op, clamped to declared spans… } }
```

The variant's id is derived from the recipe alone (`var_` + 16 hex chars of a dual-lane FNV-1a hash over the canonical recipe) — no registry, no counter, no stored table. Anyone holding the recipe can regenerate the asset byte-for-byte; the selfcheck proves it for every op. The generated record inherits the lead parent's category, tags (plus `variant`), and placement dials (weight/density/scale/rotate) — deliberately NOT the lead's baked region mattes or gradient, which describe the lead's own shape and would lie about the variant's.

## Morph's honest compatibility rule

Morph interpolates coordinates, so it is only defined when the two parents' paths are structurally identical: same number of top-level paths, and each path's absolutized command sequence (M/L/C/Q/A/Z…) identical. That signature equality is the whole rule — checked by `morphCompatible`, and `generateVariantSvg` returns null when it fails. In this library the rule yields 17 compatible families (largest: 10 members; the organic blobs are one family). In the demo run below, every morph draw found an incompatible partner and the dealer fell back to superposition — morph dealt 0 of 132. Superposition and mask carry the combine load, exactly as the issue predicted; morph is a small honest subset, not a headline.

The same honesty runs through the dealer: a drawn member whose drawn op cannot apply (a dash restyle on a stroke-less asset, a morph across structures) tries the remaining ops in a fixed rotation and the recipe records the op that actually generated; only when nothing applies does the member stay a plain library asset, counted as a fallback in the report. Demo run: 0 fallbacks in 132 draws. Restyle is the one op with real refusals — its five modes each need something to restyle (a stroke, a fill, a dash), and across the library 83 of 1176 fixed transform probes were mode-inapplicable; the dealer's mode-rotation absorbs that.

## Doctrine held

- **Variant-ness is provenance, not a feature axis.** `FEATURES_VERSION` stays 3. In feature space, quota accounting, and census coverage, a variant stands exactly at its lead parent's coordinates — the miner translates variant ids to leads before featurizing, on both the candidate side and the keep side (`featuresOfKeep`). The suite proves a variant featurizes identically to its lead cast, never as `unknown`, and that every dealt member resolves exactly once under a lead family (no double-counting: the variant replaces the lead in the cast, it never joins it).
- **The library never silently grows.** No code path adds a variant to the asset library or to any pool. A variant exists as a recipe in a record's provenance and as a generated svg inside the explorer's bake — nowhere else. Promotion is a human act (see gaps).
- **Nothing auto-runs; the dice/scorer untouched.** The axis is off unless a run asks for it; no panel, no live-loop change. With no model connected the axis runs seeded — it never needed a model.

## Demo run

`node scripts/exploreRun.mjs --seed 0x1530 --batch 120 --finalists 12 --variants 0.3`
→ `~/workspace/kc-1530-runs/xpl-1530-120-12-var30/` (run.json, REPORT.md, candidates.json, finalists.json, verdicts.jsonl, 12 finalist stills as PNG+SVG).

- 132 cast members drawn for variation at fraction 0.3; **132 dealt, 0 fallbacks**. Ops dealt: superpose ×38, restyle ×20, jitter ×19, splice ×16, symmetry ×15, tile ×13, mask ×11, morph ×0 (see the morph note).
- **10 variant members among the 12 finalists**; every finalist record's provenance carries the matching recipes (10 recipes in finalists.json).
- Variant stills verified on disk: the composed still svg embeds the generated variant svg — e.g. finalist sample 110 carries the exact superpose transform its recipe declares (`rotate(-112) scale(0.578)`, dy 5).
- Spread: finalists 0.6046 vs dice tray 0.3618. Quota: PASS. LOIS: 7 keeps / 5 passes over the 12.

## Verification

- New suite `variants.selfcheck.mjs` (registered in `app/selfcheck.manifest`): replay exactness for all ops, whole-library op domains, morph subset + t=0/t=1 endpoints, jitter tolerance, recipe sanitizer boundary, shelf + ledger round-trip, miner-axis determinism, bake parity for variant finalists, census accounting, features doctrine, crown through KEEP_ADD, tray tag + label. PASS — and re-run PASS on the rebased tree.
- Neighboring suites all pass: miner, prospecting, candidateTray, census, coverage, censusReadout, loisJudge.
- `npm run build`: green (after a local `npm install` in the worktree — the branch initially borrowed a sibling worktree's vite, which failed resolving `@tauri-apps/api`; an environment artifact, not a code failure).
- **Full manifest sweep, branch vs base** (per-suite sequential, never parallel; evidence in `~/workspace/kc-1530-evidence/`; run against the staged stack, base `b07fa9e3`):
  - Branch (402 suites): **400 pass, 2 fail**.
  - Base (401 suites): **398 pass, 3 fail**.
  - Per-suite join: **zero regressions** — no suite that passed on base fails on the branch; the branch adds exactly one suite (402 vs 401), this stage's own.
  - The shared failures are the known sandbox pair, with identical signatures on both sides: `swarmWasm` FAIL(1) ("cargo not found") and `gl/accum` FAIL(134) (V8 OOM abort; branch 81s, base 87s). rollSafety passed solo-in-sweep on both (branch 627s, base 607s).
  - The one base-only failure: `gl/resolverProbe`, a wall-clock p95 perf probe (budget 12 ms) that read 12.547 ms in the base sweep — under load, on the tree with no E5 code in it. Solo re-runs on base: one more failure while the machine was still churning after a restart, then a clean PASS at p95 4.80 ms on a quiet machine (note in the evidence folder). A load flake, running against the branch, not caused by it.
  - Note: both sweeps were interrupted once by sandbox service restarts (branch at suite ~245, base at ~347) and resumed with per-suite verdicts intact; the resumes are marked in the evidence files and each in-flight suite was re-run, since an interrupted run proves nothing.

## Gaps and decisions, named

1. **Live-stage promotion is not built — deliberately.** A crowned variant keep recalls fine at the store level (proven), but the live stage draws from the merged pool of library + custom assets; a variant id is in neither, so a recalled variant keep's variant members do not draw on the live stage (the rest of the look does; nothing crashes — the pool filters pool-side). The issue is explicit: the library never silently grows, and promotion is Matt's manual act. Materializing variant records into the pool at promotion time is the natural follow-up issue; it is NOT in this stage.
2. **The tray wording is VARIANT, not "Davis-made".** The issue says the tray labels variants Davis-made; the shipped product rule (pinned by E3's own suite) is that no artist names appear on product surfaces — the provenance label must not match /davis|haeckel|reas|molnar/i. The card tag and the label segment therefore say VARIANT. The Davis attribution lives where it belongs: in the run report ("VARIANTS (Davis variants, #1530)") and in the recipe provenance itself.
3. **An E3-era data-loss bug found and fixed.** The miner's candidate records write `axes.anchor` into provenance, but `sanitizeProvenance` whitelisted only layout/palette/castSize — so every crowned anchored mined look silently lost its anchor note at the shelf/ledger door. E5's crown round-trip caught it; `sanitizeAxes` now keeps the anchor. One-line, additive, pinned by the new suite's exact-equality crown assert.
4. **The MegaMind expansion section of #1530 is not built** — deferred by the issue itself, untouched here. The engine's offline/seeded contract is the seam it will use.
5. **Restyle coverage note.** Restyle generates only where the drawn mode applies; the dealer's fallback rotation means a member asked to restyle may land as another op (the recipe records the truth). If a future stage wants restyle-pure casts, the dealer needs a mode-first contract — not needed for v1's acceptance.
