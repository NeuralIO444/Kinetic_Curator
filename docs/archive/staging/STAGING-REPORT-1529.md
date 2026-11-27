# STAGING REPORT — #1529 MegaMind follow-on: replay recaps (#1461) + retro-capture summaries (#1367)

Branch `megamind-recaps`, based on main `e257d8ab`. Built locally only — nothing pushed, no PR,
nothing posted. Issue read whole (body + all comments) before coding; the 2026-10-15 hook comment
controls the grounding design (narrate from the records' own stamps and reasons; where a record
predates them, say so). Matt un-deferred the issue 2026-11-11 ("build out 1–4, then I test it all");
S2 (#1526) has landed, so the stated dependency holds.

## 1. What was built, and where

**New pure core — `app/src/curator/megamindRecap.mjs`.** The recap engine, in the S2/S3
core/live split. Three steps, each separately checkable (see §2):

- `takeFacts(perf, { from, to })` — every fact a take's log supports, in frame order, each stamped
  from the log itself: bars rebuilt from the take's clock section (`clockRecord.rebuildBars` over
  the input log's loop times), seconds from the frame count at the strip's nominal clock. Sources:
  the input log (palette moves, seed re-deals, layer changes, held frames ≥ 1 s, governor sheds),
  the clock section (BPM changes), the mind section (LOIS's NOD/BURN/CUT and Davis's BLOOM/STUCK
  verdicts with their recorded lines quoted verbatim; Davis's applied conduct moves with their
  route ops; aggregate counts for everything else the room said and for dropped moves), the births
  section (children born, named from their records; stillborn/declined counted), the formation
  section (hierarchies formed), the stress section (band changes), the gestures section (the
  performer's freeze/clear/swell). A section the take does not carry yields NO facts of its kind —
  absence is never narrated as an event — and a take with no mind section gets one honest line
  ("the take carries no persona record — nothing the room said can be retold") instead of an
  invented voice: the hook comment's pre-stamp law.
- `digestFacts` — the citable set: the span fact (frames/bars/clock time; for a capture, its
  `initialState.atFrame`, so the summary states the window it actually covers, not the minutes
  requested), then the facts under per-kind caps, overflow folded into ONE counted aggregate
  ("and N more logged events the digest leaves in the take") — the total cap's trim is counted the
  same way, never silent.
- `buildRulesRecap(perf, { kind })` — the complete record from the log alone: one rules line per
  digest fact, voiced by bucket (Davis conducts the room: births, conduct, bands, forms, holds,
  gestures, the beat; LOIS judges the picture: keeps, burns, cuts, palette, seed, layers; the
  record itself speaks for the span and the aggregates). Deterministic: same take, same record.
- `buildRecapRequest` / `validateRecapClaims` / `mergeModelLines` — the model enrichment seam
  (§2), and `verifyRecap` — the claim-walk over a finished record — plus `checkRecapRecord`, the
  fail-closed reader for attached records.

**New live driver — `app/src/curator/megamindRecapLive.js`.** The megamindSurfacesLive idiom:
a view + subscribe singleton, created lazily, asking nothing on creation.

- REPLAY: the driver polls the playback holder (250 ms, the strip's own seam). **Unless the
  holder reports the take ENDED, `poll()` is a no-op** — no facts read, no recap built, no model
  asked (§3). At END: the rules recap is built, attached to the loaded take (`perf.recap`), and
  published; then, if the `narration.recap` consumer's measured record enables it, Davis and LOIS
  each re-voice their own facts through S2's surface chat (`askSurfaceText` — the registry's one
  Ollama origin, local-only record law, CSP untouched). Surviving claims are merged (a verified
  model line replaces the rules line for the fact it cites; uncovered facts keep theirs), the
  merged record is re-walked with `verifyRecap` before it is kept, and the record stamps the
  model that enriched it.
- RETRO: `summarizeCaptureTake(perf)` builds kind `retro` the same way — rules floor first,
  enrichment where a model is linked — for the save path to attach. The summary narrates
  whatever the capture's own log holds — a retro capture can carry recorder sections when a
  live session produced them, not only the input log.

**Wiring — two small edits, no new panel, no new top-level UI.**

- `app/src/components/PerformanceButton.jsx` (`onRetro`): after `saveRetroPerformance(3)`
  returns, the summary is built from the capture and attached as `perf.summary`, then the file is
  re-packed (`packPerformance`) and saved as before. The capture file therefore carries its
  summary as a section, exactly where take records live; `checkPerformance` passes sections
  through load, so it reads back from any saved capture.
- `app/src/components/TakeStrip.jsx` + `app/src/styles/layout.css`: under the scrub strip, and
  **only once the take has ended**, the strip reads the take's records: the CAPTURE SUMMARY block
  (a retro capture's attached summary, validated by `checkRecapRecord`) and the RECAP block (the
  driver's record for this take). Nothing renders during playback; the strip is otherwise
  byte-identical in behaviour, and #1461's muting seams (App's `isPlaybackActive` frame-tap skip,
  playback's persona stand-down) are untouched — not one line changed in `playback.mjs`,
  `performanceCapture.mjs`, `retroCapture.mjs`, `App.jsx`, or any recorder.

**Suite** — `app/src/curator/megamindRecap.selfcheck.mjs`, registered in `app/selfcheck.manifest`
(one line added; the package.json script untouched, per the repo contract).

## 2. How the honest-narration law is mechanised

Not a prompt instruction — three mechanical gates, each pinned by the suite:

1. **Facts only from the log.** Narration input is the digest: records extracted from the take's
   own sections/input log by pure code. The rules recap — the floor that ships when no model
   exists — is template-rendered from those facts, so it cannot invent by construction.
2. **Per-claim walk before anything is kept.** A model claim must (a) cite a digest fact id —
   an unknown id (an event that never happened) drops the claim; (b) use no number the cited
   fact does not carry — an invented count drops the claim; (c) quote at least one of the cited
   fact's own forms (its names, ids, state words, or the persona's recorded line). Claims are
   scoped per persona: Davis can only re-voice Davis facts (+ the span), LOIS likewise, so one
   voice can never swallow the other's lines. Validation is per-claim — one bad claim never
   voids the good ones.
3. **The finished record is re-walked.** `verifyRecap` re-checks every line of the merged record
   (citations resolve, numbers carried, a form quoted); a violation discards the enrichment and
   keeps the rules record. The suite additionally re-derives facts from the fixture take's log
   and asserts every fact in the shipped record reproduces — the acceptance walk, end to end.

**Known limit (for Matt):** every kept line anchors to a real logged fact and invents no
numbers; the gate does NOT guarantee a line adds no colour around its anchor — invented
entities/actors written around a genuine anchor can pass. This residual goes to Matt as a
known limit.

The hostile fixture is a scripted fake Ollama whose Davis reply contains (a) a claim citing a
nonexistent fact id — "a dragon made of static ate the stage at bar 9", (b) a claim citing the
real STUCK fact but inventing a count — "77 moths", and (c) one grounded claim quoting Davis's
recorded BLOOM line. The shipped recap contains (c) as a model line, keeps rules lines for the
uncovered facts, and contains neither the dragon nor the 77 moths. That fixture proves those
two drop classes only (unknown id, invented number); it does not prove that invented entities
written around a genuine anchor are caught — see the known limit above.

## 3. The muting law, untouched and pinned

Recaps are records, never performance UI: the strip renders them only when `pb.ended`, and the
driver's `poll()` returns immediately unless the holder reports `ended` — the suite polls a
mid-playback holder 50 times with a capability record SET and asserts zero recap, zero attached
record, and zero model asks, then flips `ended` and watches the rules recap land synchronously.
The replay family stays green (playback 7, performanceFile, performanceCapture, retroCapture,
mind 15, takeStrip 6, performanceCreatures, performanceDishLife) — the #1461 behaviour is
verified untouched, not just unmodified.

## 4. Retro window scoping

A retro capture's perf object IS the window (the ring rebases its log to the snapshot boundary);
the summary is built from that object alone, so events outside the window are not in its log and
cannot be narrated. The suite proves the range mechanics directly: `takeFacts` over a sub-window
excludes outside events INCLUDING the aggregates (spoken/dropped/missed counts are window-scoped),
and a 300-frame capture's summary never mentions a palette that only changes at frame 500 of a
longer take. The span line states the capture's real span (frames + session start frame), not the
"last 3 minutes" that was requested.

## 5. Verification (coordinator will re-verify before publishing)

- `megamindRecap.selfcheck` — **12 checks**, all passing (run 5× consecutively, stable):
  fact derivation from every section + input log with log-sourced stamps; window scoping incl.
  aggregate counts; digest bounds/order; rules recap complete + deterministic + claim-walk clean
  + facts re-derived from the log; mind record with no conduct key (recap builds complete, no
  throw); `checkRecapRecord` fail-closed; claim validation (hostile id, hostile number, malformed
  reply); the muting pin; the hostile-backend driver test (one ask per persona, model stamped,
  rules lines retained); retro rules-only summary + the no-persona-record honesty line; the
  pack/unpack round trip of an attached summary; wiring source pins.
- Family suites green: playback 7 · performanceFile ok · performanceCapture ok · retroCapture ok ·
  mind 15 · clockRecord 6 · formation ok · stressRecord ok · davisShift ok · gestureRecord 10 ·
  treatmentBus 14 · trioLive 23 · takeStrip 6 · kineticBirths 21 · performanceCreatures ok ·
  performanceDishLife ok · creatureGate ok · spectrumRecord ok · routeRecord 7 · megamindLink 21 ·
  megamindVoice 17 · megamindVision 16 · kernel purity ok.
- panelGraph — **634 modules**, unchanged from main: no Node-only module reachable from any
  panel (the recap modules are not in the panel graph at all).
- Production build — **754 modules** vs main's 752 measured by identical-node_modules A/B:
  exactly +2, the two new modules. (First build read 755: the core's one-line reply parse had
  imported `megamindSurfaces.mjs`, which main's production graph does not carry — the parse is
  inlined over `megamindVoice.parseJsonText` instead, per the @resvg eager-graph lesson, and the
  module-list diff confirms exactly the two new files.)
- `npm run lint` — 0 errors (11 warnings, all pre-existing). `npm run format:check` — clean.
- Full manifest sweep — **664 suites: 661 pass, 3 fail, all three environmental with evidence**
  (run twice by independent loops — a single-pass loop whose shell was OOM-killed after printing
  its tally, and a chunked re-run with per-suite results written incrementally; both agree).
  (1) `engine/kernel/bake/swarmWasm` — `build-wasm.sh --verify` (the checked-in kernel Wasm does
  not reproduce bit-for-bit from the Rust sources under this sandbox's toolchain); proven
  base-identical by running it in a fresh detached worktree at main `e257d8ab`, where it fails
  with the identical signature. (2) `fx/rollSafety` — its Playwright section dies with
  "Target page, context or browser has been closed" under sweep load, and on an idle re-run the
  suite is OOM-killed outright at 224 s (the sandbox Chromium/memory instability the house notes
  document; CI's selfcheck-browser job installs the pinned browser and is authoritative).
  (3) `gl/accum` — SIGABRT / V8 OOM inside its browser section under the sandbox's shared memory
  cap (its Node-side checks pass first; the idle re-run OOMs the same way). None of the three
  touches, imports, or is imported by anything in this change.
- Cross-lane pin check (from PR #2085's CI): `director.selfcheck`'s source-shape pin greps all
  of `app/src` for the eight director-scheduler identifiers (`directorGains`, `getDirector`,
  `blendPick`, `directorSense`, `directorTable`, `effectiveTemp`, `initDirectorBeat`,
  `directorTrace`). Word-match grep over every file this change adds or edits (core, live,
  suite, both components, the CSS, this report): **zero matches** — recaps read the take's log
  and never reference the scheduler — and `director.selfcheck` itself passes on this tree
  (14 checks).

## 6. What Matt's on-device check is

In one Tauri session with the House model linked (the same session as the other MegaMind checks):

1. **Replay recap:** load any take (▶ take), let it play to the end — do not stop it early.
   When END shows, the RECAP block appears under the scrub strip. Read it: every line should be
   something that actually happened in that take (a birth, a palette move, a hold, what Davis
   and LOIS called at the time, in their recorded words). Spot-check two or three claims against
   what you saw — especially any line in Davis's or LOIS's voice that does NOT quote the take:
   it should still only restate a logged event. There must be no recap — and no persona text —
   at any point DURING playback.
2. **Retro summary:** play live for a few minutes, do something memorable (a palette slam, a
   freeze), press **↺ last 3m**, then play the saved capture back to the end: the CAPTURE
   SUMMARY block should describe the window you actually lived — including the memorable act —
   and nothing from before the window.
3. **Rules floor (optional):** unlink the model (MEGAMIND tab → Disconnect) and repeat (1): the
   recap still appears, plainer, stamped as rules. Nothing about the take's playback changes.

## 7. Scope notes

- Not built, per the issue: live commentary during a set (S2's pacing surface owns live); no new
  panel or top-level UI; no CSP change; no new dependencies; taste.json, `FEATURES_VERSION`, and
  every training file untouched (no diff in any).
- Deliberate takes do not get a `summary` section at stop — the issue scopes summaries to
  retro-capture; a deliberate take already carries its full sections, and its replay recap is
  generated at playback end.
- The recap attached to a loaded take (`perf.recap`) is a session artifact of that take object;
  re-saving a played take is not a flow the instrument has, so recaps are read in the strip, not
  re-filed. The retro summary, by contrast, IS filed — it attaches before the capture is packed.
