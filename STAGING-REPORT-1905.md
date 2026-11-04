# STAGING REPORT — #1905 FIELD S4: room bias, measured + the stillborn gate

Branch `feat/1905-field-s4-room-bias` on origin/main 3e24b14c (post-#1932, post-#1935).
Local commits only — no push, no PR, no merge.

## The contract (issue #1905, verbatim title: "FIELD S4: room bias, measured + the stillborn gate")

1. Room bias made measurable: across seeded room batteries, cool rooms / high keep pressure lean
   held and upright (Greenleaf/Teijo bias), hot rooms lean denser or more fragmented
   (Rosselli/Gibson bias or packing density) — distributions over the battery, not single draws.
2. Stillborn gate: a form that would spawn unreadable under its constraint (overlaps that destroy
   legibility, lines that cannot fit their module, any line failing the charset law) never spawns —
   the deal falls back to silence or re-deals, and the gate's decision is visible in the
   readout/record, never silent.
3. Bias lives in the Director's pick-time choice (the S2 hook); nothing per-frame.
4. NOT in this slice: no new poets, no deck rewrites to chase the bias numbers, no whisper channel.

## Signals — what "room temperature" and "keep pressure" are in this tree

- **Room temperature** = the Director's **intensity level**: directorSense's scalar (max-pooled
  audio / keep-pass velocity / beat / phase-time, decaying when disengaged). It is the exact value
  the live tick already hands the FIELD step as `intensity`. There is no second temperature
  definition in the pick path — the room gains' `temperature` column steers candidates/sway, not
  the poet pick — so the battery measures bias against the intensity level, named as such.
- **Keep pressure** = the **keep/pass velocity**: `normalizeKeepPassVelocity(keepsPerMinute)`
  (keeps-per-minute / 2, saturating at 2 decisions/min) — the same normalized signal the intensity
  tracker max-pools, computed at tick time as `signals.keepPass`. Before this slice the FIELD step
  never received it: `choosePoet` had no keep-pressure input at all, so the spec's
  "high keep pressure leans held" clause was unimplemented (the slow-debt brake is a
  hot-room-history signal, not keep pressure).

## What was built

### Pick-time bias (the S2 hook, completed)

- `curator/fieldDirector.js` — `choosePoet` gains a `keepPressure` input and the named line
  `KEEP_PRESSURE_HIGH = 0.5` (a sustained ≥ 1 keep/pass decision per minute). High pressure brakes
  the pool to Greenleaf/Teijo in any room not already blazing — the #1907 precedence exactly:
  `intensity > 0.65` still deals the hot pool, so pressure never calls a hot room cool. Default 0:
  a caller that does not measure pressure gets today's behaviour, bit for bit.
- `curator/fieldEval.js` — `step` forwards `input.keepPressure` (unmeasured = 0).
- `curator/director.js` — the live tick hands the step `keepPressure: signals.keepPass` (the
  velocity it already computes for the intensity tracker); `dealPoet` reads the last tick's value
  (`lastKeepPressure`, the lastLevel/lastVerdict pattern; reset clears it). Pick time only.

### The room battery (`curator/fieldEval.js` + new suite)

- `roomBattery({ seed, draws })` — six seeded cells (verdict × intensity × keep pressure), each a
  continuous 400-pick session through the real `step`, every dealt decision placed through the
  real deal path (`fieldDealReport`) at rotating aspects {0.6, 1, 10/7, 16/9}. Cells stand in a
  type-native room ('swiss'): the battery measures temperature/pressure bias among eligible
  rooms; the genre gate's measurement stays in fieldSilence.selfcheck.mjs.

### The stillborn gate (`poets/fieldForm.js`)

- `gateFieldForm(stamps, { aspect })` — a pure verdict on a placed form:
  `{ ok: true, reason: 'ok' }` or `{ ok: false, reason: 'charset' | 'fit' | 'overlap', stampIndex }`.
  Ink boxes come from the measured glyph metrics (`placement.glyphWidthEm`): a stamp's ink is
  glyphWidthEm(ch)·em wide and em tall, centred on (x, y).
  - **charset** — a stamp whose assetId is not the letter stamp for its glyph (the charset law,
    A–Z + 0–9). Reachable today: `placePiece` emits stamps with `assetId: null` for unmapped
    characters (measured: 'snow! falls' → 9 stamps, every assetId null) and `fieldFormForDeal`
    counted them toward the poem threshold and dealt the form; the stamp path's sanitize refused
    it downstream, silently. The gate now refuses it at the deal, with the reason attached.
  - **fit** — a stamp crushed below `FIELD_MIN_LEGIBLE_EM` by placement's fit shrink (a line that
    cannot fit its module at a readable size), or ink landing off the dish.
  - **overlap** — two stamps whose ink boxes intersect.
