# STAGING REPORT — #1527 MegaMind S3: LOIS vision (E4 render judging, E5 offspring pre-judging, stage description)

Branch `megamind-s3`, based on main `e7c70a0f` (S1 #1525 + S2 #1526 landed). Built locally only —
nothing pushed, no PR, nothing posted. Issue read whole (body + all comments) before coding; the
2026-11-10 scope ruling controls: **S3 lands WITHOUT the loot surface** (it rides #1479, parked).

## 1. What was built, per surface

**New pure core — `app/src/curator/megamindVision.mjs`.** The fixed verdict schema (four coarse
readings mirroring loisJudge's four critic gates one-for-one: presence `empty|sparse|balanced|wall`,
contrast `flat|present|strong`, exposure `crushed|even|blown`, promise `kept|broken|na`, plus an
optional line), the request builders, the validators, and the judge-ledger row builder. The verdict
is **computed by KC-1's gates over the model's readings** (`visionVerdictFromReadings`), never taken
from the model's word — the same shape as lois-render-v1 computing its verdict from measured stats.
A reply that is malformed, off-schema, or carries CJK anywhere is discarded whole.

**New live driver — `app/src/curator/megamindVisionLive.js`.** The megamindSurfacesLive idiom:
owns image bytes, SHA-256 hashing (crypto.subtle), canvas copies, storage, and the wall clock
(injectable `stamp` seam; eslint determinism allowlist entry added with its reason, mirroring
megamindLive's). Asks go through S2's surface chat (`askSurfaceText` → `buildSurfaceBody`: House
num_ctx/keep_alive pins, temperature 0, think off where controllable), extended so the user message
carries one base64 image (Ollama `/api/chat` `images`). One re-ask on a discarded reply, then the
card/panel carries the failure. The driver subscribes to **no bus event** and fires nothing by
itself — creation asks nothing (pinned by selfcheck).

**E4 render judging + E5 offspring pre-judging — the CandidateTray** (`app/src/panels/davis/CandidateTray.jsx`).
`runMiner` untouched (pure, deterministic; no network anywhere near it). After a run folder loads,
a deliberate **"judge stills — LOIS vision"** press sends each finalist's still — the exact File
bytes the card displays (the tray now keeps the File beside its object URL) — to the vision judge,
in order, card by card, with a progress readout. Variant cards are judged by the same press and are
**the E5 pre-judging surface**: labelled "LOIS vision pre-judgement (E5)" on the card, and accrued
in the judge ledger with `kind: 'variant'` (plain finalists: E4, `kind: 'render'`). The vision
verdict renders on the card **before crown/pass, alongside — never replacing — the bake-time rules
verdict** (the card now also shows the rules verdict line from `record.loisVerdict`, which it
previously only carried silently into the crown). Vision verdicts steer nothing: no reordering, no
auto-crown/pass, no selection change; crown/pass code paths untouched.

**Stage description — the MEGAMIND tab** (`app/src/panels/MegaMindPanel.jsx`, MegaMind's ruled
dev-panel-first home). A **"describe the stage"** press: the driver asks the registered frame
provider for the current frame, hashes it, sends a capped copy, validates the reply, and prints the
description with its provenance line (model + frame sha256 prefix). **"speak it"** is a second,
separate deliberate press (platform speech synthesis), off by default, never automatic. No provider
or an empty capture is the honest **"no frame"** state — no description is fabricated.

**The frame-provider seam — `app/src/App.jsx`.** App registers a provider wrapping the existing
capture path: `captureStill({ loopRef: glLoopRef, resolution: 1, downloadFile: false })` — the exact
frame the instrument shows, from the existing still path, no store reaching. Registration only;
nothing captures until the press.

## 2. Gates (capability, never names; local only)

Read through the surfaces' standing law (`surfaceRecord` from megamindSurfacesLive: the record must
pass the registry's own validation and carry no cloud badge):

- `lois.vision` (registry: vision badge **and tier B or better**) gates judging. Tier C refuses,
  no badge refuses, a cloud-badged record refuses, no record refuses — each refusal lands on the
  card as its reason, and the model is never asked (all pinned by selfcheck with fetch counting).
- `stage.describe` (registry: vision badge) gates description; tier C + badge suffices (pinned).

## 3. Stills = live, and the hash binding

- Tray: the judged bytes are the run-folder file's bytes, read from the same `File` the card's
  `<img>` displays. Where run.json recorded the still's hash (exploreRun writes `stillSha256` +
  `bakeFingerprint` per sample), the driver **recomputes SHA-256 over the loaded bytes and refuses
  the card before any ask if they differ** — a swapped or corrupted still is never judged under the
  run's name. Older folders without a stills index judge on the computed hash alone.
- Stage: the described bytes are the capture's PNG bytes; the panel prints the frame's sha256.
- The model receives the **exact bytes** when they are a raster inside the cap; otherwise a copy with
  the longest side capped at **1280** (`VISION_IMAGE_MAX_SIDE` — the House frame-cost research:
  ≈1,600 prompt tokens at 1280). An SVG still is rasterized (a vision model cannot read vector
  text). The ledger row's `still.sent` block records format/width/height/downscaled/rasterized —
  **the hash always names the source bytes, never the copy**.

## 4. The judge ledger (the 2026-10-15 hook amendment)

Verdicts accrue in a **separate judge ledger**: localStorage key `kc:ledger:judge:v1` (JSONL),
mirrored to `$APPDATA/ledgers/judge.jsonl` in the desktop shell (tasteLedger's pattern), exported
from the tray as `judge.jsonl` beside a live count — inspectable from the surface where the
verdicts appear; no new panel. Registered in `bundle.js`'s `BUNDLE_LEFT_OUT` with its reason (a
restored bundle must never rewrite it), which `bundleKeys.selfcheck` requires of every new key.

Row shape (`visionLedgerRow`): `judge: 'lois-vision-v1'`, `kind: 'render'|'variant'`, the computed
verdict + readings + line, the candidate's **recipe** in loisVerdictRow's shape
(`{ layoutParams, paletteId, assets }` from the record's config), seed/run/provenance, the still
binding (§3), the **judge model name**, an `at` stamp (a press is a real moment), and the **T2
stamps**: `tasteVersion` + `headKind` read from the loaded taste exactly as the dice crown reads
them (useDiceRoll's orderMeta) — **both null when no taste is loaded** (absent stays absent).
`isJudgeLedgerRow` additionally requires the verdict to agree with the gates over its own readings.

**Not training labels, proven, not just promised:** a judge row **fails `tasteLedger.isLedgerRow`**
and `parseLedger` skips it (both asserted in the new suite) — no keeps/passes reader can ingest it.
Nothing in this stage writes keeps/passes, crowns, or taste.json; nothing trains, distils, or ships
a head. Whether these rows ever graduate into a retrain is a future ruling, per the amendment.

## 5. Apple vision — UNMEASURED, probe specified, nothing claimed

No Swift/Rust was written and **Apple vision does not work in this build** — the helper only
compiles on Matt's Mac, and the 2026-11-10 coordinator comment on #1527 requires the on-device
probe before any frame-path design. The vision core is backend-neutral (messages + one base64
image in; the validated record shape of §1 out), and the driver's record gate is the single seam an
Apple provider would join — after measurement. There is deliberately no code path that constructs
an unmeasured Apple capability record.

**The probe the coordinator runs with Matt first** (S1 measure-first pattern; helper session pack
beside the #2068/#2072 packs):

1. **Build variant:** confirm which kc-mind helper variant the session builds (the standing trap:
   `src-tauri/build.rs` → `helpers/kc-mind/build.sh`; verify the bundled helper is the one just
   built, not a stale copy) on a DEBUG/dev build of the desktop app from current main.
2. **OS + capability:** record the Studio's macOS version (About This Mac). In a probe session,
   ask the helper to report: does the Foundation Models model's availability report a `.vision`
   capability present on this OS? (Expected: OS 27 cycle only; a pre-27 machine answers "absent"
   and Apple vision stays dark — that is a result, not a failure.)
3. **Context:** report the session's `contextSize` (4,096-era vs 8,192-era wall — the 2026-11-10
   session overflowed at 4,564 tokens, so this also re-confirms which era the machine is in).
4. **Frame cost:** attach (a) a real 1000×700 stage frame PNG and (b) its 1280-capped copy;
   record prompt-token cost and wall-clock latency for each, three runs each, model warm.
5. **Known-answer sanity verdict:** show the helper one mined still whose bake-time rules verdict
   and render stats are already recorded (from an exploreRun folder), ask for the S3 readings
   schema, and check the reply parses into the schema and its readings do not contradict the
   measured stats (e.g. presence vs inkCoverage band). One frame, by eye, recorded verbatim.
6. **Record, then decide:** the probe's numbers go on #1527 as a comment (the S1 pattern: the
   measured record is what later enables). Only a measured record — vision present, frame cost
   inside the context with the schema prompt, sane readings — earns an Apple capability record;
   the ordering for sight is then Ollama VL → Apple vision where present → rules blind.

## 6. Files changed

New:

- `app/src/curator/megamindVision.mjs` — the pure vision core (schema, gates, asks, validators, ledger rows).
- `app/src/curator/megamindVisionLive.js` — the live driver (bytes, hashing, copies, ledger storage, frame seam).
- `app/src/curator/megamindVision.selfcheck.mjs` — the new suite (16 checks), registered in the manifest.

Modified:

- `app/src/panels/davis/CandidateTray.jsx` — still Files kept; judge-stills press; vision + rules verdict lines; judge-ledger count + export.
- `app/src/panels/MegaMindPanel.jsx` — the S3 vision section (describe the stage; speak it; gate states).
- `app/src/App.jsx` — the frame-provider registration (one import, one effect).
- `app/src/state/bundle.js` — `kc:ledger:judge:v1` in BUNDLE_LEFT_OUT with its reason.
- `app/eslint-rules/determinism-allowlist.mjs` — the vision driver's stamp seam, exact-count 1, with reason.
- `app/selfcheck.manifest` — the new suite's line.

Untouched by design: miner.mjs / runMiner, loisJudge.mjs, the taste ledgers, taste.json, the event
registry (the driver adds no bus subscriptions, so no handler lists move), the bake path, miner
selection, and the rules judge's verdicts.

## 7. Verification

- **New suite:** megamindVision 16/16 — gates truth table, validator discard paths (off-schema,
  CJK, overlong), ask shape (image on the user message; language pinned; promise facts; the rules
  verdict never enters the prompt), capability gates incl. cloud/tier-C refusals with fetch counts,
  ledger stamps + hash binding + `isLedgerRow` rejection, driver happy path / re-ask / hash-refusal
  / no-frame honesty, and source pins for the tray/panel/App/bundle wiring.
- **Family (all green):** megamindLink 21 · megamindVoice 17 · megamindVision 16 · mind 15 ·
  mindConduct 24 · trioLive 23 · fieldReviewVoice 34 · eventRegistry ok (175 events) · devPanel ok ·
  census OK · tasteHead OK · curate ok · dice OK · loisJudge OK · candidateTray PASS · variants PASS ·
  prospecting OK · miner OK · directorRoom 7 · bundleKeys 5.
- **Who-acts sweep:** grepped all selfchecks + `e2e/` for what this change touches — registry
  handler pins (none move: no new bus subscriptions), storage keys (bundleKeys decision added),
  tray source pins in candidateTray/variants suites (all `includes`-style; preserved), component
  text scans (no new names leak), determinism lint (allowlist entry). Dice-driven suites assert on
  state this change does not mutate (no bus events, no counters, no ledger writes outside the new
  key); the family above ran after the final edit and after prettier.
- **lint:** 0 errors (11 pre-existing warnings, unchanged).
- **format:check:** green (four touched files prettier-formatted; the npm-install license-field
  churn in `app/package-lock.json` was reverted — not part of this change).
- **Full manifest sweep:** **653 pass / 4 fail** (657 commands, continue-on-error loop). The four
  failures, each proven against a fresh detached worktree at origin/main `e7c70a0f`:
  - `swarmWasm`, `rollSafety`, `accum` — **fail identically on base** (the standing sandbox set).
  - `liveLoop.dishFluid` — passes on base; in this tree it fails only because the suite shells out
    to `npm run build` ("Command failed: npm run build" + the rolldown error below) — it is the
    build flake surfacing through the suite, not a dish-fluid regression (no gl/ file is touched).
- **build:** `npm run build` **could not be obtained in this sandbox** — blocked by the known
  fleet-wide @resvg cache/read corruption (AGENTS.md, 2026-11-10): rolldown fails with
  `UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8 in @resvg/resvg-js/js-binding.js`
  while loading the native bindings. Evidence gathered before calling it environmental:
  (a) all @resvg package bytes are md5-identical between this tree and base; (b) a fresh detached
  base worktree builds — intermittently (it also failed there, and a fresh base install at a fresh
  path failed twice); (c) this tree's graph deterministically trips the bad read in the sandbox
  (interleaved A/B: base 3/3 OK, this tree 3/3 FAIL at their own paths; bisection exonerates every
  individual hunk — an import-only tray builds; the failure needs the composed graph, i.e. it is
  read-pattern sensitivity of the corrupt cache, not a code defect); (d) the S3 diff contains no
  dependency, config, or native-import change — only ordinary in-repo ES imports, and node loads
  every module in the graph across the 657-suite sweep. **CI's lint-build-selfcheck job is the
  authoritative build verdict for this branch**, per the standing sandbox doctrine; the publish
  ritual should re-run `npm run build` wherever the cache is healthy and expect green.

## 8. Cut or blocked

- **Loot ingest / library classification (#1479):** cut by Matt's 2026-11-10 ruling — joins when
  #1479 builds. Not stubbed.
- **Embeddings (#1528), replay recaps (#1529):** untouched follow-ons.
- **Apple vision transport:** blocked on the §5 on-device probe (needs Matt's Mac; the helper only
  compiles there). Seam + probe specified; nothing claimed.
- **Speech:** printed description is the shipped half; speaking exists only as the second deliberate
  press via the platform speech API.

## 9. Coordinator fix round (QA round 1 NOTE-1)

QA round 1 returned CLEAN with one NOTE: the ledger's `still.sent.format` was hardcoded `'png'`
and `prepareImageCopy`'s exact-bytes path did the same — true for every shipped surface (run
stills are PNG/SVG, stage captures are PNG, and the canvas copy path genuinely encodes PNG), but
a hypothetical non-PNG raster under the cap would have been misdescribed in its own provenance
record. Fixed at the source: the exact-bytes path now reports the source mime's format, the
canvas path still reports `'png'` (it encodes PNG), and `visionLedgerRow` passes the prepared
`sent.format` through instead of hardcoding it. Behaviour is unchanged for every reachable input;
the megamindVision suite and lint were re-run after the fix.
