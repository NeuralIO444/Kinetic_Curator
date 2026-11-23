# STAGING REPORT — #2151 FIELD: LOIS and DAVIS request revisions when a standing poem reads empty or crowded

Branch `feat/2151-field-revision-requests`, based on origin/main `b605edd9` (#2437). One PR, **not merged by
the builder** — a feel feature in Matt's review lane: **PR pending** (opened at the end of this build; the PR
body carries the same summary).

Spec: issue #2151 body + comments — the register ruling (2026-11-12: empty = the COVER register, crowded =
the INTERIOR register; CARSON reads the cover pole, ASHWORTH the interior/grit side), the pressure law
(2026-11-12: HOT = variety mode, no requests; LINGERING/FIDDLING = requests stand down; requests fire only
in between, poem standing, user watching; a user change overrides), the supply and minimum rulings
(2026-11-17: poets write the pole pieces — landed as PR #2310's per-poet register caches; one-word poems
exempt from `FIELD_POEM_MIN_STAMPS`; Japanese covers deal in the native face whatever their length), and
the acceptance checklist in the body plus the comments' additions.

## What was built

### The critical pass — `app/src/curator/fieldRevision.mjs` (new, pure)
- `judgeStandingPoem(form)` — reads the standing form's piece in the supply and judges its REGISTER TAG:
  `cover` → `{ read: 'empty', doctrine: 'carson' }`, `interior` → `{ read: 'crowded', doctrine: 'ashworth' }`,
  `between` or an untagged deck piece → fine. Not letter counts, not share of frame — the piece's own
  typographic register, as ruled. Unknown piece → null (nothing to judge).
