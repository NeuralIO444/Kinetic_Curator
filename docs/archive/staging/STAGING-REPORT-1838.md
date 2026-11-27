# STAGING REPORT — #1838: ACCUM as memory, rung 2 slice 3 — the sign flip

Branch `feat/accum-sign-flip-1838` off origin/main `8827c197`. Committed LOCALLY only —
no push, no PR, no merge (Matt's review lane; he merges).

**The ruling this build executes (Matt, 2026-11-10, recorded on the issue): fresh light
ATTRACTS.** The issue title's "fresh-light avoidance" framing is superseded by that ruling —
cited here, not re-litigated. A second creature type was NOT ruled; this build is moth-only.

## What shipped

The moth's one trail drive (slice 2's ember drive, `app/src/engine/emberDrive.mjs`) gains its
fresh-light pole. One drive, two poles, one step — never two drives:

- **The fresh window** (`freshWindow`): a cell's light is FRESH from just-laid (t = 0) to the
  ember window's near edge (`EMBER_FRESH_T`, ≈0.5 s of show time), falling linearly. The two
  windows tile the age axis — fresh, then ember, then paper, never two at once — read through
  one shared age door (`cellAgeT`): true ages when the grid carries them, the spectral b/g
  proxy when it does not, exactly the ember pole's two surfaces. Grid accuracy, the coarse
  32×22 read surface, frame-stamped staleness: all slice 1's, untouched.
- **Where the sign lives:** on the look's declaration. `trailFresh` is a new top-level field
  on the look record in `app/src/data/presets.js` (look data, never a layout param, so it
  cannot diverge a replay), read by the new resolver `trailFreshWeight(id)` — SIGNED,
  clamped −1..1, undeclared/unknown/malformed = 0 (pole off). **DUSK FLOCK** — the one look
  that declares the drive — now declares `trailFresh: 0.6` beside its `trailEmber: 0.6`:
  positive, SEEK, per the ruling. A look may declare negative to flee; none ships doing so.
- **How Davis declares it per look:** the same surface as slice 2 — the look record itself.
  The performer-facing surface stays the look data; no new panel, no param.
- **The combined step** (`trailSteerStep` + `trailDriveField`): when the fresh pole is
  declared, the moth steers on ONE combined field — per cell, `emberWeight × ember +
  freshWeight × fresh` (the flee case puts fresh cells below the paper, so climbing the
  field flees them). Slice 2's machinery throughout: same sensor reach (±2 cells), same
  leash (5 cells), same speed cap; the step scale is the drive's standing weight
  W = max(ember, |fresh|) and the gradient reference scales with it. **When the fresh pole
  is undeclared, the builder calls slice 2's `emberSteerStep` verbatim** — ember-only takes
  replay bit-for-bit, and every pre-slice input shape is unchanged.
- **Fresh light never grazes.** Grazing (hold position on food underfoot) is the ember
  pole's alone. Physical basis, from the buffer itself: the age pass resets a covered
  pixel's age to 0 every frame (gl/accum.mjs mode 1), so a standing moth's own cell is
  perpetually fresh — an underfoot fresh graze would pin a moth wherever it first stood,
  and a moth that reached fresh light would camp on it forever, self-lit. The fresh pole is
  read only at the sensors, ahead of the body (the Physarum shape the parent issue cites).
  No slope + nothing to graze → slice 2's relax-home fallback; that return is the fresh
  pole's damping. In a static grid a seeking moth holds station at the light in a
  sub-pixel limit cycle at the peak cell's edge (measured ±0.3 px); in the ageing live
  buffer the perch dissolves with the light.
- **The live wire:** `liveLoop` stamps `trailFresh` on the resolver input only while the
  feed is live and only when declared (either pole now makes the feed live); an ember-only
  take carries exactly the slice-2 input shape. The governor's rung (cut 1.48) sheds BOTH
  poles and now activates for a fresh-only look too; its badge/label were renamed
  "ember steering held" → **"trail steering held"** / "TRAIL STEERING HELD — moths keep to
  their pins" (the old wording would under-report a fresh-only look's shed).

## Reconciliation with the parent design

The parent issue caps a creature type at ONE trail-drive whose fresh component is signed.
Slice 2 shipped the ember pole as an unsigned standalone drive and its resolver docstring
named the sign as slice 3's to add. Slice 3 reconciles to the parent's shape — one drive,
the sign carried by the fresh pole's declaration — while keeping the ember pole's arithmetic
and its off-paths bit-identical, so nothing slice 2 proved is re-opened.

## The non-collapse test exercises SEEK (not just ember-following)

`emberDrive.selfcheck.mjs` gained a `trailSoak` on slice 2's soak world verbatim (same
pins, same stroke cadence/seed, same buffer fade, same own-light model — a standing moth
keeps its cell young), driven by the COMBINED step:

