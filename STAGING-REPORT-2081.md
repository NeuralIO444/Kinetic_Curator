# STAGING REPORT — #2081: DEV panel fails to load in tauri dev (@resvg via megamindSurfacesLive → censusReport)

Branch: `fix/dev-panel-resvg` (local only — coordinator publishes). Base: `ab921af6` (origin/main).

## What changed

1. **`app/src/curator/tasteHead.js`** — `tasteAgreement` and its private helper `rankAuc` moved here verbatim (function body byte-identical; only the section header comment gained a "Housed in tasteHead.js since #2081" paragraph explaining the move, and one comment now reads "scoreLayout" instead of "tasteHead.scoreLayout").
2. **`app/src/curator/censusReport.mjs`** — the function and `rankAuc` are removed. Its now-unused value import of `{ scoreLayout, headUsable, XGB_HEAD_KIND }` from tasteHead.js is replaced by `export { tasteAgreement } from './tasteHead.js';`, so every existing Node-side consumer keeps its import: census.selfcheck.mjs (which imports `tasteAgreement` from censusReport) runs unmodified and green. `formatTasteAgreement` and the entire Node-side census/bake surface stay exactly where they were.
3. **`app/src/curator/megamindSurfacesLive.js`** — `tasteAgreement` now comes from the existing `./tasteHead.js` import (merged into the `getDavisCitation / setDavisReasonProse` line); the `./censusReport.mjs` import is gone. One header comment updated to name the new home.
4. **`app/src/composition/panelGraph.selfcheck.mjs`** (new) + one line in `app/selfcheck.manifest` — the regression pin (below).

Zero behaviour change: same function, same outputs, same surfaces. No change to PanelRegistry or the `import.meta.env.DEV` gate. No other module moves.

## Why tasteHead.js is the home (and not censusReadout.mjs)

The issue named `censusReadout.mjs` as the candidate, with an explicit escape: if its rules forbid the function, choose another light module and say why. They do, twice over:

- censusReadout's header law is that it is "A READOUT, not a measurement surface… nothing here measures anything… it cannot compute a different answer", and its own `agreementView` doc repeats "nothing recomputed (this module's law)". `tasteAgreement` computes fresh head scores and a Mann–Whitney AUC over ledger rows — that is a measurement, not a reshape. Housing it there would break the module's documented discipline.
- `tasteHead.js` is the function's natural light home: it already owns all three of the function's dependencies (`scoreLayout`, `headUsable`, `XGB_HEAD_KIND`), so the moved function needs **zero new imports**; it is already browser-side ("the app side of Taste v1. Pure (no store, no DOM)"), already imported by megamindSurfacesLive.js itself, and already hosts the sibling pure readouts over taste + ledger (`tasteSummary`, `loisSummary`, `retrainNudge`). Same pattern as S3's `surfaceRecord` move into megamindVoice.mjs (PR #2080): the pure function goes to the light module that owns its dependencies.

## The regression pin

`panelGraph.selfcheck.mjs` walks the static import graph (static imports, `export … from`, dynamic `import()`, `require`) from three roots — `PanelRegistry.js`, `DevPanel.jsx`, `MegaMindPanel.jsx` — and asserts:

- **A.** none of the forbidden set is reachable: the bare specifier `@resvg/resvg-js`, and the files `src/curator/censusReport.mjs`, `src/assets/assetTraitsBake.mjs`, `src/assets/regionBake.mjs`;
- **B.** the walk is not vacuous — the MegaMind chain (DevPanel, devTabs, MegaMindPanel, megamindSurfacesLive, megamindVisionLive, tasteHead) IS reached, and the walk visits >100 modules (actual: 634);
- **C.** `megamindSurfacesLive.js` carries no direct `censusReport.mjs` import (the original chain, pinned by name).

Fail-closed: an unresolvable relative import fails the suite rather than pruning the walk. Specifier extraction uses the purity.selfcheck.mjs SPEC_RE shape over comment-stripped source (strings kept — specifiers live in strings); violations name the full import chain from a root.

**Negative test:** the pin was run against a pre-fix tree (main `ab921af6`): it FAILS with `src/curator/censusReport.mjs imports forbidden Node-only package '@resvg/resvg-js'`. On this branch it passes.

## Verification (all run on this branch)

### Suites — grep sweep first, then every implicated suite

