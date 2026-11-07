# STAGING REPORT — #2006 slice 3: the ladder acts

**Branch:** `feat/review-loop-ladder-2006` · **Base:** origin/main `9ebbb317` (slices 1+2 merged via PRs #2019/#2021, plate fix via #2020) · **Scope:** §4 slice 3 only — the loop gets its hand. On a JANKY fresh-landing verdict it now ACTS: ladder rungs 1 SHRINK, 2 SHIFT, 4 RE-DEAL, 5 CUT (rung 3 QUIET does not exist until slice 4), delivered as ONE planned Sleight-of-Hand morph. No push, no PR — staging for coordinator QA.

Spec: `goals/kinetic-curator-generative-art-instrument/files/design/poem-type-review-loop-spec-2026-11-06.md` (§3.5 the ladder, §3.6 the rungs, §3.8 replay/determinism). Rulings honoured: D1 fresh landings only · D2 the loop may CUT · D3 plates exempt · the Sleight-of-Hand amendment (one planned ~1s morph; a CUT settles by the same grammar).

---

## What shipped

| File | Change |
|---|---|
| `src/curator/fieldReviewLadder.mjs` | NEW — the acting loop: `runReviewLadder`, the rules table, the bounds (`REVIEW_SHRINK_FACTOR = 0.8`, `REVIEW_MORPH_MS = 1000`). |
| `src/curator/fieldReview.mjs` | `measureLandedForm` honours the form's `review` scale (see Premise translations); new export `landingMarkBoxes` (the marked room, shared with the ladder). |
| `src/poets/fieldForm.js` | The form gains a fail-closed `review` record (the door); new exports `fieldFormInkBBox`, `reviewAdjustedForm`. |
| `src/engine/buildPlacements.js` | The FIELD block draws `reviewAdjustedForm(form)` when the record stands; byte-identical otherwise. |
| `src/state/slices/layoutSlice.js` | `bankLadder` wraps the ladder fail-closed inside both deal commits (`landPoem`, the CURATOR press); `cyclePoemRaygun` deletes `review` when arming (performer supersedes). |
| `src/engine/kernel/itemMorph.mjs` | NEW export `planMorphByKey` — identity-key pairing for the settle morph; existing exports untouched. |
| `src/gl/liveResolve.mjs` | The review-morph channel: keyed settle from the janky pose (or joiner/leaver for re-deal/CUT), sim-clock raw, #1367 snapshot gains an OPTIONAL `reviewMorph` key. |
| `src/gl/liveLoop.mjs` | Stamps `input.reviewMorph` from the standing record's adjustment while it stands. |
| `src/curator/fieldReviewVoice.mjs` | The voice learns the past tense: acted and cut verdicts speak what the loop DID; the validator fences the act words. |
| `src/curator/fieldReview.selfcheck.mjs` | Two documented re-pins (see Re-pin account) — slice 1's suite grows up to slices 1–3 law. |
| `src/curator/fieldReviewLadder.selfcheck.mjs` | NEW suite, 21 checks, manifest-registered. |
| `app/selfcheck.manifest` | +1 line (the new suite), after slice 2's suite. |

---

## The acting rules table (as built)

The ladder runs **synchronously inside the deal commit** — the two commits that bank a fresh landing (`landPoem`, and the CURATOR press's inline landing in `curateUnlocked`). It is wrapped by `bankLadder`, fail-closed exactly like `bankReview`: any throw, any null, any non-plain outcome → the landing banks exactly as slices 1–2 left it. It acts ONLY when the fresh record is `verdict: 'janky'` with measures — never on clean, never on exempt (plates, treated, kept/held), never on the performer's own re-deals (those never bank a review), never on swarm landings, never twice (a form already carrying a `review` record is refused).

| Step | Law |
|---|---|
| **Plan** | Slice 2's `proposedOrder(landing record)` — the lead rung for the FAILING GATE first, then [1, 2, 4, 5] minus the lead. Fixed at planning; the ladder cannot improvise an order. Rung 3 is absent (slice 4). |
| **Applicability** | Re-judged per rung against the CURRENT failing gate (the gate of the latest re-measure): SHRINK applies to {selfOverlap, markCover, coverage, crop}; SHIFT to {selfOverlap, markCover, crop}. A rung whose gate set no longer contains the failing gate is skipped silently — the plan is an order, not a script. |
| **Stop** | The moment a re-measure comes back clean, the ladder stops. The resolving rung is recorded (`record.rung`); every later rung never runs. |
| **Rung 1 · SHRINK** | The form's `review.scale` steps ×0.8 (cumulative across… one step only in this slice — see bounds). |
| **Rung 2 · SHIFT** | Candidates: the dish centre + the three lowest mark-density centres of a 4×4 dish grid (see Premise translations). Each candidate is clamped so the ink stays on-dish, then **re-measured**; the first clean candidate wins; else the candidate with the lowest failing-measure ratio wins **only if it beats standing still** — a shift that helps nothing is a step on the record with the state unchanged. |
| **Rung 4 · RE-DEAL** | Exactly ONE fresh deal through the caller's real deal path (see Premise translations), avoiding the piece it replaces. The new landing is reviewed once, then rungs 1–2 may act on IT (rung 4 never recurses). Silence or refusal fails the rung. |
| **Rung 5 · CUT** | On exhaustion: the form leaves with the deal commit — the same silence a gate refusal lands (D2). The record's verdict becomes `'cut'`, rung 5. |
| **Fail-closed trials** | Every trial re-measures through `reviewLanding` on trial params — never a projection. A trial that returns null or an exempt record aborts the whole ladder (the landing banks untouched). |

### Bounds (named constants, the spec's ruled amounts)

- SHRINK: `REVIEW_SHRINK_FACTOR = 0.8` per step, applied to the form's `review` transform (cumulative product; the ladder runs the rung once per plan — a second shrink would be a second plan, and there is none).
- SHIFT: candidate centres are dish-grid points; the applied shift is whatever the winning candidate's clamped centre requires — bounded by the dish itself (ink fully on-dish, `|dx| ≤ aspect`, `|dy| ≤ 1` enforced again by the form door).
- RE-DEAL: one deal, one review, rungs 1–2 only afterwards. The deal counter advances for every deal that lands (see Bugs).
- CUT: once, terminal.

---

## The form `review` record (the door)

`sanitizeFieldForm` carries an optional `review: {scale, dx, dy}` — fail-closed: finite numbers, `0 < scale ≤ 1`, `|dx| ≤ aspect`, `|dy| ≤ 1`, and **refused when the form carries raygun or plate** (the poles never mix; a treated form is exempt by construction). Absent → sanitize output is byte-identical to slices 1–2. `reviewAdjustedForm(form)` scales every stamp about the ink-bbox centre and adds the shift (em × scale); identity (`scale 1, dx 0, dy 0`) returns the form itself. The adjustment lives IN the form, so it rides takes, keeps, and replay through the standing form door — no new serialization surface.

Performer precedence: arming RAY GUN on a repaired poem **deletes** the `review` record (`cyclePoemRaygun`) — the performer's treatment supersedes the loop's repair and is not restored on cycle-back. The whisper toggle is alpha-only and composes untouched. KEEP banks the form with its record (a kept repaired poem stays repaired); HOLD carries it untouched (bedrock is never re-adjusted).

## The adjustment record (what banks)

The landing's record keeps its landing truth — `measures`, `gate`, `gates`, `seed`, `stream` are the LANDING's, never rewritten by the repair. The verdict stays `'janky'` when repaired (the landing WAS janky; the repair is history, not a rewrite) and becomes `'cut'` only on exhaustion. `rung` names the resolving rung (5 on a cut, null when unacted). New, **absent when no action** (clean/exempt records byte-identical to slices 1–2):

```js
adjustment: {
  plan: [1, 2, 4, 5],                    // the gate-aware order that ran
  steps: [{ rung, review, measures, verdict }],  // one per ATTEMPTED rung, post-rung re-measure
  outcome: 'repaired' | 'cut',
  final: { scale, dx, dy } | null,       // the form transform that stands (null on a cut)
  redeal: { stream, poetId, pieceId } | null,    // the ladder's own re-deal, named as such (D1)
  morph: { seed, dur },                  // the Sleight-of-Hand plan — dur = REVIEW_MORPH_MS
}
```

A failed shift records its step with the state unchanged; a failed re-deal records `{rung: 4, review: null, measures: null, verdict: 'janky'}`. The record therefore holds EVERYTHING the loop did and measured — and, by §3.8 below, everything needed to replay it.

### §3.8 — replay / determinism (the seam slice-2 QA flagged)

The spec's §3.8 contract, honoured literally: **a take replays form, adjustment, verdict — the loop does not re-run live on a replay.** Two mechanisms, one per layer:

1. **The record re-derives through the commits.** Replay re-runs the same deal commits; the ladder is a deterministic pure function of (state, landing params, landing record, seed) with its deal path injected — same commits in, same adjustment out, **zero live consultations** (no backend, no clock, no dice beyond the recorded streams). The new suite pins this: the same press re-derives the banked record bit-for-bit, and the ladder called twice on the same landing returns deep-equal outcomes.
2. **The settle replays per §6.** The morph is not stored as frames; it is the recorded `morph: {seed, dur}` plus the resolver's snapshotted channel state (`reviewMorph` rides the #1367 snapshot as an OPTIONAL key, validated only when present — old snapshots restore exactly as before). Restoring a snapshot mid-settle continues the same settle; the suite pins geometry-identical continuation.

## rungOrder consumption: NOT consumed in this slice — stated plainly

Slice 2 banks `voice.rungOrder` (the Mind backend's proposed order) **asynchronously, after** the commit banks. The ladder must decide **synchronously inside** the commit, because the commit is the unit of replay: an adjustment that depended on a value written after the commit could not re-derive on replay (§3.8), and a take would carry a repair its own log cannot reproduce. So this slice acts on the rules table alone (`proposedOrder`, the deterministic gate-aware order). Slice 2's proposal remains what it was designed as — the VOICE's ordering, spoken in the verdict — and the rules-table validation the brief requires is satisfied trivially: no model order reaches the hand in this slice. **Owed:** if a future slice wants the backend's order to steer the hand, the order must bank BEFORE the acting commit (a two-phase deal) or ride the deal's own seed stream — either is a spec conversation, not a silent wiring.

## The morph (Sleight-of-Hand delivery)

One plan, never a sequence of snaps. When an acted record stands, `liveLoop` stamps `input.reviewMorph {key, seed, dur, review}` (key = `seed|stream`, dur = `REVIEW_MORPH_MS` = 1000 ms of SIM time). The resolver's review channel:

- **From-pose:** for a standing repaired form, the glyphs' JANKY pose is recomputed exactly — the inverse of `reviewAdjustedForm` applied per glyph (mirror copies invert about their mirrored centre with negated shift, because `mirrorItems` reflects x as W−x and y as H−y). For a re-deal or a CUT there is no standing janky form: the previous frame's shown items pair by key — joiners (the new deal) and leavers (the cut poem) by the standing grammar.
- **Pairing:** `planMorphByKey` pairs items ONLY by identical form key (`field-<poetId>-<pieceId>-<j>` + mirror suffixes); unkeyed items fall through to the standing `planMorph` pool with slots translated to the full list; choreography is `choreoPlan` over the full to-list. Existing morph behaviour is untouched.
- **Blend:** `blendItems(from, to, morphEase(raw))` with `raw = (loopTimeMs − startMs)/dur` — the sim clock, so **HELD freezes the settle mid-flight and DRAGGING crawls it**, bounded by the same presentation law as MIX. The settle plays **once per landing** (played set, cap 64 FIFO).
- The recorded `adjustment` holds only `{seed, dur}` — "one morph plan" is a property of the record, and the suite pins that no intermediate rung states exist in it.

## The voice learns the past tense

`fieldReviewVoice.mjs`: an acted janky record speaks gate clause + the act that resolved it ("Shrunk it." / "Shifted it back." / "Dealt it again."), rungOrder = the plan that ran. A `'cut'` record speaks gate clause + "Cut it." The validator enforces the telling: any `rungOrder` on an acted/cut proposal is dropped (it DID, it doesn't propose); `/\bwould\b/` (the hypothetical mood) drops an acted proposal; and an **act-word fence** allows only the RESOLVING rung's verb (shrunk/shifted/dealt/cut) — a voice may not claim an act the ladder didn't finish with. `reviewAskContext` offers no rung set and no lead rung for acted/cut records. The live driver needed no change (its key already includes the verdict; `'cut'` falls to the LOIS branch — silence's judge delivers the cut's verdict). Slice 2's suite: **34/34 green, unchanged.**

---

## Calibration census (spec §4 — the mirror question)

The pinned-time census machinery from slices 1–2, run through the full store (deals → review → ladder → banks), seeds and passes identical to slice 1's census so the numbers are comparable:

**Census A — ordinary rooms** (seeds 201–260 × press/look/voice/curator/voice, 144 landings):

| Outcome | Count |
|---|---|
| Clean at landing (unacted) | 133 |
| Janky at landing | 11 (all markCover) |
| → repaired | **3** — rung 2 ×2, rung 4 ×1 (all seed 239; landing m2 0.520 / 0.737 / 0.534) |
| → cut | **8** — seeds 227 ×4, 252 ×4 (landing m2 0.938–1.000) |

**Census B — mirror rooms** (mirror 'x', seeds 301–320, press only, 20 landings):

| Outcome | Count |
|---|---|
| Clean at landing | 9 |
| Janky at landing | 11 (markCover at the structural floor m2 = 0.5000000000000004, + selfOverlap up to m1 0.343) |
| → repaired | **11** — rung 1 ×5, rung 2 ×6 (shrink pulls the mirrored twins apart: m1 0.343 → 0.219; shift separates fully, m1 → 0) |
| → cut | **0** |

**Finding: the ladder does NOT hate mirrors — the opposite.** Every mirrored janky landing repairs, most at the cheapest rung. The cuts concentrate in *drowned unmirrored rooms*: at landing m2 ≥ 0.94 the poem is under a near-total mark field, and the re-measures show why no poem-side rung can save it — shrink can even WORSEN m2 there (0.938 → 0.986: the marks don't shrink, the ink's share of them does… the cover ratio is measured against the poem's own ink footprint), shift improves but never below ≈0.57, and the ladder's re-deals land at m2 0.95–1.00 in the same room. The jank is a property of the ROOM, not the poem.

**Decision: NO gate tuning in this slice.** The spec's calibration allowance (§3.2) makes the gates "tunable census-calibrated constants" — *"calibrate them against a seeded census of real deals… tune by ear after. No threshold below is presented as measured truth"* — but it names no acting-path-only gate, and the brief's condition is explicit: the shadow verdict gates do not move without explicit spec cover, and an acting-path-only gate would BE a second, hidden verdict gate. Inventing one here would let the loop quietly judge by different law than the shadow record it extends. **Surfaced for Matt / a spec amendment instead:** the drowned-room cut rate (8 of 19 janky landings across both censuses, all at m2 ≥ 0.94) is the number to rule on — options the spec already foresees: rung 3 QUIET (slice 4; §3.6's rung-2 exit reads "else rung 3 (or 4, pre-#2005)"), which quiets the ROOM rather than judging the poem harder, is the designed answer and arrives next slice.

Landing measures are untouched by the slice, proven by slice 1's suite: census A margins identical to the slice-1 record (m1 max 0 · m2 max 1.0 · m3 0.0292..0.0548 · m4 max 0).

---

## Premise translations (verified on this tree)

1. **§3.6 rung 4 says "landPoem with avoidPieceId" — built as a closure over the same machinery, not a recursive call.** A literal recursive `landPoem` would draw at the SAME deal index n (the counter advances only in the outer commit), re-drawing the identical stream and "repairing" the poem with itself. The closure draws the real deal path at the next index — `dealPoet` at `POEM_PICK_BASE+(n+1)` with `avoidPieceId` = the replaced piece, `fieldDealReport` at `POEM_PLACE_BASE+(n+1)` — preserving every `landPoem` invariant (gate-refusal silence, exempt plate path, the press path's own index discipline mirrors `redealPoem`'s). The re-deal is the loop's repair act, recorded as such in `adjustment.redeal` (D1 permits exactly this).
2. **§3.6 rung 2's "lowest-collision region" → a density grid over the REAL marks.** `landingMarkBoxes` (new export in fieldReview.mjs) returns the marked room in form units; the ladder scores each candidate centre by mark-box area under the form's ink footprint. Dish centre first (the ruled step "toward the dish"), then the three quietest grid centres, each honestly re-measured before it may win.
3. **`measureLandedForm` measured the form at FULL SIZE even when a `review` transform stood** — item centres already carry the shift, so the ladder would have re-measured a phantom. Ink extents now scale by `form.review.scale`. This is a measure-honesty fix, not a gate change: with no `review` record the extents are bit-identical (census margins above prove it).
4. **Channel ordering:** the chip-morph loop overwrites the resolver's last-shown cache before the review channel reads it, which lost a CUT's from-pose (it exists only in the previous frame). The channel now reads a dedicated `reviewMorphPrev` stash the chip loop fills whenever a settle stamp is present.

## Bugs found and fixed (mine, during the build)

- **Counter honesty (spec-critical):** on a cut AFTER a landed re-deal, `poemDeal` didn't advance past the re-deal — the next pass re-drew the re-deal's stream and two landings shared the name `poem:1` (observed directly: seed 227's chain repeating piece t4). §3.6 rung 4: "The deal counter advances (recorded in the verdict record)". Fix: the ladder returns `redealt`; both commit paths advance the counter past a landed re-deal regardless of outcome. Pinned in the new suite (census A seed 227: `poemDeal` 2 after the cut commit, `adjustment.redeal.stream === 'poem:1'` ≠ the landing's `poem:0`; stream uniqueness asserted per seed across the whole corpus).
- **The CUT from-pose loss** (premise 4 above) — found by the suite's CUT test (0 form items at raw 0, expected 25), fixed by the stash.

## Re-pin account

**Two re-pins, both in slice 1's suite (`fieldReview.selfcheck.mjs`), both commented in-file, both because slice 3 CHANGES THE LAW the pin stated — no other suite moved:**

1. `rederive()` stated slices 1–2 law ("the record re-derives from the landing"). Under slice 3 an acted record's verdict can be `'cut'` and its `rung` names the resolver. Amended to slices 1–3 law: for acted records the banked measures still re-derive the LANDING's `'janky'` verdict at the same gate, `rung` === the last adjustment step's rung, and cut ⇔ rung 5 + verdict `'cut'`; exempt records still assert rung null.
2. Census A distribution pin `{clean: 133, janky: 11}` → `{clean: 133, janky: 3, cut: 8}` — that IS the slice's outcome distribution (3 repaired records keep verdict 'janky'; 8 became 'cut'). A landing-truth assertion was ADDED alongside (records with verdict janky-or-cut === 11) so the pin still proves the landing census didn't move.

Census B pins in slice 1's suite are **unchanged** (its distribution counts verdicts at landing level the same way, and every mirror repair keeps verdict 'janky'). Slices 1+2 suites otherwise green unchanged: fieldReview **18 checks** (slice 1's count, re-pins above), fieldReviewVoice **34/34**.

**Zero-impact pins unmoved:** placement census **560,366 passed / 0 failed** · golden hash **e892d112b20d92b6…** · fieldBattery replay byte-identical (15 checks). The census fixtures measure DEALS; the ladder acts after a deal lands, and non-FIELD paths never see it.

## New suite — `fieldReviewLadder.selfcheck.mjs` (21 checks)

Per-gate plans + the walk law · ladder refusals (unmeasured/clean/already-adjusted) · stop-on-clean with honest re-measurement (independent `reviewLanding` re-derivation at the resolved transform, seeds 301/302) · one-re-deal bound (counting stub) and silence-fails-the-rung · HOLD byte-identity · performer re-deal immunity · raygun supersedes / whisper composes · the form door · buildPlacements application exactness + removal restoring byte-for-byte + marks untouched · keyed pairing law · one-morph-plan record shape · the settle (raw 0 = the janky pose exactly, raw 1 = landed, HELD freezes, plays once) · CUT as leavers · snapshot optional-key + mid-settle restore continuation + tamper refusal · replay bit-identity + ladder determinism · acted + cut voice (past tense, validator fences) · both calibration censuses with the ladder's law asserted over every landing (plan order, rung uniqueness, rung-4 ≤ 1, rung = last step, cut ⇒ last step 5, per-seed stream uniqueness) and the seed-227 exhaustion pin.

## Verification

- New suite: **21/21**. Slice 1: **18/18** (two re-pins above). Slice 2: **34/34**.
- Placement census 560,366/0 · golden `e892d112b20d92b6…` · fieldBattery 15, replay byte-identical.
- `npm run format:check`: clean (prettier --write applied to 3 touched files). `npm run lint`: 0 errors (11 warnings, all pre-existing in untouched files); eslint silent on every touched file.
- e2e/ greps: `fieldForm` — no hits; `review` — prose comments only ("review picture", PR-review notes); no selector or data-string collision with the new form key.
- Full manifest sweep (continue-on-error over all 614 suites): **610 pass / 4 fail — every failure proven environmental or contention, none a regression:** `swarmWasm` (no Rust toolchain in the sandbox: "cargo not found on PATH"; nothing in rust/** touched) · `rollSafety` (fails IDENTICALLY at base `9ebbb317` in a fresh detached worktree — same headless-render harness error at the same check) · `accum` (aborts natively, exit 134, at base `9ebbb317` in the same fresh worktree) · `poemRow` (**16/16 green** run alone — its sweep failure landed while a stray parallel browser process from an earlier probe was competing for the sandbox). CI's selfcheck-browser job (pinned browser, no contention) remains authoritative for the three environmental suites, exactly as slices 1–2 recorded.

## Named limitations / owed

- **rungOrder not consumed** (above) — the backend's order cannot steer the hand until it can bank before the acting commit.
- **Drowned-room cuts** (calibration) — surfaced with numbers; rung 3 QUIET (slice 4) is the spec's designed answer. If Matt wants a different law for m2 ≥ 0.94 rooms, that's a ruling, not a builder's tuning.
- The settle's from-pose for a REPAIRED poem is exact (inverse transform). For a re-deal the from-pose is the previous frame's shown items, so a re-deal landing in the same frame as a HELD→running edge settles from the last shown pose — the standing morph channels share this property.

## CI fix pass (PR #2022, selfcheck-browser) — poemRow reconciled to slices 1–3 law

**Failure.** CI's selfcheck-browser run failed `poemRow.selfcheck.mjs`. Reproduced locally at ~1 in 6 runs (2 of the first 6), always the ruling-1 biconditional: e.g. `chaos press 0: poem absent ⟺ landed family swiss is type-native`. The failing press index varies — the KINETIC press path rolls live dice. The suite passes 8/8 at base `9ebbb317`.

**Diagnosis (verified by probe, not inferred).** The invariant was written for the #1932 GATE: a poem stands ⟺ the landed look's family is type-native. Slice 3 gave the loop a hand inside the deal commit: a type-native landing judged janky can be CUT by the ladder (ruling D2), lawfully leaving no poem. A probe driving the suite's own fixture confirmed every type-native absence carries the explanation in the banked record — `fieldReview.verdict === 'cut'`, `adjustment.outcome === 'cut'`, rung 5 — and every counter overshoot was exactly the ladder re-deals banked during the presses (poemDeal 9 = 8 presses + 1 re-deal, never unexplained). The ladder behaves as ruled; the suite's law was stale. No ladder code changed in this pass.

**The reconciliation (poemRow only, ruling-1 block + one sibling block).**
- *Presence:* a poem stands ⟺ type-native AND not cut. When the family is type-native and no poem stands, the block now asserts the banked record IS the explanation (verdict 'cut' with `adjustment.outcome === 'cut'`); absence without a cut record fails, exactly as before. The correspondence the tracking relies on is landPoem's own law: the counter advances past a re-deal ⟺ `acted.redealt` ⟺ the standing record carries `adjustment.redeal`, and a silence landing banks `null` (never a stale record), so per-press reads cannot double-count.
- *Counter:* both `poemDeal === 8` assertions (voice section and look/curator/chaos section) now expect `8 + (ladder re-deals banked during those presses)`, tracked off each press's standing record. The assertions still prove every press advanced the stream at least once and no deal went uncounted.
- *Door fixed-point (found by this pass's own repeated runs — same stale-law class, byte form):* the HOLD-under-undo block asserted a dealt form is a `JSON.stringify` fixed point of `sanitizeFieldForm`. A repaired form carries the `review` transform; landPoem writes it as `{ ...form, review }` (review key last) while the door rebuilds in canonical key order (review before stamps) — values identical, bytes differ (~6% of look presses: 18/300 probed, all janky→repaired). The assertion now states the door's law as value equality — the door neither refuses the form nor alters any value — the same form fieldBattery and fieldKana already use (`deepEqual`). Nothing about the ladder's construction changed.
- Header comment and in-block comments mark both re-pins as slices 1–3 law. Every other assertion in the suite is untouched.

**Sibling audit** — every selfcheck grepped for the two shapes the hand invalidates: (a) exact `poemDeal` equality after KINETIC presses/deals; (b) a dealt form persisting / byte-equalling after a press or deal without consulting the review record (including wholesale `layoutParams` JSON equality across a deal and `sanitizeFieldForm` fixed points).

| Suite | Hit | Verdict |
|---|---|---|
| poemRow | (a) ×2, (b) biconditional + door fixed-point | **Reconciled** (above). 25/25 consecutive runs after the fix (pre-fix: 2 fails in 6; after the ruling-1 fix alone: 1 fail in 12, at the door block) |
| fieldDeal | (a) `poemDeal === deal + 1` after one unheld voice pass | Not exposed — probed in its exact scenario state: the voice pass lands **clean 200/200** (its sparse initial stage has no mark field for the cover gate to bite on, so the ladder never engages; the +1 is exact by scenario, not luck). Suite 35/35 across the audit |
| fieldReview | (a) `poemDeal === 1` in the fail-closed block | Cannot act — the scenario poisons the review path, the record banks `null`, and the ladder is gated on a banked janky record. 5/5 |
| fieldReviewVoice / fieldReviewLadder | record-relative reads; the ladder suite pins the counter law itself (seed 227) | Already law-current. 5/5 each |
| rayGun | (a) `poemDeal === 0` after taps; (b) form equality across taps and a performer re-deal | Taps deal nothing (no landing, no ladder); performer re-deals run `review: false` and are never reviewed or acted on (D1). 13/13 |
| poemRow HOLD / register blocks | (a) `poemDeal === 0` | Held poems draw nothing and are never landed — the ladder acts only on fresh landings. Inside the 25/25 |
| fieldPlate | (b)-adjacent (form equality after a tap attempt) | Plates are exempt by ruling; taps don't deal. 8/8 |
| fieldSilence, fieldBattery, fieldLatin, fieldKana, fieldKanji, fieldStampPath | none in the store | Pure form/placement path suites — verified none of them touch `useStore`; the ladder lives only in store deal commits, so it is unreachable there. fieldBattery's round-trip law already uses `deepEqual`. 13/13, 6/6, 13/13, 2/2, 2/2, 2/2 |
| fieldLiveDeal | none | Pure `dealPoet` distribution suite: no store, no form, no counter. 7/7 |
| directorRoom | none | Pure Director-room functions; asserts no poem presence or deal counts. 13/13 |
| kineticScope, kineticSweep | (b)-adjacent | Both filter `fieldForm` out of their axis diffs by design; kineticSweep's standing poem comes from performer `redealPoem` (`review: false`). Its known #1822 LOOK flake (~1.5%) is pre-existing and unchanged in character. 13/13 each |
| refineColor, kernel/replay inputLog | wholesale layout equality / fixture data | refineColor's compared step deals no poem; inputLog asserts on synthetic fixtures, not live deals. No exposure |
| all remaining suites | no hits | Neither shape asserted anywhere else (grep over every `*.selfcheck.mjs` for `poemDeal`, `fieldForm`, sanitize fixed points, and wholesale layout equality) |

**Verification on the fixed tree.** poemRow 25/25 consecutive. Slices 1–3 suites green (18/18, 34/34, 21/21); fieldBattery 15/15; golden hash `e892d112b20d92b6…` unmoved; placement census 560,366/0 (pinned in slice 1's suite). `format:check` clean on the touched file; eslint silent. Files changed by this pass: `app/src/poets/poemRow.selfcheck.mjs` + this report. No production code touched.
