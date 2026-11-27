# STAGING REPORT — #1994: DISH LIFE coupling Phase 1, persistent field mode (#1923)

## What was built (plain language)

DISH LIFE gains its second mode, exactly as Matt's 2026-11-05 ruling scopes it. Alongside the existing
visual culture (idle-only, dissolves the scene into cell-stamps, any touch ends it — untouched) there is
now a **field mode**: the culture is seeded from the stage's current marks and keeps evolving while the
performer plays, but it is **invisible** — it never dissolves a mark, never stamps a cell, never draws a
speck, never touches a layer. Its whole output is publication: the live culture's `field.level` and
`field.activity` are readable on one stable object (`stage.publishedField`) that a consumer can read
every frame. Nothing reads it yet — asset driving is Phase 2 — so with field mode stamped on, the stage
looks and behaves exactly as it does today, which the new tests prove at both the stage level (layer
arrays literally identical, frame after frame, cycle after cycle) and the resolver level (frame hashes
bit-identical to an unstamped resolver across a full cycle and a re-seed).

The citizen contract holds in full: `seedFromMarks` is still the only stage → grid path (terrain and
tertiary specks excluded from the seed, bedrock never lived on); stepping honours the governor's shed
levels exactly like the other modes (catch-up / trickle / hold); the stamp is data in the recorded input
stream (`input.dishLife` with `mode: 'field'`), so a take replays the field exactly, and the stage
snapshot carries the mode so a take can begin mid-field; one-way influence is structural — the stage
publishes, the culture writes nothing anywhere.

## The stepping choice (the issue left it open)