Grepped ALL of `app/src` (every selfcheck), `app/e2e`, `app/scripts`, `app/qa` for `tasteAgreement` / `censusReport`. Consumers found: census.selfcheck (imports tasteAgreement from censusReport — covered by the re-export), readMeter/readDuel (censusReport), resvgFont (source-pins censusReport), five engine suites importing `place` from censusReport (glassBody, materialParams, plateBody, stippleBody, washBody), megamindVoice/mind/directorRoom (import megamindSurfacesLive), shelfCensus/readMeter (censusReadout), four tasteHead importers (chapterMemory, coverage, dice, queenChannel). e2e: no hits. app/scripts/censusSnapshot.mjs imports `paramCensus`/`renderReachability` from censusReport — untouched exports.

23 suites run, **23 PASS**, including every task-named minimum:

- census ✓ · censusReadout ✓ · readMeter ✓ · readDuel (30 checks) ✓ · resvgFont (6 checks) ✓
- tasteHead ✓ · chapterMemory ✓ · coverage ✓ · dice ✓ · queenChannel ✓
- megamindVoice (17) ✓ · megamindVision (16) ✓ · megamindLink (21) ✓ · directorRoom (7) ✓ · mind (15) ✓
- devPanel ✓ · panelGraph (new) ✓ · shelfCensus ✓
- glassBody ✓ · materialParams ✓ · plateBody ✓ · stippleBody ✓ · washBody ✓

**Node-side census bake path (step 5 of the brief): intact.** census, readMeter, readDuel, resvgFont and the five `place`-consuming engine suites all pass against the edited censusReport.mjs; the Resvg imports and bake functions in censusReport.mjs were not touched, and `formatTasteAgreement` still sits beside its (now re-exported) subject.

### Lint / format / build

- `npm run lint` — 0 errors, 11 warnings (the standing pre-existing set; same count as main).
- `npm run format:check` — green (the new selfcheck was prettier-formatted; the pin re-verified after formatting).
- `npm run build` — green, **752 modules transformed — identical to main (`ab921af6`)**. Expected: the move adds and removes no module from the production graph (no file created or deleted on the browser side; `tasteAgreement` moved between `censusReport.mjs`, which was never in the browser graph, and `tasteHead.js`, which already was).

### Dev-server smoke (the dev-mode proof)

Sandbox Chromium cannot launch ("Hatch WebGL domain policy is required for browser startup"), so the dev-mode proof is server-side, in two halves:

- **Fixed tree:** Vite dev server started from `app/` (`node node_modules/vite/bin/vite.js`, Tauri env set so base matches `tauri dev`). A crawl of the DevPanel / MegaMindPanel / devTabs module URLs, following transformed imports 3 levels deep, fetched **146 module URLs — all HTTP 200, zero failures**. The whole MegaMind chain served: DevPanel.jsx 200, MegaMindPanel.jsx 200, megamindSurfacesLive.js 200, megamindVisionLive.js 200, tasteHead.js 200, censusReadout.mjs 200. **No forbidden module was ever served** (no censusReport, regionBake, assetTraitsBake, or resvg URL). Server log: 6 lines, **zero `UNLOADABLE_DEPENDENCY`, zero dependency-optimization errors, zero 500s**. Server killed afterwards.
- **Contrast (pre-fix tree, same requests):** the log reproduces Matt's exact failure — `[UNLOADABLE_DEPENDENCY] Could not load node_modules/@resvg/resvg-js-…/resvgjs.…node — stream did not contain valid UTF-8 in node_modules/@resvg/resvg-js/js-binding.js` (linux variants in the sandbox; darwin-arm64 on his Studio). The smoke therefore exercises the real failing path, and on this branch that path is clean.

### Other static paths?

None found. The graph walk covers the full panel graph (634 modules) with zero forbidden reaches and zero unresolved imports — the SurfacesLive chain was the only route. (`gl/atlas.mjs` also imports regionBake, but atlas is itself a Node-only bake tool and is not reachable from the panel roots; the walk proves it.)

## Left open

- On-device acceptance on Matt's Studio, per the issue: `tauri dev` → DEV → MEGAMIND loads, then the S1 connect flow against the House model `qwen3-vl:8b-instruct`. That run is Matt's (scheduled for tomorrow); nothing in this branch can substitute for it.
- Nothing else. Issue #2077 (release-build DEV door) is untouched and still the separate follow-on it was.
