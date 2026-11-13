# STAGING REPORT — #2104 step 2: the landing deal

Branch `kc-2104-landing-deal` (worktree `~/workspace/kc-2104-step2`), based on `origin/main` @ `8d26add3`
(step 1, PR #2169). One PR, not merged — the coordinator/Matt merge.

## What was built

**The deal** (`app/src/state/slices/layoutSlice.js`, +world wiring only):
- `scopedChapterLook` now also computes `worldForChapter(walk.chapterId)`; `kineticLookPass` writes it as
  `world` in the same store update as `kineticChapterId` / `kineticLanding` — a landing and its world can
  never disagree, and a tap stays one undo step.
- CHAOS (`kineticRoll`) and the launch opener (`kineticOpenPass`) write `world: null` beside
  `kineticChapterId: null` — ruling 7: they clear the world with the chapter. Verified these are the only
  two chapter-clearing sites in the tree (plus the initial state).
- Warm presses (voice, CURATOR) never write `world` — the standing world stands (spec §0), pinned in the suite.
- The `world` state-field comment now states steps 1–2 and the step-3 boundary.

**The stock + the pick** (`app/src/data/world.js`):
- `WORLD_STOCK`: 3 authored worlds × 12 chapters, in the ruled spine order (Organic after Engraving, Pixel
  after Memphis, Techno after Grunge — conflict-review ruling 1: stock for all 12 now, ahead of the three
  unbuilt chapters). Each entry's ground is a palette's `bg`, its ink that palette's derived line ink
  (palette named in a comment per entry); boil/grain are the authored climate, inside the named bands.
  A chapter's palettes are its own: card first, then the family its Canon style resolves
  (`data/canon/index.js`). Now = card + two library signatures. Pixel and Techno each resolve to a single
  palette today (kiln-columns; glitch), so their stocks are that palette in three climates.
- `worldForChapter(chapterId)`: FNV-1a hash of the chapter id modulo the stock size — the pick derives
  from the chapter ALONE (conflict-review ruling 3). No dieRng, no rng at all, nothing stored; the same
  chapter deals the same world every landing, every session; a replayed landing re-derives it. Returns the
  record through `sanitizeWorld` (a fresh copy), null for a chapter with no stock.
- The pick as dealt: marks→ochre-wall world, engraving→persona-haeckel, organic→river-delta,
  bauhaus→vortex-rwb, swiss→strata, op-art→static-bloom, japan→sepia-plate, memphis→glitch,
  pixel→kiln-columns (slower clock), grunge→dystopia, techno→glitch (slower clock), now→praystation.

**The palettes' new ink** (`app/src/data/palettes.js`):
- `deriveLineInk(palette)` — the one read path for a palette's line ink, over any palette record.
  THE RULE (conflict-review ruling 2 — derived by a stated rule, hand fixes after): an authored `lineInk`
  on the record wins (the hand fix; none exist yet); otherwise the darkest swatch by relative luminance
  (sRGB Rec. 709, the canon/settings.js measure), EXCLUDING any swatch equal to the palette's own bg —
  a line the colour of the ground is no line (four catalog palettes carry their bg as a swatch; without
  the exclusion their line ink would equal their ground). Ties → earliest swatch; no eligible swatch → bg.
- `FAMILY_PALETTES` carries an authored `lineInk` to persona cousins when a root grows one (like bg/ink).
- The text-contrast `ink` field is untouched, everywhere.

## A defect found by the gates, and the fix

The first cut attached `lineInk` to `resolvePalette`'s return. `replayGate` and `creatureGate` went red
at checkpoint 0 (identical failure standalone on this branch, green standalone on pristine main — real,
not environmental): the replay frame hash walks the resolver's output object keys in order
(`app/src/gl/performanceFile.mjs`), so ANY new key on the resolved palette rewrites every frame hash and
no recorded take can ever replay. Fix: the resolved palette's shape does not grow the key;
`deriveLineInk` is the read path instead. Both gates green after the fix, and `palettes.selfcheck` now
pins the shape freeze (`!('lineInk' in resolvePalette(...))`) so the lesson is carried by a test.

## Visible-change verdict

**Step 2 changes NOTHING the stage looks like.** Nothing reads `state.world` to render (grep-verified:
no consumer outside the deal/clear writes and the suites); the stage background is still read from the
resolved palette, the boil is still the compiled constant, finishes are still the FX layers'. The world
record is written on landings and cleared on CHAOS/opener, and that is all. All goldens byte-identical
(allEraGolden ok, 985 assets); project documents and scene contracts carry no world key (pinned in
world.selfcheck, before and after a real landing). This is backend-lane plumbing, like step 1.

## Not done (by design — step boundaries)

- Recording the world in the project document / take — step 3. (The world is session-only in step 2,
  exactly like the chapter state it rides in on; undo history does not capture chapter fields and does
  not capture the world.)
- Style response (§3/§10.5) — step 4. No bus surface (ruling 9 — waits for the #1183 slice). No DISH LIFE
  rename (ruling 8 — its own slice). No render path reads the world.
- Precedence (§4: a locked ground / a hand-set boil survives a landing) is NOT implemented: no dial or
  lock surface over world fields exists today (spec §7: the world is dealt, not dialed), so there is
  nothing for a landing to respect yet. Flagged for the coordinator — if Matt wants it in this step, it
  needs a surface decision first.
- No ink hand fixes: every palette ships the rule's output, as ruled ("hand fixes after").

## Publish ritual (this tree, this run)

- Decisive suites individually, verdict lines observed: world OK · palettes OK · diceLanding OK ·
  chapterWalk ok · chapters OK · canonSettings ok · canon ok · canonBaselines ok · startupChaos ok ·
  kineticRoll ok · kineticScope ok · chapterNarrowWiring 7 passed · roundWiring 5 passed · light OK ·
  swatchWeights 11 passed · curatePalette ok · refineColor ok · projectDocument OK · projectDocument.fuzz
  ok (400 docs) · allEraGolden ok (985 assets, 24296 svg bytes) · replayGate ok · creatureGate ok.
- Full manifest sweep: 674 pass / 3 fail — the 3 are exactly the documented sandbox-environmental set (swarmWasm, rollSafety, accum — accum aborted under sandbox memory pressure, the same signature as on main and in step 1’s sweep); CI’s lint-build-selfcheck and selfcheck-browser jobs are authoritative for those three. replayGate and creatureGate PASS in the sweep.
- `npm run lint`: 0 errors (11 warnings, all pre-existing in files this PR does not touch).
- `npm run format:check`: clean (prettier reformatted only the two extended selfcheck files; both still pass).
- `npm run build`: green (3.64s; no @resvg failure, no A/B needed).
- CI: checked with `gh pr checks` after opening; the verdicts are reported in the builder handoff (this report is committed with the code it describes, before CI runs).

## Git proof

In the builder handoff — the git log is only final once this commit exists.
