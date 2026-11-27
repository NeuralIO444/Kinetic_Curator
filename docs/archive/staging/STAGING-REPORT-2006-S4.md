# STAGING REPORT — #2006 slice 4: the QUIET rung

Issue: **#2006** — "feat(field): the review loop — LOIS and DAVIS judge the landed poem, and the ladder repairs the middle"
Slice: 4 of 4 (final) — spec `poem-type-review-loop-spec-2026-11-06.md` §3.4 (adjustment record), §3.6 ladder row 3, §4 slice 4.
Branch: `feat/review-loop-quiet-2006` · Base: main `f55849dc` · Status: **built, not pushed** (coordinator publishes; PR body carries `Closes #2006`).

**The slice in one line:** ladder rung 3 (QUIET) is armed on the plate's zone-suppression seam — instead of moving the poem a third time, the walk quiets the marks under it, and the poem stands in a borrowed room.

---

## What was built

1. **Door** (`src/poets/fieldForm.js`) — the `review` record gains `quietZone` as its only new key. `sanitizeFieldForm` accepts it exactly as boolean `true`, rebuilt last into the record; any other value (false, 1, `'true'`, {}, null) refuses the form whole, on the plate marker's discipline. Absent, the record is slice 3's byte-identical. The transform keys (scale/dx/dy) stay mandatory — a quiet-only record is refused, because the ladder only ever writes the quiet onto a standing transform (rungs 1–2 ran first). Poles never mix: plate+review and raygun+review refusals unchanged; a quieted form is by construction a non-plate form.
2. **Ladder** (`src/curator/fieldReviewLadder.mjs`) — rung 3 takes its canonical slot: plans are the gate's lead rung, then the remaining rungs in [1,2,3,4,5] order minus the lead (`planFor` already generated the full order; slice 3's narrower *spoken* set was the voice's, never the plan's). The rung-3 branch: skipped when a re-deal has landed (`redealt` — spec §3.6: a re-dealt form receives rungs 1–2 only) and unless the *current* failing gate at that point in the walk is `markCover` (`QUIET_GATES = {markCover}` — its spec exit condition is "M2 clears"). The trial review is the standing transform plus `quietZone: true`, re-measured through `reviewLanding` like every rung; the walk stops on the first clean. Rungs 1/2 now spread the standing record so a standing key can never be dropped by a later trial. `adjustment.final` now also banks when the only change is the quiet. All slice-3 invariants hold (fresh janky records only, never twice, fail-closed `bankLadder` untouched, performer re-deals untouched, sovereignty exemptions untouched).
3. **Measure** (`src/curator/fieldReview.mjs`) — see "Measure semantics" below. Without `quietZone` the measure is slice 1's bit-for-bit (proven: census landing margins identical; the no-flag synthetic list deep-equals).
4. **Render seam** (`src/engine/buildPlacements.js`) — the plate's inline zone math is factored into one exported helper, `fieldRoomZonePx(drawnStamps, aspect, canvasW, canvasH)`, used by the plate and the poem alike. When the standing form carries `review.quietZone`, a quiet room is measured beside the plate room: zone from the drawn (review-adjusted) form stamps, reflections inferred from the form items' mirror-key suffixes — the build tail's own facts. The tail is now ONE suppression pass over both rooms: a mark whose footprint enters any zone takes `PLATE_ROOM_ALPHA` once (union semantics), plate partition (plates draw last) unchanged and plate-only. No second suppression path exists. Plate-only behaviour is unchanged by construction and by test (fieldPlate suite green, dense-room numbers identical to #2018: 0.9181 → 0.3022).
5. **Morph** (`src/gl/liveResolve.mjs`) — the review settle gains the room term. At settle start, a quieted stamp computes `roomZones` (plain data) from the standing form via `fieldRoomZonePx(reviewAdjustedForm(form).stamps, …)` plus reflections read off the built items' key suffixes — a pure function of the landing, snapshot-safe. Per frame with raw < 1, the blend's target list pre-scales in-zone non-form marks' alpha by `1 + (1/PLATE_ROOM_ALPHA − 1) × (1 − morphEase(raw))`, so at raw 0 the room is at natural level and at raw 1 the target *is* the raw build; the poem's glyphs glide on slice 3's channel unchanged. The state rides the #1367 snapshot (restore verified identical mid-settle); HELD freezes (the blend runs on `loopTimeMs`), DRAGGING crawls bounded, CUT/joiner/leaver behaviour untouched.
6. **Voice** (`src/curator/fieldReviewVoice.mjs`) — `REVIEW_LADDER = [1,2,3,4,5]` everywhere it is fenced (proposal rung orders, ask context, sanitize). `ACTS[3] = 'Quieted the room.'`; `ACT_WORDS[3] = 'quieted'` (acted records only, mapped to rung 3 alone). The clean-record fence gains the imperative `quiet`. `LEAD_RUNG` unchanged — LOIS's proposal for a covered poem is still the shrink; rung 3 never leads. `proposedOrder` now places 3 in its canonical slot ([1,2,3,4,5]; coverageLow [4,1,2,3,5]; crop [2,1,3,4,5]). **rungOrder is still NOT consumed by the ladder** — slice 3's recorded design note stands, untouched here.

