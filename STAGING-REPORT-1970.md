# STAGING REPORT — #1970: census.selfcheck fails in CI (stamp assets rasterize with zero ink)

Builder staging record, 2026-11-04. Branch `fix/1970-census-ci-raster`, worktree `~/workspace/kc-1970-build`, base main `45887dde` (includes #1966 at `de9e50b1` + #1968).

## Root cause

The census's reachability check (`renderReachability` in `app/src/curator/censusReport.mjs`) rasterizes each asset twice: a fast sweep with no fonts, and — for any asset the sweep finds blank — a confirmation raster that decides whether the asset is truly dead. That confirmation raster was constructed with resvg's **defaults** (`assetInk(a.svg, {})`), which load the **host's system fonts**. The ten `<text>` stamps (stamp_num_*, stamp_glyph_*, stamp_letter_02, stamp_arrow_01) draw only a glyph, so their census verdict depended on whatever monospace the machine happened to have. This was the one Node asset raster that #1950/#1951 missed when it pinned the bundled font (`app/src/assets/resvgFont.mjs`, DejaVu Sans Mono) for the region bake and the GL atlas after a CI runner image update (ubuntu 20261025 → 20261101) changed the runner's system monospace. On the new image resvg resolves no font for the stamps' `ui-monospace,monospace` families, so the confirmation raster returned zero ink, the ten stamps landed in `assetsUnreached`, and the suite exited 1 on main and on every PR.

## Evidence

- Reproduced the CI condition in the sandbox by denying fontconfig (`FONTCONFIG_FILE=/dev/null`): pre-fix, `node src/curator/census.selfcheck.mjs` exits 1 with `AssertionError: unreached assets: ["stamp_num_04","stamp_num_05","stamp_glyph_01",…,"stamp_arrow_01","stamp_letter_02"]` — exactly the ten pinned font-contingent stamps, matching the CI log line `selfcheck FAILED: node src/curator/census.selfcheck.mjs (exit 1)` from main run 41930248112.
- Same suite in the normal sandbox environment pre-fix: exit 0 (`census.selfcheck: OK`) — the verdict flipped with the machine's fonts, proving the measurement was of the environment, not the code.

## Fix (test/tooling only — zero behavior change to the live instrument)

- `app/src/curator/censusReport.mjs` — the confirmation raster is now the bake's own raster: a named `RASTER_OPTS_BAKE = { font: RESVG_FONT }`, imported from `assets/resvgFont.mjs`, used in `renderReachability`. The fast no-font sweep is unchanged, so "font-contingent" keeps its meaning — blank with no font at all, ink under the instrument's one pinned font — and is now identical on every machine. Comments updated to say so, citing #1970.
- `app/src/curator/census.selfcheck.mjs` — the fast-vs-bake agreement check compared against resvg defaults (`assetInk(a.svg, {})`); it now compares against the bake's actual pinned-font raster (`{ font: RESVG_FONT }`). Path-art sample, pinned sets, and every assertion unchanged.
- `app/src/assets/resvgFont.selfcheck.mjs` — the existing "wired" source guard now also pins the census: censusReport must define `RASTER_OPTS_BAKE = { font: RESVG_FONT }`, must confirm with it, and neither census file may rasterize with resvg defaults again. Suite now reports 4 checks. **No threshold loosened, no expected list padded, no assertion removed, no raster section skipped.**

## Honesty proof (a dead stamp still fails)

With the fix applied and fonts denied, `stamp_num_04`'s glyph was emptied (`>13</text>` → `></text>` in `assets-stamp-radial.js`): the census failed with `AssertionError: unreached assets: ["stamp_num_04"]`, exit 1. The asset file was then restored (`git checkout`), verified clean.

## Verification

- `node src/curator/census.selfcheck.mjs` with `FONTCONFIG_FILE=/dev/null` (CI condition): **exit 0, `census.selfcheck: OK`** — and its full output is identical to the pre-fix normal-environment run except the node PID in a warning line (every measurement bit-identical, incl. the Jell-O line and the pinned font-contingent set of ten).
- `node src/curator/census.selfcheck.mjs` (normal env): OK.
- `node src/assets/resvgFont.selfcheck.mjs`: 4 checks passed.
- Census consumers re-run: `readMeter.selfcheck` exit 0; `readDuel.selfcheck` 30 checks passed.
- `npm run format:check`: all matched files use Prettier code style (after `prettier --write` on the one flagged file).
- `npm run lint`: 0 errors (11 pre-existing warnings).
- `npm run build`: built successfully.
- `npm run selfcheck` (the stop-at-first-failure runner) halts at `swarmWasm.selfcheck` in this sandbox because `cargo` is not installed here (`build-wasm.sh --verify` cannot run) — environmental, before the census in manifest order, unrelated to this change (no Rust/wasm files touched). A continue-on-error pass over the full `app/selfcheck.manifest` (587 suites) was run separately: at commit time it stood at 271+ PASS with the only failures in the sandbox-environment class — `swarmWasm` (no cargo), `rollSafety` (GL target crash), `accum` (SIGABRT in the sandbox GL stack), none of which import the changed files. The final tally follows in a PR comment when the pass completes.
