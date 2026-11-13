# Canon — a world record: ground, ink, boil clock and finish that every style stands in (#2104)

Status: **SPEC ONLY — nothing is built.** This stops for Matt's ruling on the open items (§10). The parent issue
(2104) is spec-only by its own terms; the build is a separate step, after approval. Paths are under `app/src/`.
Every "today" claim below was re-read on `main` @ `c9db2c06`; nothing was run. (Filed as
`canon-world-record-spec.md` to match the sibling spec names; the parent issue proposed `canon-world-record.md`.)

## 0. Rulings this spec follows (Matt, 2026-11-11, on the parent issue)

These replace the field list the issue body proposed. Sun and trail policy are **removed** from the world;
the rest of the issue's outline stands.

- **When a world is dealt:** on a Nash Book chapter landing. KINETIC and CURATOR presses keep the standing
  world and change only what stands in it.
- **What the world owns:** ground and ink (paper/plate colour and the darkest line colour, shared by all three
  styles), the boil clock (one stage-wide kineme frames-per-second), and grain / finish (one finish pass over
  everything).
- **What the world does not own:** the **sun** — it stays as it is today (scene-level, performed by hand and
  beat). The **trail** — per the ruling recorded on the trail issue (2102, closed), a Look resets ACCUM; the
  world sets no trail policy.