**New suite** `src/curator/fieldReviewQuiet.selfcheck.mjs` (16 checks) + manifest entry: door law · measure fraction recomputed by hand on a synthetic list · plan order · markCover-only applicability · post-re-deal exclusion · seam suppression (unmirrored + mirrored + xy composition) · morph settle of the room (twin-resolver lockstep) · voice · census calibration pins · replay re-derivation.

---

## Measure semantics — the fraction, defended

**Chosen: a suppressed mark contributes `PLATE_ROOM_ALPHA ×` its intersection to M2.** Rejected: excluding suppressed marks (contribution 0).

The spec's M2 is a *visual* fact — "the share of the poem's ink covered by the marks drawn over it" — and the seam's suppression is a visual act: the mark still draws, at 15% alpha. A 15%-alpha mark over a glyph eats 15% as much of the glyph's legibility as the same mark at full alpha; claiming it eats *nothing* (exclusion) would let the ladder pass landings the eye still reads as covered, and would make the trial's verdict disagree with the landed frame the loop exists to judge. The fraction is also the only reading under which the measure and the seam stay one system: the same constant, the same zone (the form's ink bbox + `PLATE_ZONE_PAD_EM` at the largest drawn em), the same footprint test (a mark's ink box entering the zone), read per mirror cluster in the measure exactly as the build tail reflects zones. Draw order still rules (only marks drawn *over* a glyph cover it), and the per-glyph cap is unchanged. No gate constant moved (§3.2 pinned in the new suite).

Empirically the fraction lands the drowned rooms at m2 0.13–0.31 against the 0.5 gate — clear of the gate with margin, not knife-edge: the discount is deep because cover in those rooms is concentrated inside the zone, and the residue is the out-of-zone and over-cap remainder, honestly counted.

---

## Calibration — censuses A + B, before/after

Harness: slice 1's, exact-pinned (same seeds, actions, pinned clock). Slice-3 numbers from STAGING-REPORT-2006-S3.

### Census A — 144 landings, ordinary rooms (seeds 201–260)

| | slice 3 | slice 4 |
|---|---|---|
| clean (unacted) | 133 | **133** |
| repaired | 3 — by rung {2: 2, 4: 1} | **11 — by rung {2: 2, 3: 9}** |
| cut | 8 | **0** |

Per acted landing (landing m2 → resolution; slice-3 fate in brackets):

| landing | m2 | walk (trial m2 per step) | slice 4 | slice 3 |
|---|---|---|---|---|
| seed 227 poem:0 | 0.9375 | 1: 0.986 · 2: 0.909 · **3: 0.310 ✓** | repaired @3 | CUT |
| seed 227 poem:1 | 0.9945 | 1: 1.000 · 2: 0.861 · **3: 0.244 ✓** | repaired @3 | CUT |
| seed 227 poem:2 | 0.9565 | 1: 0.962 · 2: 0.898 · **3: 0.278 ✓** | repaired @3 | CUT |
| seed 227 poem:3 | 0.9806 | 1: 1.000 · 2: 0.904 · **3: 0.275 ✓** | repaired @3 | CUT |
| seed 252 poem:0 | 0.9912 | 1: 1.000 · 2: 0.683 · **3: 0.144 ✓** | repaired @3 | CUT |
| seed 252 poem:1 | 0.9820 | 1: 1.000 · 2: 0.568 · **3: 0.130 ✓** | repaired @3 | CUT |
| seed 252 poem:2 | 0.9859 | 1: 1.000 · 2: 0.716 · **3: 0.156 ✓** | repaired @3 | CUT |
| seed 252 poem:3 | 1.0000 | 1: 1.000 · 2: 0.822 · **3: 0.172 ✓** | repaired @3 | CUT |
| seed 239 poem:1 | 0.5197 | 1: 0.732 · **2: 0.366 ✓** | repaired @2 | repaired @2 |
| seed 239 poem:2 | 0.7374 | 1: 0.673 · **2: 0.338 ✓** | repaired @2 | repaired @2 |
| seed 239 poem:3 | 0.5342 | 1: 0.647 · 2: 0.527 · **3: 0.141 ✓** | repaired @3 | repaired @4 |