- `FIELD_MIN_LEGIBLE_EM = 0.01`, grounded by measurement (below): the smallest em the shipped
  decks ever deal is 0.0180; the floor is ~55% of it. The battery suite re-measures the shipped
  minimum every run and fails if it ever falls under 1.5× the floor.
- `fieldDealReport(decision, rng, opts)` → `{ form, gate }`: `fieldFormForDeal` is now exactly
  `fieldDealReport(...).form` (parity pinned over 60 seeded decisions in the battery suite), so
  the old door's behaviour is unchanged except that a stillborn deal is refused instead of dealt.
  Order inside the deal: threshold first (a fragment is #1932 silence, not a gate case), then the
  gate (a full poem that is unreadable is a stillborn).
- `sanitizeFieldForm` runs the same gate: a stored form that is stamp-by-stamp honest but jointly
  unreadable (ink off the dish, overlapping glyphs, crushed type) is refused whole at the document
  door too. Honest forms round-trip byte-identical (pinned in fieldStampPath).
- **The record**: both live deal sites (`landPoem`, the CURATOR press) bank the verdict on the
  deal's own commit as the session field `fieldGateRefusal` — `null`, or
  `{ reason, poetId, pieceId }` — in the same commit as the deal, so the record can never disagree
  with what spawned. A spawning deal or plain silence clears it; HOLD passes it by with the form.

## Battery evidence (seed 1905, 400 draws/cell, final tree)

| cell | verdict | int | keep | G | T | R | Gi | silence | cool share | hot share | mean density | mean stamps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cool | AGREEMENT | 0.20 | 0 | 208 | 192 | 0 | 0 | 0 | 1.000 | 0.000 | 0.393 | 26.5 |
| coolKeep | AGREEMENT | 0.20 | 0.8 | 193 | 207 | 0 | 0 | 0 | 1.000 | 0.000 | 0.396 | 26.7 |
| neutral | THE ROOM | 0.50 | 0 | 96 | 97 | 111 | 96 | 0 | 0.482 | 0.517 | 0.454 | 23.0 |
| neutralKeep | THE ROOM | 0.50 | 0.8 | 208 | 192 | 0 | 0 | 0 | **1.000** | 0.000 | 0.392 | 26.6 |
| hot | FULL BURN | 0.85 | 0 | 0 | 0 | 208 | 192 | 0 | 0.000 | 1.000 | **0.502** | 19.6 |
| hotKeep | THE CLASH | 0.85 | 0.8 | 0 | 0 | 198 | 202 | 0 | 0.000 | 1.000 | 0.491 | 19.5 |

- **Temperature**: cool rooms deal Greenleaf/Teijo only; hot rooms deal Rosselli/Gibson only;
  neutral rooms deal all four near-evenly. The distribution difference is total, in the spec'd
  direction. (Baseline on the pre-S4 tree measured the same temperature split — the pool mechanism
  shipped with S2/#1907; S4 makes it a battery measurement and adds the missing axes.)
- **Keep pressure (the new lean)**: before this slice the pressure axis did not exist — a neutral
  room under pressure measured exactly like a neutral room (cool share 0.482, the pressure unread).
  After: the same room under high pressure deals cool poets only (cool share **1.000**, Δ +0.518),
  and a blazing room under pressure stays hot (hot share 1.000 — the blaze outranks the brake).
  Below the line (0.49) the neutral pool stays four-wide (pinned in the suite).
- **Density**: mean dealt density rises with temperature — cool 0.393 → neutral 0.454 → hot 0.502 —
  the spec's "hot rooms lean denser," carried by Rosselli's deck (mean density 0.725) entering the
  pool. Reported plainly alongside: mean *stamp count* falls in hot rooms (19.6 vs 26.5) because
  Gibson's fragments are short — the density axis is the dealt pieces' authored density and
  Rosselli's edge-to-edge packing, not raw glyph count. No deck was touched to make these numbers.

### Gate log (the battery's, final tree)

```
deals=2400 spawned=2400 refused={charset: 0, fit: 0, overlap: 0} stillbornSpawned=0
```

Zero refusals on the shipped decks is the honest result, not a missing test: a full-grid audit
(560 placements — every deck piece × densities {0, 0.25, 0.5, 0.8, 1} × aspects {0.5, 0.6, 1,
10/7, 16/9, 2.6, 3}) finds **0 overlapping ink pairs, 0 ink boxes off the dish, smallest dealt
em 0.0180**. Placement's construction (advances ≥ glyph width + tracking; fit shrink) already
keeps real forms legible — the gate is the refusal layer that makes "never spawns" a checked law
at both doors instead of a construction hope, and it fires on synthetic stillborns:

- charset: 'snow! falls' placed by placePiece → verdict `charset` at stamp 0 (null assetIds).
- fit: a 160-char line at aspect 0.5 → fit-shrunk to em 0.0040 → verdict `fit`.
- overlap: two hand-built stamps 0.02 apart on one baseline → verdict `overlap`.
- document door: sanitizeFieldForm refuses ink-off-dish, overlapped, and crushed (em 0.005)
  variants of a real dealt form; the honest form round-trips.

### Determinism

`roomBattery({ seed: 1905, draws: 400 })` run twice on the final tree → byte-identical JSON
(distributions, gate log, all cells). Pinned as an assertion in the battery suite, alongside the
existing evalLoop determinism pin (fieldEval suite, unchanged).

## Verification (final tree, after the last code change)

- New suite `curator/fieldBattery.selfcheck.mjs` (registered in `app/selfcheck.manifest`):
  **15 checks passed** — distribution pins, the keep lean, the blaze precedence, the threshold
  pin, density, the gate log, the three synthetic stillborns, the document door, the 560-placement
  grid audit with the floor grounding, deal-door parity, battery determinism.
- FIELD/director/state families re-run by file, all green, **zero re-pins**:
  fieldDirector 11/0 · fieldEval 6/0 · fieldSilence all · fieldLiveDeal 9 · placement 560,366/0 ·
  poemRow 13 · fieldStampPath all · director 14 · directorDebt 5 · directorPresence 5 ·
  directorRank 12 · directorRoom 7 · directorSway 10 · phase 8 · queenChannel 13 ·
  queenDeniability 7 · refineMutate ok · fieldDeal 5 · kineticScope ok · kineticSweep ok ·
  firewall OK · layersPlusPattern ok · swayMark 9 · light OK · surge ok · clock.inventory fail 0 ·
  shiftLayer all.
- One near-miss, resolved without a re-pin: director.selfcheck's scheduler-reference allowlist
  scan counts whole-identifier prose mentions; my first-draft comments named the sense module by
  its file identifier in fieldDirector.js / fieldEval.js / the battery suite. Reworded to
  "the sense module" (meaning unchanged) — the allowlist itself is untouched and the suite
  passes 14/14 on the final wording.
- `npm run format:check` — clean (prettier applied to the two files that needed it).
- `npm run lint` — 0 errors, 11 warnings, none in touched files (pre-existing).
- `npm run build` — built.
- Full manifest sweep (continue-on-error over all 586 manifest lines, final tree):
  **584 pass / 2 fail**. Both failures are environmental and **base-identical** — each was
  re-run on a pristine origin/main (3e24b14c) checkout and fails the same way there:
  `engine/kernel/bake/swarmWasm` (cargo not on PATH in the sandbox — no Rust toolchain) and
  `fx/rollSafety` (Playwright "Target crashed" inside the GL parity driver; it crashed again on
  a quiet re-run of the final tree and on the base checkout alike). CI's selfcheck-browser job
  (pinned browser, Mac runner) is authoritative for both.
- e2e: no spec references FIELD surfaces (`grep fieldForm|poem|fieldGate e2e/` = no hits); no
  e2e change in this slice.

## NOT done (per the contract)

- No new poets, no deck edits — the bias numbers above are the shipped decks measured, not tuned.
- No whisper channel (S5). No UI surface reads `fieldGateRefusal` yet — it is a record, banked
  for the readout whenever Matt wants it shown; wiring it into the poem row is a feel call.
- No per-frame anything: the gate runs at deal time inside the existing deal path.

## Files

- `app/src/curator/fieldDirector.js` — KEEP_PRESSURE_HIGH + the keep-pressure brake in choosePoet.
- `app/src/curator/fieldEval.js` — step forwards keepPressure; BATTERY_CELLS + roomBattery.
- `app/src/curator/fieldBattery.selfcheck.mjs` — NEW suite (manifest-registered).
- `app/src/curator/director.js` — tick/dealPoet hand the step the room's keep pressure.
- `app/src/poets/fieldForm.js` — FIELD_MIN_LEGIBLE_EM, gateFieldForm, fieldDealReport;
  fieldFormForDeal delegates; sanitizeFieldForm runs the gate.
- `app/src/state/slices/layoutSlice.js` — fieldGateRefusal record; both deal sites bank it.
- `app/selfcheck.manifest` — +1 line (the battery suite).
- The tracked repo-root `STAGING-REPORT.md` is NOT touched (it belongs to an earlier issue).