- **Declared defaults (ember 0.6 + fresh SEEK 0.6):** measured worst >40%-occupancy streak
  **15.0 s** against the parent issue's 30 s bound; max drift 182 px (the soak really steers).
  This is the configuration the issue's camping failure names — everyone converging on the
  newest light — and it runs at half the bound, not at zero: the damping is doing real work.
- **Fresh-only SEEK (0 / +0.6):** worst streak 0.0 s, max drift 57 px.
- Calibration was measured before pinning (weights 0.4/0.6/0.8 probed; flee −0.6 also
  collapse-free). The suite asserts the named bound itself, not the measured values.

## Acceptance coverage (emberDrive.selfcheck: 26 tests, 15 pre-existing + 11 new)

- Fresh window/field on both read surfaces (ages; b/g proxy); windows tile, never overlap.
- Declaration: DUSK FLOCK reads +0.6 (the ruling is SEEK); undeclared/unknown reads 0.
- Drive field signed: seek stands fresh cells at +weight, flee at −weight; poles never sum in a cell.
- Steer step: seek climbs toward fresh, flee descends from it; speed cap × weight; leash holds.
- Fresh never grazes (uniform fresh field relaxes home); ember graze survives in the combined drive.
- Builder: a moth turns to and reaches fresh light (fresh-only and at declared defaults);
  under a −0.6 declaration it retreats (175 → >205 px). Off paths inert (shed, no grid).
- Replay: identical moth tracks over 2,000 frames with fresh steering on, non-vacuous.
- Governor rung order unchanged; shed badge re-pinned to the new name.
- Slice 2's suite passes untouched: window, fields, graze, soak, replay, snapshot/restore,
  shed walk-home, live-wire cadence — 10/10 repeated full-suite runs green.

## Re-pins (each at full strength, each verified surgical)

1. **The Canon looks-hash, three suites** (`canon`, `canonMotion`, `canonSettings`):
   `sha(COMPOSITION_PRESETS)` `0e506973c67a5129` → `61c50037062a6337`. Proven by per-record
   hash diff against HEAD: **exactly 1 of 70 records differs — dusk-flock, exactly one field,
   `trailFresh: 0.6`** — and HEAD reproduces the old pin exactly. The pin guards catalogue
   drift; a deliberate look-record field addition is precisely what it exists to make visible.
2. **Governor shed badge** in the #1837 governor test: `['ember steering held']` →
   `['trail steering held']`, renamed in `governorCuts.js` (label likewise). Rationale above.
   No other suite or e2e spec pinned the old strings (grepped `app/src` + `e2e/`).

No other re-pins. Nothing else in e2e/ or the selfchecks references the touched surfaces
(grepped for trailEmber/trailFresh, the badge strings, and every touched file's importers
before running).

## Verification (all on this tree, this build)

- `emberDrive.selfcheck.mjs` by file: **26/26 pass, 10× repeated**.
- Full manifest sweep (651 commands, continue-on-error, exit-code verdicts): only failures
  were the three canon pins above (re-pinned, then the three suites re-run green by file)
  and the three standing sandbox-environment failures — **swarmWasm, rollSafety, accum** —
  which also do not pass on a pristine detached worktree at origin/main in this sandbox
  (swarmWasm exits 1; rollSafety and accum do not complete). None of the three imports a
  file this change touches. CI remains authoritative for them.
- Byte-identity guards beyond the re-pin pass unchanged: canon voices (72) and chapter
  decks, chapters, taste, kineticSweep, canonBus replay.
- `npm run format:check` clean; eslint clean on all touched files; `npm run build` green.
- The `app/package-lock.json` churn from `npm install` (one license line) was reverted —
  the lockfile is not part of this change.

## Drive states for the coordinator

1. **Seek (the money shot):** DUSK FLOCK up, ACCUM on, creatures on stage. Lay fresh light
   near a moth (a KINETIC pass / new strokes landing) — the moth turns and closes on the
   fresh light while it is fresh (~half a second of show time per stroke; a moving pen of
   strokes shows the chase best), then grazes the cooling wake.
2. **Flee contrast:** no shipping look declares flee, so there is nothing to click. To see
   it: in a scratch checkout only, flip dusk-flock's `trailFresh` to `-0.6` in
   `app/src/data/presets.js` — same scene, moths now retreat from fresh light. Selfcheck
   pins the behaviour; the visual is a one-line data flip away.
3. **Shed:** force governor pressure (or the shed overlay) — the badge now reads
   "trail steering held" and drifted moths walk home to their pins.

## What was NOT done

- No second creature type (not ruled). No new panel or param (authoring freeze).
- No change to the trail grid, the age buffer, the integrator's other drives, or slice 2's
  ember arithmetic. No push, no PR — Matt's review lane.