**All 8 of slice 3's cuts are saved, every one at rung 3.** The one slice-3 rung-4 repair (seed 239 poem:3 — the only slice-3 repaired landing outside the two rung-2 repairs, by the pinned distributions) now resolves one rung earlier at the quiet, and no re-deal is drawn for it (the deal counter stays honest: seed 227 poem:0's commit now counts 1 deal, not 2).

**Worse outcomes: none.** The 133 cleans are untouched (the ladder never acts on them), both rung-2 repairs resolve identically (same steps, same measures), no landing that slice 3 repaired is cut or pushed later, and no new cut appears. Landing truth underneath is unchanged: slice-1's suite still derives 133 clean / 11 janky, all markCover, from the same measures.

### Census B — 20 landings, mirrored rooms (seeds 301–320, mirror x)

| | slice 3 | slice 4 |
|---|---|---|
| clean | 9 | **9** |
| repaired | 11 — by rung {1: 5, 2: 6} | **11 — by rung {1: 5, 2: 6}** |
| cut | 0 | **0** |

Unchanged, as expected: every mirrored walk stops at rung 1 or 2, so rung 3 is never reached (pinned in the new suite: no census-B adjustment carries a rung-3 step).

---

## New-assumption sweep (the slice moves a hand — everything re-grepped)

