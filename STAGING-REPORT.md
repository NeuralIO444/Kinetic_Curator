# STAGING REPORT — #1609 Strata Q Phase 3: the fixed skeleton

**Issue (verbatim title):** "Strata Q Phase 3 — the fixed skeleton: 2 content / 1 MATH ≤4 / 1 FX free picks"
**Branch:** `feat/1609-strata-phase3-skeleton`, based on
`origin/feat/1608-strata-phase2-blocks` (41db04c5). Local only — no push,
no PR (coordinator publishes). This file replaces the report that was at
the worktree root (#1608's); that report remains in git history. The
"(DEFERRED)" language in the issue is stale — the lane was un-deferred
2026-10-30 and Phases 0–2 are this branch's base.

**Overruled bullet — NOT built, per the recorded ruling:** the issue
body's field-mod bullet (field→channel moves into MATH) is overruled by
the issue's own comment thread, Matt's 2026-10-16 ruling, and Phase 0's
merged paper: field→channel STAYS in the CHIAROSCURO editor, #1204's home
stands, it is NOT a MATH op, there is NO bottom-stratum retarget. Nothing
in this branch touches the CHIAROSCURO editor, PATCH FIELD, or patch
targets.

## What was built

The shipped #1203 stack (caps 4 content / 4 FX / 4 MATH, per-track FX
family binding by ordinal) is now the fixed skeleton Matt ruled on
2026-10-15 (tracker #1605, D3–D6):

- **CONTENT 4→2, locked (D3).** `MAX_CONTENT_TRACKS = 2` in the slice and
  its projectNormalize mirror. ADD/DUP gate on the KC-track count. A Look
  with 3–4 content strata loads as its first 2 — and the trim is **said
  out loud** (next section).
- **PATTERN beneath (D4).** Pattern strata no longer spend the content
  cap anywhere: not in the slice's ADD gate (now the document bound,
  `MAX_LAYERS` = 16), not in DUP, not in normalizeLayers, not in the
  chaos-birth gate in patternRoll (was content-count, now total < 16 —
  otherwise a full double exposure would starve ground birth forever).
  The stack header names ground apart: `· GROUND n` when patterns exist.
- **MATH 4 tracks → 1 layer, chains ≤ 4 ops (D5).** `MAX_MATH_TRACKS = 1`;
  new `MAX_MATH_OPS = 4` in mathFilters.js. mathEffectAdd refuses a 5th
  op; MathEffectEditor swaps its add row for a "chain full — 4 ops" note
  at the cap. Extra tracks and over-long chains trim on load, spoken.
- **FX 4 tracks → 1 layer of any 4 kinds (D6).** `MAX_FX_TRACKS = 1`; new
  `MAX_FX_EFFECTS = 4` in fxFilters.js. The per-track family binding is
  dead: `availableFxKinds` now offers every live kind not already in the
  layer (rack order kept), and the editor renders one tile per effect in
  the layer plus one add row. `sanitizeFxEffects`' grain-last invariant
  is untouched, so the **CRT recipe (Scanlines + Halo + Grain + RGB
  Split) is buildable in one FX layer** — pinned in fxFilters.selfcheck.
  The add chooser for a fresh layer offers the whole add-menu
  (FX_MENU_KINDS) under the label "FX · FREE PICKS". Last-used replay is
  now ordinal-free: a menu-kind pick arms the layer; one-tap replays the
  last-used menu kind.
- **The header reads the fixed form.** The LAYERS panel subtitle is no
  longer `n / 12 strata`; it reads
  `CONTENT k/2 · MATH m/1 · FX f/1` (+ ` · GROUND p` when patterns
  exist), from the live counts.
- **Fold invariants hold.** layerOrder.js is untouched; its suite is
  re-pinned to the skeleton (below) and green: content never crosses the
  adjustment line, FX never crosses MATH, in load migration, in the
  scene contract, and in the store's trade guards.

## How trim-on-load speaks

The load receipt already existed (`loadedMessage` in
panels/pipeline/pipelineNotices.mjs, shown by DataExportRow on project
open) — no new notification system was built. The smallest honest
channel, wired through it:

1. `normalizeLayers` (state/projectNormalize.js) now returns `trims`:
   name strings in document order — `content stratum "Gamma"`,
   `FX track "FX2"`, `MATH track "M2"`, and for in-layer surplus
   `FX effects Solarize (from "F1")` / `MATH ops Threshold (from "M1")`
   (catalog labels). The FX cap reads the **stored** order (first 4
   valid kinds stay — the same first-N rule as strata and chains); only
   then does the sanitizer clamp and re-seat grain last inside the kept
   set, so an early-stored grain is never the effect dropped.
2. `parseProject` (both branches) attaches `doc.layerTrims` **only when
   non-empty** — a clean load's doc is byte-identical to before.
3. `loadedMessage` appends ` · trimmed to the fixed skeleton: <names>`
   when the doc carries them.