**Continuous reduced-rate stepping inside a cycle + gentle re-seed at the cycle boundary.** The new
clock (`dishLifeField.mjs`, mirroring `dishLifeQuiet.mjs`'s pure stamp shape) runs cycles of
`FIELD_CYCLE_GENS = 48` generations at `FIELD_GPS = 4` — half the culture tempo — so one cycle is 12 s.
When the cycle rolls, the wake changes and the stage re-seeds from the scene as it is then. Why this
shape: continuous stepping alone matures into the maze by ~gen 60–100 (the slice-2 spike's finding) and
then the field freezes; cycle re-seeding keeps the culture inside its bloom arc, keeps it tracking the
current composition with zero write-back (the closed loop is Phase 3 and stays unbuilt), and reuses the
stage's existing wake-rebuild machinery — the stamp is a pure function of loop time, so replay needs no
new record. The stage was extended rather than adding a new holder module (the design doc's stated
preference); only the small pure clock got its own file, beside its quiet sibling.

## Files touched (6 + this report)

- **New** `app/src/engine/dishLifeField.mjs` — the field-mode cycle clock: `fieldStamp(loopMs, { shed })`
  → `{ mode:'field', wakeMs, gen, cycleGens, shed }`, pure; `FIELD_GPS`, `FIELD_CYCLE_GENS`.
- **New** `app/src/engine/dishLifeField.selfcheck.mjs` — 10 cases (below); registered in the manifest.
- `app/src/engine/dishLifeStage.mjs` — `mode:'field'` stamps run the shared build/step path but return
  before every draw path (the render assignment `nearest` is never even built for them; a mode switch
  back to a drawing mode rebuilds it — the guard is in the build condition). New stable `publishedField`
  holder + `syncPublished()`; snapshot/restore carry a `field` rider mirroring the `quiet` rider;
  `reset()` and the stamp-drop path unpublish.
- `app/src/gl/liveResolve.mjs` — `checkResolverSnapshot` gains the additive optional-shape check for the
  new `field` snapshot rider, mirroring the existing `quiet` check exactly. Nothing else changes.
- `app/src/gl/liveResolve.dishLife.selfcheck.mjs` — additive section 7 (field mode through the resolver)
  + header line + import. **No existing assertion was changed anywhere.**
- `app/selfcheck.manifest` — one line: the new suite.

Not touched: `dishLife.mjs` (the core step is byte-identical), `dishLifeSeed.mjs`, `dishLifePhase.mjs`,
`dishLifeTouch.mjs`, `dishLifeQuiet.mjs`, `dishLifeRender.mjs`, the live loop, the store, the chip.

## Suite verdicts (real counts)

- **New `dishLifeField.selfcheck`: 10/10 passed** — clock purity/arithmetic/junk guards; holder contents
  equal a hand-built culture from the same marks generation by generation (seed → field round-trip);
  holder stability (same object across frames and re-seeds, live arrays within a culture, old arrays not
  retained, unpublished on stamp-drop); determinism incl. seek-back and the `cultureHash` golden;
  never-draws (identical item-array references across a full 48-gen cycle + a re-seed cycle, no `life:` /
  `speck:` keys, layers byte-equal to the dealt scene); bedrock (nothing lives under a held mark across
  31 generations; held + speck items excluded from the seed — snapshot shows exactly the 6 real marks);
  shed (hold freezes the field arrays, trickle +1/frame, catch-up bounded); mode exclusivity (a visual
  stamp unpublishes the field and dissolves exactly as before); snapshot/restore continuation.
- **`liveResolve.dishLife.selfcheck`: passed**, including the new section 7 — 130 frames of field stamps
  bit-identical to the plain resolver on every frame (two independent field resolvers agree), mid-field
  snapshot carries `dishLife.field`, validator accepts the genuine rider and refuses malformed ones
  (`cycleGens: 'x'`, `field: 5`), restore continues bit-identically.
- **Whole dishLife family + neighbours, individually re-run: 16/16 passed** — dishLife (core),
  dishLifeSeed, dishLifePhase, dishLifeRender, dishLifeStage (existing goldens unmodified),
  dishLifeQuiet, kinemeCulture, dishLifeSpike, dishLifeTouchDom, governorDishLife, governorCuts,
  dishLifeChip, performanceDishLife, resolverSnapshot, spawnState, dishLifeField.
- **Full manifest sweep (continue-on-error): 604 passed / 3 failed of 607.** All three failures proven
  **base-identical** on a clean origin/main `f6efa716` worktree (created for the proof, removed after):
  - `swarmWasm` — "build-wasm: cargo not found on PATH" assertion, identical on base. Environmental.
  - `rollSafety` — Chromium "Target crashed" in the GL parity driver, identical on base. Environmental.
  - `accum` — Node heap OOM abort (exit 134, same native stack frames `0xf4ebca` / `0xf52f70`), identical
    on base. Environmental.
  None of the three touches dishLife code; they are the same trio recorded on prior lanes in this sandbox.
  CI's selfcheck-browser job (pinned browser) is the authority for them.
- `npm run format:check`: clean tree-wide (after prettier formatted the two new/edited test files; both
  re-ran green after formatting).
- `npm run lint`: exit 0, 0 errors, 11 warnings — all pre-existing in untouched UI files
  (App.jsx, FavoritesTray.jsx, ShelfView.jsx, DataExportRow.jsx, LootRow.jsx); none in touched files.

## Re-pins

**None.** No existing assertion, golden, census, or defaults table needed re-pinning: every pre-existing
suite passes unmodified. The pin sweep covered all suites importing the touched surfaces
(`dishLifeStage` consumers incl. `governorDishLife`'s `SHED_STEPS` import, all `checkResolverSnapshot`
users, the chip model, the performance suite) and a grep of `app/e2e/` for `dishLife` (no hits). The only
test-file changes are additive: the new suite, and section 7 + header + import in the resolver suite.

## Deviations — flagged openly, none silent

1. **No live-loop wiring in this slice (the one real judgement call).** Field mode ships in the stage +
   its pure clock and is reachable through the recorded stamp stream today; the live loop does not yet
   produce field stamps. Reasons: the loop has exactly one stamp slot, currently owned by the quiet
   stamp behind the ruled DISH LIFE flag — replacing or multiplexing it invents a performer control
   surface, and the ruling leaves that choice open verbatim ("chip vs strength > 0" is listed among the
   handoff's open questions, "settled one at a time when the slice is taken" — by Matt). #1994's own
   scope line excludes "Phase 4 controls beyond what Phase 1 needs to exist", and every Phase 1
   acceptance criterion is a stage/field property, all proven above. When Matt settles the switch,
   wiring is one stamp-producer swap in the loop; nothing here needs rework.
2. **The snapshot validator grew by one additive check** (`liveResolve.mjs`, above). It mirrors the
   `quiet` rider's validation shape so a malformed `field` rider is refused like any other; behaviour
   for every pre-existing snapshot shape is unchanged (resolverSnapshot + spawnState suites pass).
3. **No position sampler ships with the holder.** Phase 1 publishes the raw field arrays as the issue
   specifies (`field.level` / `field.activity` on a stable object). The Phase 2 sampling helper is that
   phase's file, per the design doc.
