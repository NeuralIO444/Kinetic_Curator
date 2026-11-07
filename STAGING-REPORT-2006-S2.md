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

## NOT done (by design — later slices)

No adjustment is run, no re-deal, no CUT (slice 3); no QUIET rung or plate seam (slice 4); the Sleight-of-Hand delivery is slice 3's; `voice.rungOrder` is a proposal a later slice may consume — nothing consumes it here. MegaMind untouched and still parked. No UI beyond the ticker lines themselves.
