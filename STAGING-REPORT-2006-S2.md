# STAGING REPORT — #2006 slice 2 (the voice)

- **Issue:** #2006, the poem type review loop — SLICE 2 ONLY (the voice; still no hand).
- **Branch:** `feat/review-loop-voice-2006`, base origin/main `c0322bff` (slice 1 merged via PR #2019). NOT pushed, NO PR — the coordinator publishes.
- **Disjointness:** the plate fix #2018 / PR #2020 is in flight on a different surface; this branch was NOT rebased. No file below is touched by that lane.
- **Date:** 2026-11-06.

## What shipped

| File | Change |
|---|---|
| `app/src/curator/fieldReviewVoice.mjs` | NEW — the pure voice: the rules line table, the proposed rung orders, the §3.7 ask-context builder, the proposal validator, the extension sanitizer. |
| `app/src/curator/fieldReviewVoiceLive.mjs` | NEW — the live driver: watches the banked record, speaks the rules line, asks the backend, applies a valid proposal, owns the frequency gate and the replay mute. |
| `app/src/curator/fieldReviewVoice.selfcheck.mjs` | NEW — 26 checks, manifest-registered directly after slice 1's suite. |
| `app/src/curator/loisRank.js` | + `speakVerdict(line)` — the one tape write (see premise 1). |
| `app/src/state/slices/layoutSlice.js` | + `amendFieldReviewVoice(voice, key)` — the fail-closed extension write; the `fieldReview` state comment updated for slice 2. Nothing else in the slice changed; slice 1's banking is byte-identical. |
| `app/src/App.jsx` | The driver starts beside `startMind`, with the SAME model object and the SAME `isReplaying`; stopped in the same cleanup. |
| `app/eslint-rules/determinism-allowlist.mjs` | One entry added — exact-count allowance WITH a written reason, per the rule's own instruction (see Re-pin account). |
| `app/selfcheck.manifest` | +1 line (the new suite). |

## The line discipline as built

- **Who speaks:** DAVIS speaks CLEAN, LOIS speaks JANKY, nobody speaks EXEMPT. Persona follows the KC-1 DS: the woohoo is the continuous side, the gate readout is the discrete side.
- **Where:** the standing footer tape — `loisTicker` reads `loisRank`'s verdict slot and LoisPill crawls it. No new surface. A spoken line is replaceable by the next verdict (ranked or reviewed) exactly as a rank line is; the slot's score parts are NOT touched (they remain the last rank's — the CUR detent keeps reading the rank it scored).
- **DAVIS on clean** — the woohoo and nothing else (a clean landing needs no figures). Three lines, picked by the record's seed so the same landing always cheers the same way: `WOO HOO.` / `Woohoo — landed clean.` / `WOO HOO — the poem stands.`
- **LOIS on janky** — the gates talking, one template per gate, measured value against its limit in her pan register, then the repair named as a PROPOSAL (slice 2 acts on nothing; the record's `rung` stays null and nothing here runs a rung):
  - selfOverlap: `The poem prints over itself. 12% of its ink is doubled — 5% is the limit. Would shrink it.`
  - markCover: `The marks are eating the poem. 73% of its ink is covered — 50% is the limit. Would shrink it.` (the spec's own example gate)
  - coverage: `The poem eats the dish. 41% of the dish is ink — 35% is the limit. Would shrink it.`
  - coverageLow: `The poem is barely there. 0.09% of the dish is ink — 0.15% is the floor. Would deal it again.`
  - crop: `The frame cuts the poem. 25% of its glyphs cross the edge — the limit is none. Would shift it back.`
  Shares speak as whole percents, small readings to two significant decimals (`pct`, pinned). The spoken line's rung order rides the record: the gate-aware lead first (shrink for selfOverlap/markCover/coverage, re-deal for coverageLow, shift for crop), then the ladder `[1, 2, 4, 5]`.
- **Silence means:** exempt landings (plate/raygun/whisper/kept/held — slice 1's exemption table) are never spoken: the poem was never judged, so there is no verdict to speak. No record (silence deal, refusal, swarm landing) is likewise never spoken. The tape simply keeps whatever line it already had.
- **Frequency:** a spoken Davis-clean suppresses the NEXT clean landing's speech — its record stands unspoken, in exactly slice 1's shape, and no ask is made for it. A janky verdict always speaks and resets the gate. LOIS is never suppressed.
- **Idempotence:** a record already carrying a voice is never re-spoken; the same record object carried by (HOLD, unrelated churn) is not a landing and is ignored by reference.

## The backend ask contract

The driver asks the SAME shared model object App hands `startMind` (Apple Intelligence via kc-mind; `demoModel` under `?debug=mind`), on the standing rails: one flight per persona, MIND_REQ / MIND_REPLY telemetry emitted with the context hash, the ask stamped with the landing's bar and a record-derived seed.

- **The ask carries** (§3.7, v1 measures only — NO frame image): `{ v, kind: 'field-review', poet, piece, room, verdict, gate, measures: { <each of the 5 gates>: { value, limit, pass } }, rulesLine, rungSet, leadRung, seed }`. Names are the books' own identifiers — the poet's surname (`POET_SURNAMES`) and the piece id — read from the standing form at speak time; they colour the ask only, never the verdict and never the record.
- **The model MAY:** phrase the spoken line; order the rules-approved rung set `[1, 2, 4, 5]` for a later slice.
- **The model MAY NOT:** change a verdict, invent a gate, or speak when the rules say silence. `validateReviewProposal` never reads a verdict, gate or measure out of a reply. A janky line must carry the rules' own figures for the failing gate — the measured value AND its limit, formatted exactly as `pct` formats them, matched as whole figures (`5%` inside `15%` does not count) — or the proposal is dropped whole. A rung order must be a duplicate-free subset of `[1, 2, 4, 5]`; any rung order on a clean landing is out-of-set and drops the proposal. Lines are bounded by the Mind contract's `MAX_LINE` (140).
- **The rules line is spoken FIRST, synchronously** — it is the line of record. A proposal replaces it only if it is valid AND on time AND still about the standing record (below).
- **Fallback is silence about the fallback** (proven in the suite, one check each): backend unavailable ⇒ never asked, rules line stands; ask throws or rejects ⇒ rules stands; malformed / figure-less / out-of-set reply ⇒ dropped, rules stands; reply past the 300 ms cap (`ASK_TIMEOUT_MS`, measured driver-side on an injectable clock) ⇒ dropped, rules stands (299 ms lands, 301 ms drops — both pinned). In every fallback the standing voice's provenance already reads `backend: 'rules'`; no UI anywhere names a backend.
- **Stale proposals colour nothing:** if the room has landed again before a reply lands, the proposal is dropped — the model is asked afresh at the next landing and colours THAT landing's line. (Premise translation 5 below.)

## The record extension shape

Slice 1's record is untouched; a spoken record gains ONE key, absent (never null) when unspoken:

```
voice: {
  persona: 'davis' | 'lois',        // the verdict's own — davis iff clean, lois iff janky
  line: string,                     // ≤ MAX_LINE — the line as spoken (rules or model phrasing)
  bar: number | null,               // the musical bar at speak time; null only if the clock read fails
  backend: 'rules' | 'apple' | 'demo',
  seed: number,                     // rules: the record's own seed. model: the ASK seed (record-derived)
  rungOrder?: [1|2|4|5, ...]        // janky only — the proposed order (rules' or the model's)
}
```

Written only through `amendFieldReviewVoice`, which refuses a stale `(seed, stream)` key, re-validates the extension against the standing record (`sanitizeReviewVoice`, fail-closed), and never lets a rules line overwrite a model's line. The record's own fields (`verdict`, `gate`, `measures`, …) are never rewritten by the voice.

## Replay discipline — spoken lines are theatre, the record is authority

The review record is not part of a take (slice 1: never serialized), so there is no banked line for a replay to re-read — and none is needed: the verdict record re-derives bit-for-bit through the same deal commits. The driver is muted while a take plays back (App passes the same `isPlaybackActive` startMind gets): a replay NEVER asks a backend (ask counts pinned across a re-derived landing), never re-speaks, and the re-derived record is exactly slice 1's — proven by deep-equality against the live record minus its voice. Nothing anywhere reads `voice` to decide anything; slice 3 will read the RECORD (verdict/gate/measures) the way slice 2 does.

## Premise translations (verified on THIS tree)

1. **The tape seam is loisRank, not the whisper.** `fieldWhisper`/whisper.js is a different surface (STIMULI lines, once per load). Verdicts already reach the tape through one slot — `loisRank.lastVerdict`, read by `loisTicker.tickerLine()` and crawled by LoisPill (store subscribe + bus + 500 ms poll). The voice writes that slot via the new `speakVerdict`; queueing/priority/expiry are the slot's own (latest verdict wins, lines persist until replaced), which is exactly the replaceability the spec's frequency discipline assumes.
2. **The model is App's, not mindLive's.** `startMind` keeps its model in a closure and exports no accessor; App.jsx constructs the shared wrapper (`appleModel` over `desktopAppleModel()`, or `demoModel` under DEBUG_MIND) and hands it to startMind. The voice driver receives that same object — one backend, two askers, no second bridge.
3. **Ask seed/bar provenance.** Mind decisions carry `{ persona, bar, backend, seed }`; the voice extension carries the same four. The ask seed is derived from the record alone (`seed XOR FNV(stream)`), so the same landing always asks the same way and a replay needs nothing stored. The bar is read from the musical clock at speak time (`getMusicalTime()` — the same source the bus stamps use).
4. **Rung 3 is NOT in the spoken ladder yet.** §4 arms rungs 1–2 + 4–5 in slice 3 and rung 3 (QUIET) in slice 4; the voice's approved set is therefore `[1, 2, 4, 5]`, and a proposal naming rung 3 drops whole. It joins the set when slice 4 arms it.
5. **A proposal colours only its own landing.** §3.7's fallback parenthetical (a late wording may colour a later line) was NOT taken for janky verdicts: a janky line's figures belong to its own landing, and speaking them over a different landing would put wrong numbers on the tape. Dropped-and-re-asked is the honest reading; the rule is pinned in the suite.
6. **Exempt records stay silent** (the brief asked me to read §3.5/§3.6 before deciding): exemption means never judged, and a voice with no verdict behind it would be theatre over the exemption table Matt ruled. Silence it is.

## Verification (all run in this worktree, this tree)

- **New suite:** `fieldReviewVoice.selfcheck.mjs` — **26/26**. Pins: the exact rules line per gate; persona mapping; `pct` edges; the silence cases; the validator's figure honesty (incl. the `10.05%` look-alike trap); the ask-context shape; the sanitizer; driver speech/silence/frequency/carry-by; the full fallback matrix; flight discipline + staleness; the 299/301 ms cap boundary; the replay mute + ask counts; slice-1 record integrity both ways (unspoken = no `voice` key; spoken minus voice = the unvoiced deal's record, byte-compared).
- **Slice 1 suite:** 18/18, UNCHANGED file, census lines identical (A = 144, B = 20; M2 mirror floor note intact).
- **Neighbours by file:** goldenPlacement OK — golden hash `e892d112b20d92b6…` unmoved; fieldBattery 15/15 (deals byte-identical); fieldLiveDeal 9/9; fieldSilence all-pass; poemRow 16/16; rayGun 19/19; loisTicker 7/7; loisRank ok; loisJudge OK; loisCut 5/5; loisActivity ok; mind 15/15; eventRegistry ok (169 events — my MIND_REQ/MIND_REPLY emits are registered telemetry, no drift); busChain 14/14; directorRoom 7/7.
- **Placement census 560,366/0:** unmoved (pinned inside slice 1's suite, green above).
- **format:check:** clean (one suite file reflowed by prettier, re-ran green after). **lint:** 0 errors (11 warnings, all pre-existing in unrelated files). **build:** `npm run build` ✓.
- **e2e sweep:** grepped `app/e2e/` for the tape's text surface and new-meaning words (`WOO HOO`, ticker, `speakVerdict`, `fieldReview`) — no spec reads the footer verdict text; `.codec-lois` is the room-codec face, a different surface. This slice adds no DOM and no selector meaning.

## Re-pin account

**NONE.** No suite was re-pinned, no golden moved, no census count changed, slice 1's suite and record are byte-identical for unspoken cases. The one caused non-code change: the determinism allowlist entry for the driver's injectable `now` seam (exact counts — `performance.now` ×2, `Date.now` ×1 — with the written reason the lint rule itself demands; same precedent as mindLive's and loisGrudge's seams). The clock measures ask latency only; verdicts come from the seeded rules table, and the suite injects `now` for the cap pins.

## QA fix pass (2026-11-06) — validator figure roles + clean fence; suite restated 26 → 32

QA returned NOT CLEAN with two should-fixes, both inside `validateReviewProposal` (`fieldReviewVoice.mjs`), plus nit 2 in the live driver. Fixed exactly those; the sections above stand as written — where this section refines the contract they describe, it says so.

- **SF1 — figures had presence but no roles.** The validator required both figures present as whole figures but never checked which was the measure and which the limit: QA's probes (`"50% of its ink is covered — 73% is the limit."` on a 73%-over-50% markCover record; the same swap on coverageLow) were ACCEPTED — the tape could assert numbers the record contradicts. Fix: a positional fence on a new `figureIndex` helper (`carriesFigure` now rides it) — when the value and limit figures differ, the value figure's first whole-figure occurrence must precede the limit's, matching every rules template. When they format to the same string, presence is the whole fence and position is vacuous (pinned with a 50%-over-50% record).
- **Crop asymmetry (QA nit 1, same fence).** The rules' crop line says "the limit is none" and never carries `pct(0)` = `0%`, yet the shipped validator demanded the limit figure — a crop proposal could only pass by inventing the one figure the rules line withholds. Fix: for crop, the value figure is required and carrying `pct(limit)` drops the proposal (fail-closed, symmetric with the value requirement); the degenerate value == limit case stays vacuous. The §"backend ask contract" account above ("a janky line must carry … the measured value AND its limit") is refined accordingly: crop carries its value only.
- **SF2 — clean proposals were unanchored.** Beyond length, nothing fenced a clean reply: QA's probes (`"WOO HOO — 99% of the dish is ink and it sings."`, `"The poem is buried under the marks. Cut it."`, `"Janky — half the poem is under the marks."`) were all ACCEPTED. Davis's rules lines carry no figures at all, so the fence is the mirror of the janky one: a clean proposal drops whole if it (a) carries ANY percent figure, (b) names the verdict it is not (`janky` — a reply carries no verdict, least of all the contrary one), or (c) names a repair (the rungs' imperative names — shrink / shift / cut / re-deal — are out of set in prose on a landing that approves no ladder, exactly as a `rungOrder` already was). This is a rule fence, not a prose censor: contradicting prose beyond these three fences cannot be pattern-fenced and stands as accepted residue, as QA itself framed it. The standing rule that a clean proposal may not carry a rung order is unchanged.
- **QA nit 2 — amend before speak.** In `fieldReviewVoiceLive.mjs` both the rules path (`handle`) and the proposal path spoke before amending. Reordered to amend-first in both: a pure reorder — the record key is pre-checked in the same synchronous block, there is no await between the two writes, and no observer can interleave, so nothing observable changes (the full driver battery — speech, frequency, fallback, staleness, cap, replay — passes unchanged). Tape/record provenance agreement is now structural, not incidental. Nits 3–5 left alone (recorded decisions / spec annotations, not code).
- **Pins added (suite §2, +6 checks → 32):** QA's exact probe strings — both swaps and all three clean probes — now REJECT; value-first rephrases ACCEPT; the equal-figure case; the consistency property (the rules' own lines for every gate, crop included, and all three Davis woohoos, submitted as proposals, ACCEPT — the validator is satisfiable by its own templates); crop's invented-`0%` drops and a limit-free crop rephrase stands.
- **Re-verification on the fixed tree:** voice suite **32/32**; slice-1 suite **18/18**, censuses identical (A = 144, B = 20); golden hash `e892d112b20d92b6…` unmoved; fieldBattery **15/15** byte-identical; `format:check` clean (suite file reflowed by prettier, re-ran green after); lint 0 errors (11 warnings, pre-existing). Re-pins: NONE — no other suite, golden or census moved.

## QA fix pass 2 (2026-11-06) — the figure set is closed; suite restated 32 → 33

QA re-review confirmed SF1, SF2, the crop asymmetry and the amend-before-speak reorder all fixed exactly as claimed — and found one more hole in the same class, in the same function. Fixed exactly that; the sections above stand as written.

- **Extra invented figures rode alongside a correct pair.** The round-1 fence verified the required figures' presence and roles but never enumerated the figures a line actually speaks, so QA's probes were ACCEPTED on the markCover record (73% over 50%): `"173% covered at the peak — 73% of its ink is covered — 50% is the limit."`, `"…150% effort will not save it…"`, and `"…and 5% of its ink is doubled."` (another gate's figure, false for the record) — plus the same shape on crop (value figure + an invented `40%`). A line could put numbers on the tape the record does not own while showing a perfect required pair.
- **Fix — a closed figure set.** A new `lineFigures` extractor enumerates every percent figure in the line as a maximal whole token (`173%` extracts as `173%`, never as an occurrence of `73%`; a malformed token like `10.05%`, a shape `pct` never emits, is still extracted — an unowned figure, never "not a figure"). In `validateReviewProposal`'s janky branch, every extracted figure must be one of the record's own — `{value, limit}`, or `{value}` for crop — or the proposal drops whole. Repeats of an owned figure stay legal (a rephrase may restate the value). The closed set subsumes round 1's crop-specific withheld-limit check, which folded into it (crop's `0%` is simply unowned); the crop branch keeps its explanation and owes nothing further. Extraction is a superset of the shapes `pct` can emit, so the rules' own templates pass unchanged — verified by the standing consistency pin, not assumed. The validator's and the module header's stated contract now say the set is closed.
- **Pins added (suite §2, +1 check → 33):** one block carrying QA's four probe strings (all now REJECT, crop's included) and the restated-value rephrase (`73% … 73% … 50%`) ACCEPTING. All 32 prior checks unchanged and green — the consistency property among them: no rules template carries a third figure.
- **Not chased, per QA's own framing:** nit 1 (decoy first occurrence — role-anchored parsing, beyond the endorsed pattern-fence design), nits 2–3 (`pct` collisions verified harmless — the rules line speaks identical strings in both roles there; the benign clean-fence over-reach fails closed to the rules woohoo).
- **Re-verification on the fixed tree:** voice suite **33/33** (re-ran green after the prettier reflow); slice-1 suite **18/18**; fieldBattery **15/15**, byte-identical replay; golden hash `e892d112b20d92b6…` unmoved; census suite OK; `format:check` clean; lint 0 errors (11 warnings, pre-existing, none in the touched files). Re-pins: NONE. The fix commit touches the validator, its suite, and this report.

## QA fix pass 3 (2026-11-06) — figures are figures in any script; suite restated 33 → 34

QA round-2 re-review held the closed set against every ASCII attack (42 probes) and nothing regressed — but enumeration was ASCII-only, so a figure spoken in another script bypassed BOTH fences. Fixed exactly that; the sections above stand as written.

- **Non-ASCII figures were invisible to the fences.** `lineFigures` matched only `\d` and `%`, and the clean branch's figure test was the same ASCII pattern, so QA's probes were ACCEPTED with the correct pair standing in front of them: on markCover, `…Earlier it hit 99％.` (fullwidth percent, U+FF05), `٩٩%` (Arabic-Indic digits), `९९%` (Devanagari), `９９%` (fullwidth digits); on clean, `WOO HOO — 99％ / ٩٩% / ９９% of the dish is ink and it sings.` Each puts a number the record does not own onto the tape, rendered as a percentage, through a script door instead of an ASCII one.
- **Fix — enumeration reads every script.** `lineFigures` now extracts maximal tokens over Unicode decimal digits (`\p{Nd}`, `u` flag) and the percent-sign variants (`%`, `％` U+FF05, `٪` U+066A, `﹪` U+FE6A), and returns each token AS SPOKEN — digits and its own percent sign together. `pct` speaks ASCII only, so a token carrying a non-ASCII digit or percent sign can never equal one of the record's own figures: unowned by construction, in the janky branch by the closed set and on crop alike. Maximal extraction means an owned ASCII figure cannot hide behind a non-ASCII digit prefix (`٩73%` is one token, and not `73%`). The clean branch's figure test IS the enumeration now (`lineFigures(line).length > 0`), so one discipline fences both branches. Defence in depth in the same machinery: `figureIndex`'s whole-figure lookbehind widened from `\d` to `\p{Nd}` — ASCII behaviour identical (ASCII digits are Nd), and a digit of any script before a figure now means the figure is part of a longer number there too.
- **Pins added (suite §2, +1 check → 34):** one block carrying QA's exact probes — the four janky script figures and the Arabic percent sign (all REJECT beside a correct pair), the mixed-script token `٩73%` (REJECT), and the clean triple (all REJECT) — plus two round-2 spot-pins restated (the `173%` invented peak REJECTS; the restated-value rephrase ACCEPTS), so the block also proves ASCII behaviour is unchanged. Probe strings are written as `\u` escapes so the codepoints are exact; the block's comment names each script. All 33 prior checks unchanged and green — the consistency property among them: the rules' own lines for every gate and all three woohoos still ACCEPT as proposals.
- **Re-verification on the fixed tree:** voice suite **34/34** (re-ran green after the prettier reflow of the suite file); slice-1 suite **18/18**; fieldBattery **15/15**, byte-identical replay; golden hash `e892d112b20d92b6…` unmoved; census suite OK; `format:check` clean; lint 0 errors (11 warnings, pre-existing, none in the touched files). Re-pins: NONE. The fix commit touches the validator, its suite, and this report.

## NOT done (by design — later slices)

No adjustment is run, no re-deal, no CUT (slice 3); no QUIET rung or plate seam (slice 4); the Sleight-of-Hand delivery is slice 3's; `voice.rungOrder` is a proposal a later slice may consume — nothing consumes it here. MegaMind untouched and still parked. No UI beyond the ticker lines themselves.