| sweep | hits | disposition |
|---|---|---|
| (a) rung-set literals `[1, 2, 4, 5]` & friends, all selfchecks | ladder suite comment recounting slice 3's [1,2,4,5] exhaustion trace (history, kept); voice suite §4 fixture `rungOrder: [1, 2, 4, 5]` | comment is accurate history. The fixture is a *subset* order — still lawful (sanitize fences membership in REVIEW_LADDER, not completeness); test passes unchanged |
| (a) same, `app/e2e/` | none (`rung`/`quietZone`/`fieldReview` absent from every spec) | — |
| (b) alpha/suppression assertions over buildPlacements output | fieldPlate (room's owner — green, dense-room numbers identical), fieldStampPath, rayGun, fieldSilence, kineticSweep, ladder, poemRow | suppression activates only when a standing form carries `review.quietZone`; none of these fixtures carry a review record, so the seam change is inert for them — full sweep green (below) is the proof |
| (c) plate-room / zone assumptions | fieldPlate suite + the new quiet suite | fieldPlate green unchanged; the borrowed seam is asserted *through* the plate's own fixture pattern in the new suite |
| (d) voice templates enumerating rungs outside the review modules | none (no 'Would shrink/shift/deal/cut/quiet' or act lines anywhere else in src/) | — |
| (e) WHO-ACTS grep (the #2022 lesson): suites asserting (i) persistence biconditionals over the poem, (ii) exact deal-counter equalities, (iii) byte-identity over ladder-written forms | poemRow (reconciled in slice 3's CI fix — its law now reads absence/counters through the banked adjustment, which covers rung-3 outcomes: a quieted poem *stands*, so presence holds; counters advance only on re-deals, which rung 3 never draws) | poemRow 10/10 in the dice runs; census A in the ladder + quiet suites pins the one changed counter (227 poem:0: 2 → 1) with the reason stated |

Dice-driven suites touched, 10 consecutive runs each, post-change: fieldReview 10/10 · fieldReviewVoice 10/10 · fieldReviewLadder 10/10 · fieldReviewQuiet 10/10 · poemRow 10/10.

---

## Re-pin ledger (existing suites)

- `fieldReviewVoice.selfcheck.mjs` (34 checks): REVIEW_LADDER → [1,2,3,4,5]; proposedOrder selfOverlap/markCover/coverage → [1,2,3,4,5], coverageLow → [4,1,2,3,5], crop → [2,1,3,4,5]; voiceForRecord + driver rungOrder; ask-context rungSet; the slice-2 pin "rung 3 is not armed yet" inverts (a [3,1] proposal now validates; the out-of-set case moves to rung 6); sanitize's [3]-is-null case becomes [3]-valid + [6]-null.
- `fieldReviewLadder.selfcheck.mjs` (21 checks): §6 voice pins rungOrder → [1,2,3,4,5] (rulesVoice, voiceForRecord, the fabricated cut's voice fixture + sanitize); §7 census A outcomes {repaired 3, byRung {2:2, 4:1}, cut 8} → {repaired 11, byRung {2:2, 3:9}, cut 0}; the seed-227 exhaustion pin is rewritten as the rescue pin (same landing, m2 0.9375 provenance untouched: steps [1,2,3], outcome repaired, `final.quietZone`, poemDeal 2 → 1 with the reason stated); census B gains a comment recording rung 3 is never reached there (numbers unchanged).
- `fieldReview.selfcheck.mjs` (18 checks): census A outcome distribution {clean 133, janky 3, cut 8} → {clean 133, janky 11} — every acted record now keeps its 'janky' judgment (all rescued, none cut); landing-truth pins (133/11, gates, margins) unchanged and still asserted by per-record re-derivation.
- Everything else: untouched. Golden hash and the 560,366/0 census stand outside reviewed landings (sweep below); fieldBattery byte-identical.

---

## Verification

- Slice suites: fieldReview 18/18 · fieldReviewVoice 34/34 · fieldReviewLadder 21/21 · fieldReviewQuiet 16/16 · fieldPlate green · poemRow 16/16.
- Full manifest sweep (continue-on-error over `app/selfcheck.manifest`, 615 entries with the new suite): **612 pass / 3 fail — and all 3 failures are pre-existing sandbox-environment failures, proven base-identical on a clean detached worktree at f55849dc**: `swarmWasm` (cargo not on PATH in this sandbox; its source-hash checks pass, only the cargo verify cannot run — CI carries the toolchain), `fx/rollSafety` (headless-Chromium "Target crashed" in the GL parity driver; fails identically on base, solo and under load), `gl/accum` (native abort, exit 134; fails identically on base). No assertion in any of the three reaches this slice's surface. `goldenPlacement` (the 560,366/0 census + golden hash) and `fieldBattery` pass in the sweep — the standing invariants hold.
- `npm run format:check`: clean (prettier applied to fieldReview.mjs + the two suites it flagged). `npm run lint`: 0 errors; 11 warnings, all pre-existing React-hooks notes in untouched files (App.jsx, FavoritesTray, ShelfView, pipeline rows) — none in this change's files.
- Replay §3.8: seed 227's banked record re-derives bit-for-bit from its landing through `runReviewLadder` (new suite §7); no Math.random/Date.now/performance.now anywhere in the ladder/review/quiet paths (the walk, the measure, the seam, and the morph's zone derivation are pure functions of the commit and the frame clock).

## Notes for QA / open design readings

- **Quiet-only review records refuse at the door** (transform keys mandatory). This follows slice 3's door discipline and the ladder's actual write pattern; if a future rung ever wants a quiet with no standing transform, the door — not the ladder — is where that changes.
- **The morph's mid-settle statistic is the mean, by design.** Morph pairings shuffle individual marks between poses (slice 3's channel law), so per-mark monotonicity is not asserted; the room's *mean* in-zone alpha sits strictly between the un-quieted stage and the raw build at mid-settle, every in-zone mark is below its un-quieted twin, raw 0 is bit-exact, completion is bit-exact, HELD is bit-exact.
- **Validator residue is unchanged in kind:** for unacted records the fences are figures + rung-set + the clean-record fence; past-tense prose on an unacted record is beyond pattern-fencing for every rung (slice 2's documented residue), and slice 4 adds no new fence there — the act-word fence binds acted records, where the claim would contradict the bank.