4. Boot/autosave/recipe loads have no receipt surface; for those, the
   trim also fires a `console.warn` in normalizeLayers in the existing
   #1048 style (`[normalize] strata trimmed to the fixed skeleton
   (#1609): … — save the project to persist the trim`). Voice/recipe
   stacks funnel through the same normalizeLayers, so their trims are
   spoken the same way (their expandos don't surface a receipt — the
   console line is the record there, as with #1048's fold before it).

## Design decisions (recorded, all reversible in one place)

- **One instance per kind per FX layer.** A kind already in the layer is
  not offered again (every prior UI assumed this). Enforced by
  availableFxKinds; fxEffectAdd refuses duplicates.
- **Insert order kept.** fxEffectInsertIndex's slot-order insertion is
  unchanged: pick order is free, render order stays canonical, and the
  grain-last pass invariant is preserved regardless.
- **Skeleton constants live where their kin already lived:** track caps
  in layersSlice (with projectNormalize's pre-existing duplicated
  mirrors updated per the #456 cycle rule, plus new MAX_FX_TRACKS /
  MAX_MATH_TRACKS mirrors), MAX_FX_EFFECTS in fxFilters.js, MAX_MATH_OPS
  in mathFilters.js, MAX_LAYERS reused from projectNormalize.
- **FX chooser vs editor offers.** Arming a fresh layer offers the
  curated add-menu (8 kinds, the #310/#704 curation); the in-layer add
  row offers all live kinds not present (14). The EF-4 stub note
  ("planned: dither, stipple") is preserved under the editor as
  Phase 4's signpost.
- **MATH DUP joins the capped buttons.** LayerStack's dupCapped now
  covers MATH (the #1015 comment scoped MATH out when its DUP could
  still succeed; at one layer it cannot, so the button reads the cap
  like the others). PATTERN's DUP gates on the document bound.
- **fxTrack.js's binding helpers stay as a historical record** (header
  rewritten; `rackSlotForKind` added for tile faces). kindsForFxOrdinal
  has no remaining callers; FX_RACK itself remains the kind→family
  catalog for tiles, insert order, and the grain split.

## Premise verification (checked against the tree before building)

- Shipped #1203 shape confirmed: caps were 4/4/4 in layersSlice; header
  subtitle was `${stackSize} / ${strataCap} strata` (cap 12); PATTERN
  counted toward the content cap in slice, normalize, and pins.
- Load path confirmed: normalizeLayers silently skipped overflow; no
  FX/MATH track caps, no chain cap, no effect cap on load; the load
  receipt existed (above). Boot loads have no receipt — precedent for
  spoken-via-console is #1048's fold warning inside the same function.
- One-writer files (liveLoop.mjs / liveResolve.mjs / particles.js) were
  NOT needed and NOT touched. liveResolve's defensive MAX_TRACKS is its
  own constant and already tolerates the skeleton.
- Census: the curator census suite pins no track counts; it passes
  unmodified. The layers-census acceptance is the layerOrder +
  layers-family suites, re-pinned below.

## Re-pins — every one, with its cause

Cause key: **[D3]** content 4→2 · **[D4]** pattern leaves the count ·
**[D5]** MATH 1 layer / ≤4 ops · **[D6]** FX 1 layer / free picks ·
**[HDR]** header reads the fixed form. No golden hashes were weakened;
no re-pin touches a value the skeleton law did not itself change.

Selfchecks:

- `fx/fxFilters.selfcheck.mjs` — [D6] "filled slot removed from
  offer-list" → only the present kind leaves the list, slot-mates stay;
  "all slots filled returns empty" → the full-layer (4 effects) case;
  NEW pin: the CRT recipe stays on offer step by step until all four
  kinds are in. Slice tests: FX DUP deep-clone test → DUP refuses at
  the cap (the clone branch is unreachable for FX now); CRUD test: the
  #520 slot rejection of tear-after-rgbSplit → accepted under free
  picks, duplicate-kind add is the surviving refusal. 51 cases green.
- `state/patternTrack.selfcheck.mjs` — [D4] "the content cap counts
  PATTERN tracks (4 total)" → ground grows to the document bound while
  KC adds gate on their own cap; normalize pin → five patterns survive
  beside a KC track with zero trims; one test title drops its stale
  cap clause (no assertion change). 17 green.
- `state/projectDocument.selfcheck.mjs` — [D6] the #103 hostile-doc pin
  ("FX layers aren't subject to a per-type cap") inverted by the law:
  200 FX tracks now parse to 1 content + 1 FX with 199 named trims;
  #456 section header updated (cap is 2). NEW #1609 block: the
  acceptance cases — legacy 4-content Look loads as its first 2 with
  `layerTrims` naming Gamma/Delta; clean load carries no layerTrims;
  MATH track + chain trims named; FX effects trim named with grain
  still last. Green.
- `state/layerOrder.selfcheck.mjs` — [D6] load-migration fixture made
  skeleton-legal (1 FX / 1 MATH); NEW pin: the old two-FX fixture loads
  folded AND trimmed, both announced (one #1048 warn, one #1609 warn).
  Store adds: second FX/MATH adds refuse at the caps. Trade-guard test
  now seeds its 2-FX/2-MATH state directly (creation caps can't build
  it; the guards must hold for any state — the suite's charter). DUP
  test: both dups refuse at the caps, order holds. Scene-contract test:
  two adjustment wraps, not three (f2 trimmed). 12 green.
- `state/layersPlusPattern.selfcheck.mjs` — rewritten choreography:
  the #1014 last-used flows re-staged inside the caps (remove-to-make-
  room), with NEW refusal pins (third content ADD, second FX ADD, FX
  DUP). The FX half's premise (per-ordinal family binding, cross-family
  fallback, ordinal replay) is dead law [D6]; replaced by the live
  semantics: menu pick arms any family, non-menu pick is a one-tap,
  replay is ordinal-free. layoutSlice isolation pin unchanged. Green.
- `state/feedsAccumSurface.selfcheck.mjs` — [D3] the content-DUP test
  moves to a one-content world (the shared world is already at cap;
  the property — a duplicate inherits the flag — is unchanged);
  normalize-edges: the content false-survivor gets its own doc (as a
  third content stratum it would trim before its flag could be read).
  12 cases green.
- `gl/wetSoak.selfcheck.mjs` — [D3] same DUP re-stage as
  feedsAccumSurface (one-content world; fixture restored after;
  round-trip assertions unchanged in substance). 31 green.
- `pattern/patternRoll.selfcheck.mjs` — [D4] the "at the 4-track cap
  nothing is added" fixture → a full document (16 layers) adds nothing,
  and a NEW positive pin: a full double exposure (2 content) still
  births its ground. 7 green.
- `panels/pipeline/pipelineNotices.selfcheck.mjs` — NEW pin: the
  receipt names the trimmed strata; silence when clean or empty. 10
  green.

E2E (CI's e2e-smoke job is authoritative; both re-pinned specs also
pass in this sandbox):

- `e2e/fx-row-opens-editor.spec.js` — [D6] two-FX choreography
  re-staged: the block boots unselected from a restored project so the
  header tap is what opens the editor; visibility/wet-readout
  independence kept; DUP now asserted disabled at the cap ("Track cap
  reached") instead of minting a third block; remove leaves KC
  untouched; the KC↔KC section is unchanged (2 content is legal [D3]).
  Passes in-sandbox (31s).
- `e2e/fx-editor-size.spec.js` — [D6] the four-track measurement loop
  re-staged on the one layer: empty-layer add row measured, then every
  catalogue kind (14) added/measured/removed one tile at a time; the
  measure helper now unions the editor's children (tiles + add row +
  notes) instead of one tile's children. PAD unchanged. Passes
  in-sandbox (23s).

## Suite results

- Build: `npm run build` green. Lint: 0 errors (11 warnings, all in
  files this branch does not touch). `npm run format:check`: clean
  (prettier --write applied to touched code files only; no docs).
- Full manifest sweep (545 lines; chromium installed first): segment 1
  (through line 85) all-pass until swarmWasm; remainder run to
  completion — 460 commands, 4 failures, all adjudicated:
  - `swarmWasm` — fails identically on the pristine Phase 2 base
    (sandbox has no cargo). Environmental.
  - `rollSafety` — fails identically on the pristine Phase 2 base
    (exit 1, re-run on base this session). Environmental.
  - `phase6` — failed once inside the long sweep; passes standalone on
    this tree (exit 0, full OK line). Load flake, not a code failure.
  - kineticSweep did not fail in either sweep run.
  - `wetSoak`, `patternRoll` — mine; re-pinned above, green.
  - accum ran solo inside the sweep with
    NODE_OPTIONS=--max-old-space-size=3072 — passed at full count.
- E2E spot-checks in-sandbox: fx-row-opens-editor PASS, fx-editor-size
  PASS (both re-pinned). pattern-track and poisoned-project (×2) fail
  in-sandbox and fail **identically on the pristine Phase 2 base**
  (ERR_TUNNEL_CONNECTION_FAILED — the sandbox proxy blocks a resource
  the specs await); not this branch's failures. The hostile-200 spec's
  assertions were read by eye against the skeleton: 200 content layers
  trim to 2, trims speak via console.warn (the spec only fails on
  console *errors*), canvas renders — CI-safe. The rest of e2e is
  CI-authoritative, as in Phases 1–2.
- Source-shape pins: selfchecks were grepped for every touched file
  name; all suites naming them ran in the sweep (layerRows,
  foldInCensus, efRackTile, trackNumeral, casingInCss, helpCopy,
  blockStops 10/10, modeStops 11/11, census — all green unmodified).

## Not done / notes for the coordinator

- MixBar was Phase 2's stop, not this phase's; untouched.
- Phase 4 (#1610, EF-4 dither kind) is the remaining Strata Q phase;
  the "planned: dither, stipple" note still stands in the FX editor.
- The strata-quantized paper (plan.md/amendment.md) was NOT updated by
  this phase — Phase 0's paper already describes the skeleton as ruled;
  no doc claims needed correction.