A second comment (Matt's ruling, 2026-11-12) cross-references the mutual-awareness ruling on the petri-dish
umbrella (1183): everything on the stage must be aware of each other, and the world record is the natural home
of the shared state that mutual awareness would read. That comment orders nothing and changes nothing in this
spec; §6 marks the join so the two designs do not pass each other.

## 1. What exists today (verified)

- **There is no world record.** The word "world" appears nowhere in `data/canon/`; no record anywhere declares
  a shared ground, ink, boil rate or finish for a scene. The Canon today is styles, baselines, motion and
  settings (below) — the shared _physics_ the issue names is exactly what is missing.
- **Canon styles** (`data/canon/styles.js`, Canon S1): `CANON_STYLES` (:60) — one record per style carrying
  `id, label, identity, assets, lookGroup, pairing, bus`. The `bus` field (:37, `CANON_STYLE_BUS`) is the
  record's declared relationship to the core event bus — what it listens to, what it announces — wired by
  `curator/canonBus.mjs`, no per-record driver. A style declares what it _is_ and what it pairs with; nothing
  about the world it stands in.
- **Canon baselines** (`data/canon/baselines.js:38`, `CANON_BASELINES`): complete settings records in the
  instrument's own terms — `marks, palette, motion, density, rules` (header, :5–13). A baseline is one
  tradition's full recipe; it is not shared state either — applying one is applying a look-shaped record.
- **Canon settings** (`data/canon/settings.js`, Canon S4): per style, values _measured_ from its own members —
  palette behaviour (including `ground`, the mean luminance of its palette grounds), motion
  (`SETTINGS_MOTION_KEYS` = `lifeDrift, noiseSpeed, wind, breath`, :51) and a feel centre. A style with no
  members to measure (techno, pixel, organic) has `null` settings — an honest blank. Chapters carry these
  settings (`data/chapters.js` header :4–8; `chapterSettings`, :199) and taste reads the standing chapter back.
- **Chapters and landings.** A chapter record is `{ id, name, lookGroups[], assetStyles[], assetFamilies[],
voiceStyles[], card { paletteId, marks[3] }, settings }` (`data/chapters.js`); decks are derived, never
  borrowed, with `CHAPTER_DECK_MINIMUM = { looks: 4, voices: 8, assets: 14 }` (:81). A cold KINETIC tap walks
  the spine and lands: `dealLanding(dieRng, …)` (`state/chapterWalk.mjs:71`, called from
  `state/slices/layoutSlice.js:145`) on the same seeded die stream the look pass then deals from (:148).
  Chapter state is **session-only, never serialized** (`layoutSlice.js:720`). CHAOS and the launch opener clear
  the standing chapter (audit §5).
- **The sun** (`data/light.js`): scene-level and exactly ONE — "there is no light array and no per-layer light
  on purpose" (:1–5). Its record is `{ x, y, height, intensity, ambient, slot, bevel, spec, pool }`
  (`LIGHT_DEFAULT`, :26); `null` means off, and off is byte-identical everywhere (:9–10). It lives in store
  state (`light: null` by default, `state/slices/layoutSlice.js:844`), is written by the artist's hand through
  `setLight` (:1071, undoable), and is serialized in the project document through the same sanitize door
  (light.js header, :7–8).
- **Ground and ink today** come from the active **palette**: every palette record is `{ id, name, era, bg,
ink, swatches[…] }` (`data/palettes.js` header, :1–6), resolved by `resolvePalette` (:519), and the stage
  background is read from the resolved palette (`gl/liveResolve.mjs:714`, `ctx.palette.bg`). Two honest
  mismatches with the ruling's words: a palette's `ink` is documented as the _catalog-page text colour_ chosen
  for contrast against `bg` — it is not a "darkest line colour", and no single declared value anywhere plays
  that role for marks today; and the ground a palette names is a colour, while the strata diagnosis (§1, last
  bullet) shows the visible ground stratum (a PATTERN below) takes no sun at all.
- **The boil clock today** is a compiled-in constant, not a dealt value: `BOIL_FPS_DEFAULT = 8`,
  `BOIL_FPS_MIN = 6`, `BOIL_FPS_MAX = 12` (`engine/kineme.js:224–226`), consumed by `boilSec` (:253) — loop
  time snapped down to the boil frame, per `docs/KINEME_SPEC.md:30` ("8 frames per second default — the
  classic hand-drawn rate"; smooth drivers skip the boil clock and read raw loop time). No caller anywhere
  passes a different rate: no look, voice, dial or lock writes boil fps.
- **Grain / finish today** is FX-strata machinery, plural and per-layer: the finish family is
  `GRAIN_FAMILY_KINDS = ['grain', 'dither', 'riso', 'stipple']` (`gl/renderer.mjs:61`, source
  `fx/fxFilters.js`), voices and looks deal grain amounts into their FX (`data/voiceDeck.js:70,94` carry
  `{ grain: … }` defs), and the standing law is that finishes run after the ACCUM buffer, never into it
  (`gl/renderer.mjs:133–135`). There is no single finish pass over everything; there are finish _layers_.
- **The trail** belongs to looks: the closed trail issue's shipped fix makes a look that declares none of the
  ACCUM keys return them to their defaults when applied (locked keys excepted). The world's hands are off it
  (§0).
- **What is and is not lit today** is already diagnosed: `docs/design/stage-strata-in-the-world.md` (the
  strata diagnosis the parent issue's acceptance depends on) tables every stratum against sun / bevel /
  kineme / ACCUM / shadow at its own head. This spec cites it rather than re-deriving it; its gap 2 (a lit
  mark on an unlit ground) and gap 5 (the ACCUM trail re-presents old light) are the two entries a world
  record will be read against.
- **Precedence machinery exists**: `lockedParams` (`state/slices/layoutSlice.js:798`) — a deal never
  overwrites a locked key (:1126). The artist's hand writes state directly (e.g. `setLight`) and undo carries
  it. Personas propose and score; nothing in the Canon lets a persona gate or deal.
- **The audit's gaps.** The unified-database audit (`docs/design/unified-style-database-audit-2026-11-09.md`)
  predates the world concept — none of its 11 gaps names a world. The nearest are gap 5 (a chapter "carries no
  settings of its own" — since partly answered by Canon S4's chapter settings, §1 above, which are a
  chapter's _own_ values, not a shared world dealt on landing) and gap 10 (no readable store the trio can see
  state through — the bus direction the Canon has since grown, styles.js `bus`). This spec is written against
  those two gaps and the issue's own §Why; it does not claim to close the other nine.

## 2. The record

One record, dealt once per chapter landing, standing above the kit triad. Proposed shape — every field is a
real control of the instrument, in its real units, so the record survives a validating door unchanged (the
baseline rule, `data/canon/baselines.js` header):

```js
world = {
  chapter: "swiss", // the landing that dealt it — provenance, not a pointer back into the Book
  ground: "#f0f0e8", // paper / plate colour — the stage's ground, shared by every style standing in it
  ink: "#141310", // the darkest line colour — the floor every mark's line work is read against
  boilFps: 8, // the boil clock: one stage-wide kineme frames-per-second, BOIL_FPS_MIN..MAX
  finish: { grain: 0.25 }, // one finish pass over everything (§6) — amounts in the finish family's units
};
```

- **Only the ruled fields.** Ground, ink, boil clock, grain/finish — §0. The sun is not a field (it stays in
  `data/light.js`, scene-level, the artist's hand and the beat). Trail policy is not a field (a Look resets
  ACCUM; §1). No field names a look, voice, asset or layout: the world is what is _shared_, and everything
  that differs between the three styles stays in their own records — that split is the issue's §Why (form
  differs, physics is shared).
- **Named constants, in the open** (the standing rule for tunable parameters): the boil band already has its
  names — `BOIL_FPS_DEFAULT / MIN / MAX` (`engine/kineme.js:224–226`) — and the world record carries a value
  inside that band, never a new band. Any grain bound the build needs takes a named constant beside the finish
  family's own, in the same style. No magic numbers in the record's door.
- **The door.** A `sanitizeWorld` in the light's shape: not an object → null (no world); missing numbers take
  the standing defaults; colours validated as colours; `boilFps` clamped to the named band. Fail-closed like
  every other document field.
- **Null is a real state.** No world dealt yet (a fresh stage, before the first landing) is `world: null`,
  and null renders exactly as today — §7.

## 3. Style response — what a style declares about standing in a world

The world's fields are shared; how a style _behaves inside_ any world is the style's own declaration, and
nothing more (the parent issue's §2). Two axes:

- **Kineme amounts** — how much of each living-motion driver the style takes: breath / drift / pulse / brush
  wobble. This axis is half-built already: Canon settings _measure_ a style's motion centre from its members
  (`SETTINGS_MOTION_KEYS`, `data/canon/settings.js:51` — lifeDrift, noiseSpeed, wind, breath). What does not
  exist is a style _declaring_ its amounts as its response to a world (rather than a measurement of its
  members), and pulse / brush wobble are not in the measured key set. §10 asks whether the response is
  authored, measured, or measured-then-authored-over.
- **Material under the sun** — how the style's marks take light: the issue names matte, enamel, wet. No
  material vocabulary exists anywhere today (searched: no style, baseline or palette record declares one);
  the sun's own material terms are per-scene (`bevel`, `spec`, `pool` in `LIGHT_DEFAULT`), not per-style.
  The vocabulary is greenfield — its closed set is Matt's call (§10).

Proposed declaration shape, on the style record beside `bus` — two contrasting styles, values **illustrative
of the shape, not ruled**:

```js
// swiss — in data/canon/styles.js, the record for 'swiss' gains:
response: {
  kineme: { breath: 0.1, drift: 0.0, pulse: 0.0, wobble: 0.0 }, // near-still: the grid does the talking
  material: 'matte',
},
// grunge — the record for 'grunge' gains:
response: {
  kineme: { breath: 0.4, drift: 0.3, pulse: 0.2, wobble: 0.9 }, // the photocopy boils
  material: 'wet',
},
```

- A style with no `response` is not an error: it takes the world's fields plainly, with no modulation — the
  same honest-blank discipline as Canon settings' `null` for memberless styles (§1).
- The response modulates; it never overrides. A style's amounts scale what the world's boil clock drives;
  its material names how its marks answer the sun the artist placed. Neither reaches up into the world's
  fields, and neither is a place a persona can write (§5).

## 4. Precedence

Highest first, exactly where the world sits:

1. **The artist's hand** — a value the performer sets directly stands until they change it (the `setLight`
   pattern: hand-written, undoable).
2. **Locked dials** — `lockedParams`: a deal of any kind never overwrites a locked key
   (`state/slices/layoutSlice.js:1126`).
3. **The standing world** — on the fields it owns (ground, ink, boilFps, finish), the world is the standing
   value from its landing until the next landing. KINETIC and CURATOR presses do not re-deal it (§0).
4. **Look and voice** — dealt inside the chapter, under the world: they change what stands in the world, not
   the world. On fields they own today that the world also touches — palette ground/ink and FX grain — the
   composition rule is **not ruled** and is §10's question, not this section's answer.

The world's seat below hand and locks is the issue's §3 ruling ("the artist's hand and locks win; say exactly
where the world sits below them"): a performer can lock the ground, or set the boil by hand, and no landing
moves it. What a landing _can_ move is only an unlocked, unhanded world field.

## 5. Dealing and recording

- **When:** on a chapter landing, and only then (§0). The landing already happens in one place — the cold
  KINETIC flip's walk (`state/slices/layoutSlice.js:145`) — and the world deal rides it: one landing, one
  world, dealt from the same seeded channel the landing and the look pass already use (`dieRng`, :145, :148),
  so a replayed take re-derives the same world from the same recorded inputs — the determinism every other
  deal in the instrument answers to.
- **KINETIC and CURATOR presses after the landing** deal looks, voices and marks _inside_ the standing world
  and leave the record untouched (§0). A press is not a landing; narrowed CURATOR rounds inside one chapter
  (the funnel) are not landings either — the chapter did not change.
- **Re-landing the same chapter** (walk away, walk back) is a landing: §10 asks whether it re-deals the world
  or keeps the one that chapter dealt before.
- **Recording — proposed, in the sun's shape.** The sun is the model: a scene-level record, sanitized at one
  door, serialized in the project document, omitted when off so old documents stay byte-identical
  (`data/light.js:7–10`). The proposal is that the world is recorded the same way — in the project document
  and stamped into the take like every other dealt thing — _not_ session-only like the chapter it rides in
  on (`state/slices/layoutSlice.js:720`). The fork is real (chapter precedent one way, sun precedent the
  other) and it is §10's question; this section states the proposal, not the ruling.
- **The bus.** A style record already declares its bus relationship and `curator/canonBus.mjs` wires exactly
  what is declared (§1). The proposal is that the world, as a Canon citizen, declares its own in the same
  pattern — listens to the landing decision, announces itself when it is dealt — so the trio can see the
  standing world through the bus the way the cross-reference (§0) intends: the world record as the readable
  home of shared state. Whether that wiring is this slice or the awareness slice's is §10's question.

## 6. The joins — strata, mutual awareness, DISH LIFE

- **Strata law holds.** The standing order (PATTERNS/GLYPHS pinned bottom and locked → ONE content layer → FX
  → MATH) is untouched. The world's finish is a _finish_: it runs where finishes run, in the finish fold after
  the ACCUM buffer, never into it (`gl/renderer.mjs:133–135`) — one pass over everything means over the
  composite, not a new stratum and not a reordering. The world's ground is the paper the strata stand on, not
  a stratum of its own.
- **Mutual awareness (1183).** The 2026-11-12 cross-reference marks the world record as the natural home of
  the shared state the awareness ruling reads. This spec's part in that is only to not design past it: the
  record is plain, readable, and bus-visible (§5) — what the poem system, the creatures and DISH LIFE _do_
  with it belongs to the awareness slice, not this one.
- **DISH LIFE — the two grounds (flagged, not decided).** The world record's `ground` is a colour: the
  paper/plate the scene stands on. DISH LIFE's "ground" (the rulings on its issue, 2026-11-12) is a different
  thing wearing the same word: the invisible living-or-dead field _under_ the assets in the one dish — never
  drawn, acting as a force, and standing on its dead ground too long kills. The two records would share a
  stage and a noun. Whether they are related (does Life's field live in the world record? does the world's
  ground colour say anything about the field?) or permanently separate is **not** decided here — it is
  §10's question, asked before any build touches either.

## 7. What does not change

- **One sun.** `data/light.js`'s rule stands verbatim; the world neither holds a sun nor adds a second light
  path. The sun stays scene-level, performed by hand and beat.
- **No new panel.** The world is dealt, not dialed; §4's hand-and-lock precedence uses the surfaces that
  already exist.
- **Off is byte-identical.** No world standing (`world: null`, or a document that predates the field) renders
  exactly as today — every golden, every replay, every still. This is the light's rule (`data/light.js:9–10`)
  applied to the world.
- **The trail is untouched.** ACCUM stays a Look's business (the closed trail issue's fix stands); the world
  sets no trail policy, and the strata diagnosis's note that the trail re-presents old light stays a property
  of the trail, not something the world promises to fix.
- **No persona gains a hand.** The trio reads the world (through context and the bus, §5); proposing and
  scoring stay proposing and scoring. Nothing here lets a persona deal, gate or edit a world.

## 8. Selfcheck plan for the build (a later PR, not this one)

One new suite, one manifest line, in the instrument's idiom: the sanitize door (null for non-objects, defaults
for missing fields, boil clamped to the named band, unknown material dropped); the deal (a landing deals a
world from the chapter's stock through the seeded channel; a KINETIC or CURATOR press after the landing leaves
the record untouched; a replayed landing sequence re-derives identical worlds); precedence (a locked ground
survives a landing; a hand-set boil survives a landing); recording (document round-trip — a world survives
save/load, a world-less document loads byte-identical, a take stamps the world it was dealt under); style
response (a style with no `response` stands in the world unmodulated; amounts scale, never override); and
every existing golden identical for every scene with no world standing. Live-canvas before/after captures in
the build PR, per the review lane.

## 9. What I measured

Nothing was run. Every claim above is a read of `main` @ `c9db2c06`. Three of the parent issue's premises,
written at `554fa00`, have moved since and are corrected here rather than repeated: chapters **do** now carry
applicable settings (Canon S4, #2046); styles **do** now declare a bus binding (Canon S5-era, #2049); and the
audit's gap 5 wording ("no settings of its own") predates both. The issue's remaining premises re-verified
true at this head: no world record exists, the boil rate is a constant nobody writes, ground/ink arrive via
the dealt palette, and the sun is one, scene-level, and off-by-default.

## 10. Open for Matt (none decided here)

1. **The world's stock.** Where do dealt worlds come from — derived from the landed chapter's own settings
   and palettes (Canon S4's measured values, the chapter card's palette), an authored stock of worlds per
   chapter, or rolled from named ranges on the die? And on re-landing a chapter already visited: a fresh
   deal, or the world that chapter dealt before?
2. **Ground and ink, from where.** The ruling names ground as paper/plate colour and ink as the darkest line
   colour — but today's palette `ink` is a contrast text colour, and no line-colour value exists (§1). Does
   the world take `bg`/`ink` from the landed chapter's palette as-is, or does `ink` become a new, genuinely
   line-facing value the palettes have to grow?
3. **The finish vs the FX strata.** Voices and looks deal grain into FX layers today (§1); the world owns
   "one finish pass over everything". Do the two compose (world finish last, over the FX finishes), does the
   world _replace_ per-look grain while it stands, or does a look's grain survive untouched and the world's
   finish is only the final pass's amount?
4. **The boil's reach.** The world's boilFps binds the mark kineme clock — does it also bind the parallel
   motion vocabularies the strata diagnosis lists (the PATTERN elements' CPU kinemes, the cell kinemes'
   line-boil), or only the stage-wide clock the ruling names?
5. **Style response: authored or measured.** Canon settings already _measure_ a style's motion centre from
   its members (§1). Is a style's `response` (§3) an authored declaration, the measured settings promoted to
   that role, or measured values an author may override? And is the material vocabulary the closed set the
   issue names — matte / enamel / wet — or open?
6. **Recording.** The world in the project document and the take, in the sun's shape (§5's proposal), or
   session-only like the chapter it rides in on — gone when the session ends, re-dealt on the next landing?
7. **Clearing.** CHAOS and the launch opener clear the standing chapter today. Do they clear the standing
   world with it, or does a world stand until the next landing replaces it?
8. **The two grounds.** The world record's ground (a colour) and DISH LIFE's ground (the invisible
   living/dead field in the one dish) share a word and a stage (§6). One record, related records, or
   permanently separate — and if separate, which one keeps the name "ground"?
9. **The bus declaration.** Does the world record declare listens/announces in this slice (§5's proposal),
   or does its bus surface wait for the mutual-awareness slice under the umbrella (1183)?
10. **The pre-landing stage.** Before any chapter landing deals a world, is the stage simply world-less
    (today exactly, §7) — or is there a house world that stands by default, and if so, who authors it?

Build order after approval: the record and its door, the landing deal, the recording, then style response —
one PR per step, each stopping where the rulings stop.