- `classifyTempo(snapshot)` — the pressure law as a pure read of the loisActivity snapshot: `hot`
  (rollsLastMinute ≥ `REVISION_HOT_ROLLS_PER_MIN`), `fiddling` (a settings tweak inside
  `REVISION_FIDDLE_WINDOW_MS`, or a live undo burst), `away` (the feed's own away line, or no feed),
  else `watching`.
- `pickRevisionDecision(form, rng)` — the poem's answer: a deal decision naming a piece from the SAME
  poet's register cache, toward the other pole — the middle band first, the far pole as fallback — never
  the standing piece; a form standing in the native face is answered in the native face.
- `FIELD_REVISION_KNOBS` — every threshold/band/gate of the pass as named constants in one frozen object,
  banked into each request record as provenance (the fieldReview gates discipline). No tuning surface.

### The driver — `app/src/curator/fieldRevisionLive.js` (new), wired in `App.jsx`
Ticks once a second; owns all the clocks (dwell, grace) so the slice never reads one (#806 law). Per tick:
the store's `fieldVariety` flag follows the hot tempo; a pending request is silenced the moment the form
moves, the poem is held, an exemption lands (the review loop's own table — kept/plate/raygun/whisper), or
the tempo leaves watching; after `REVISION_ANSWER_DELAY_MS` of watching grace it calls the store's answer
action. A poem is judged only after standing `REVISION_STAND_DWELL_MS` in the watching tempo, unheld and
unexempt. Muted while a take plays back. All faults swallowed — a critic never breaks the stage.
Its one `Date.now` (the injectable seam's default) carries an exact-count entry in
`eslint-rules/determinism-allowlist.mjs` with the written reason, on the loisActivity precedent.

### The store — `app/src/state/slices/layoutSlice.js`
- New session state beside `fieldReview`: `fieldRevision` (the pass's record) and `fieldVariety` (the hot
  flag). Neither is serialized or undo-managed (fieldReview's discipline).
- Actions: `setFieldVariety`, `requestFieldRevision` (re-validates the named form still stands, unheld,
  and hasn't had its bite), `cancelFieldRevision` (records the silencing outcome), `answerFieldRevision`
  (re-validates everything — pending, form unmoved, unheld, unexempt — then deals through `landPoem`).
- `landPoem` gains two seams, both defaulting to today's behaviour: a caller-named `decision` (the
  revision answer — it then flows through the gate, the doctrine arm, the shadow review, the ladder and
  the counter exactly as a Director deal does) and variety read off `state.fieldVariety` into `dealPoet`
  (including the ladder's own re-deal).

### The supply deals — `app/src/poets/fieldForm.js`, `placement.js`, `poemRow.mjs`
- `POET_REGISTERS` + `findPoetPiece` — the supply: deck first, then the poet's register cache. `POET_DECKS`
  is untouched (the #2310 suite's pins hold byte-for-byte).
- `fieldDealReport` serves the whole supply and applies the two ruled exceptions to the #1932 minimum,
  judged on the face actually dealt: a one-word deal is exempt; a `register: 'cover'` piece on a kana deal
  is exempt. Every other piece keeps the minimum (pinned: Teijo's `t9` in the native face — 5 stamps,
  between — still silences; its Latin face deals as always).
- The one-word push (`placement.js`, `PUSH_*` constants beside the plate family): a one-word deal is sized
  to 0.84 of the dish width, capped at em 0.28 (under the document door's 0.3 stamp ceiling), with
  per-glyph em/rotation jitter drawn off the placement stream after the module origin — deterministic per
  (piece, seed), gate-judged and door-fixed like every form (pinned across seeds, both faces).
- `poemIdentity` reads the supply, so the poem row names register poems — and a pushed one-word poem's
  identity chip shows the clean transcription off the piece, per FIELD law. `poemFormKey` is exported
  (poet + piece + exact materialization) as the pass's form key.
- The pending request shows on the poem row as a small chip — `too empty` / `too crowded` — beside the
  FORM chip, only while the request names the standing piece (`PoemRow.jsx`). No new panel.

### Variety — `fieldDirector.js` / `fieldEval.js` / `director.js`
`choosePoet` gains `variety`: the piece pick ranges over deck + register cache for the chosen poet. Off,
the pick is the deck alone, exactly as shipped (pinned both ways).

## Decisions taken under the coordinator's standing recommendation (flagged per the brief)

1. **Push hardness** (the one question the issue's first comment left open — asked once and dropped, or
   standing?): a request stands as a PENDING record for a short grace (`REVISION_ANSWER_DELAY_MS`, 6 s of
   watching tempo), during which any user change silences it; then the poem answers. One bite per form —
   answered or silenced, that exact materialization is never judged again.
2. **The answer targets the middle band first** ("re-deals TOWARD the other pole"): a cover poem is
   answered from `between` (the far pole only when the middle has no stock), so an answered poem lands
   between the poles and cannot draw the opposite request next.
3. **The answer stays with the standing poet** — the register caches were built per poet precisely so
   each poet spans the line; the poem answers in its own voice, in its standing face (script included).
4. **Exemptions reuse the review loop's table** (`reviewExemption`: kept, plate, raygun, whisper; held
   forms likewise) — a poem the performer has claimed or treated is beyond critics, on the #2006
   precedent.
5. **The answer is a reviewed landing** (it rides `landPoem` whole, ladder included), not a
   performer-style unreviewed re-deal: it is the poem system's own deal, and the ladder's re-deal inside
   it can only land deck pieces (which read fine), so the pass cannot loop.
6. **Away is a fourth tempo**: the feed's own idle line means nobody is watching, so nothing fires —
   the watching state the ruling names requires a watcher.

## Verification (this tree, this build)

- New suite `src/curator/fieldRevision.selfcheck.mjs` (14 cases, added to `app/selfcheck.manifest`):
  the judge, the tempo table, the answer pick, the supply exceptions (one-word, Japanese covers across
  12 seeds × both faces — dealt, gate-clean, door-fixed), the push (scale, per-glyph treatment, replay),
  identity, variety both ways, the store actions (request/answer/hold/one-bite), and the driver against
  a fake stage (dwell, grace, hot, fiddling-silence, fine-poem silence).
- Targeted neighbours all green: poemRegister, poemRow, fieldLatin/Kana/Kanji/Plate/StampPath,
  poemLife, fieldSilence, fieldReview, fieldReviewLadder, fieldReviewQuiet, fieldReviewVoice,
  fieldDirector, fieldLiveDeal, fieldBattery, doctrines, doctrineLayout, buildPlacements.
- Dice-driven poem suites run 20× each, all 20/20: poemRow, fieldLiveDeal, fieldReviewLadder,
  fieldReview, poemRegister, fieldRevision, fieldSilence, fieldReviewQuiet.
- `npm run lint` — 0 errors (11 warnings, the project's pre-existing baseline; the changed files add
  none beyond pre-existing App.jsx hook notes). `npm run format:check` — clean. `npm run build` — green.
- Full manifest sweep (continue-on-error, per-suite log): **793 pass / 3 fail** of 796. The only
  failures are the known sandbox-environmental trio — `swarmWasm`, `rollSafety`, `accum` — the same
  three that fail on this main in the sandbox (WASM bake + WebGL/browser-dependent suites); every
  FIELD/poem suite passed inside the sweep, the new `fieldRevision` suite included.

## What this does not do
- No MegaMind/Mind tuning surface (the knobs are gathered and readable; tuning is a later slice, as ruled).
- No new poems — the supply is #2310's cache, dealt as written.
- The CURATOR press's own first deal (its private path in layoutSlice) does not take the variety flag;
  variety rides every `landPoem` deal (KINETIC passes, the identity chip, round landings, ladder re-deals).
- No change to the review loop's judgments: #2151 judges register, #2006 judges jank; they share the
  exemption table and the deal path, nothing else.

## QA fix pass (post-review, same branch)

The QA review returned no blockers, one should-fix and four notes; all five are fixed in this pass:

- **F1 (should-fix) — driver-level replay coverage.** The acceptance line "takes replay identically"
  rested on code-reading for the driver half. The `fieldRevision` suite now carries two fake-stage
  replay cases: with `isReplaying: () => true`, a pole-register poem standing past the dwell draws
  no request and no variety write; and a request already pending when playback starts never answers
  mid-replay — the grace restarts when playback ends and the poem answers then.
- **F3 (note; coordinator ruled: fix the code, not the wording) — the dwell clock.** The driver
  timed the 20 s dwell from the form's first appearance in ANY tempo, so a poem that stood 20 s
  while hot was judged the instant the tempo cooled. The dwell now accumulates only in the
  watching tempo (hot/fiddling/away time never counts), and a new suite case pins it: a form
  standing twice the dwell while hot still waits a full watching dwell before it is judged.
- **F5-chip (note) — stale chip.** `PoemRow.jsx` matched a pending request to the standing form
  by poet+piece, so a re-dealt same piece could wear the chip for ~a tick. It matches by formKey
  now: the chip rides only the exact materialization the request judged.
- **F2 / F4 (notes) — paperwork.** The sweep was re-run on the final tree with the complete
  per-suite log kept as an artifact; its summary is posted as a comment on the PR and the PR
  body's verification section points at that comment. The PR body's files-touched list now names
  this report.

Verification for this pass: `fieldRevision` suite **17 cases passed** (14 + the 3 new ones above);
poemRow 5× all pass (16 checks each); the field family and fieldReview family neighbours all pass;
full manifest sweep on this tree: **793 pass / 3 fail of 796** — the known sandbox-environmental
trio (`swarmWasm`, `rollSafety`, `accum`), complete per-suite log kept as an artifact, summary
posted as a comment on the PR; `npm run lint` 0 errors (11 warnings, the pre-existing baseline);
`npm run format:check` clean; `npm run build` green.
