# STAGING REPORT — #2104 step 4: the style response (branch `kc-2104-style-response`)

Base: origin/main @ 38749fb3 (step 3, PR #2171). One PR, review lane — Matt merges.

## 1. The visible-change verdict, plainly

**This step CHANGES what the stage looks like** — the first step of #2104 that does.
The house world has stood in the store since step 1 and worlds have been dealt since
step 2, but nothing read them. Now the stage reads the standing world:

- **Ground.** The stage's background is the standing world's ground, not the palette's
  bg. From the open, that is the house world's warm paper `#ece7db` — the opening stage
  no longer opens on the dealt palette's dark ground. Every chapter landing re-grounds
  the stage in its world's ground. White/transparent performer backdrops are untouched,
  and the #1923 culture fold still applies on top, exactly as before.
- **Finish.** The world's grain (house: 0.2) runs as ONE final grain pass over the
  finished frame, after every look's own finish chain. A look's own FX grain is
  untouched and runs first (ruling 3).
- **Tempo.** The world's boil clock (house: 8 fps) now steps the pattern elements'
  kinemes and the cell library's line-boil, and advances the mark clock's boil channel.
  Motion on those clocks visibly stutters at the boil rate instead of gliding.

Screenshots (boot state, each build's own random opening deal — the subject is the
ground, which is scene-independent): `shots/before-main-opening.png` (main: the dealt
palette's dark ground) and `shots/after-step4-opening.png` (this branch: warm paper
ground + grain over the whole frame). Taken from `vite build` + `vite preview` of each
tree in this sandbox; the step-4 shot's footer reads build 38749fb3 because the tree
was uncommitted when built — the code is the PR's diff, byte for byte.

## 2. What was built

- **The response record + resolver** (`app/src/data/canon/response.js`, new):
  `sanitizeStyleResponse` (the door: fail-closed; kineme amounts kept per known key —
  breath/drift/pulse/wobble — clamped 0..1; material kept iff a non-empty string, the
  vocabulary OPEN per ruling 5) and `styleResponse(styleId)` / `chapterStyleResponse(id)`.
  Author override wins: a style record's authored `response` (none ship in this PR — see
  §4) is the response. Otherwise the MEASURED centre of the style's own settings
  (`canonStyleSettings`): members' mean `breath` → kineme breath, mean `lifeDrift` →
  kineme drift. Pulse/wobble are unmeasured and never invented; measurement names no
  material. Memberless styles (techno/pixel/organic) and unknown ids answer null =
  unmodulated. Pinned by `src/data/canon/response.selfcheck.mjs` (new; one manifest line).
- **The world on the contract** (`sceneContract.js`): `buildSceneContract` carries
  `world` (through the door) only while one stands — a world-less contract, and its
  hash, is exactly the pre-world contract (step 3's pin still holds). `assertSceneContract`
  requires a carried world to be a fixed point of its door. `liveLoop` passes the frame's
  standing world into the doc, so project-driven renders (exports/stills) carry it too.
- **Ground** (`liveLoop.mjs`): the tint machines' bg is the world's ground while one
  stands (`bg: worldNow ? worldNow.ground : activePalette.bg`) — the wash/inject events,
  the frame clear and the ACCUM fade all follow that one value; `clearAccum` re-begins
  from the same shown ground. The resolve input carries the world only while one stands,
  so world-less frames record exactly the older input shape.
- **Boil — marks** (`liveResolve.mjs`): the resolver doors the input's world once per
  resolve; `livingMotion`'s ctx `boilStep` (hardcoded 0 since #1128) is now
  `boilStep(driverSec, worldBoilFps)` on all three call sites (content layers, moth floor,
  dish-creature floor). No world → 0, as before. Honest scope note: the boil channel's
  only reader is the brush-wobble driver, whose output is still unapplied (#894/#897) —
  the clock is bound; no mark moves differently yet.
- **Boil — patterns** (`renderer.mjs` → `patternSource.js` → `engine.js`/`picture.js`):
  the renderer snaps the pattern's t to the boil grid (`boilSec`) and passes it as the
  frame's kineme time; ONLY the element transforms (`elementXform`: quilt/glyph/picture
  movers) read it. Mode motions (quilt rotation wave, glyph/picture drift pulse, FIELD
  pan, REWRITE growth, TIDES) keep smooth t — the ruling names the elements' kinemes.
  `patternKey` gains a component only when the kineme time actually steps off t, so every
  pre-world key is byte-identical. Fast and reference rasters both take the new time and
  stay pixel-identical to each other.
- **Boil — cells** (`renderer.mjs` pack path): while a world stands, `line-boil`
  (line_squiggle_01) picks its cell from `boilStep(motionTime, fps) % 7` instead of its
  2.8 s library period; shed still parks it on cell 0. Every other strip kineme keeps
  its period. No boil on the frame → the period path, byte-identical.
- **Finish** (`renderer.mjs`): after the layer loop, when the contract's world carries
  grain > 0, ONE chain `{ layerId: 'world', steps: [grain] }` is appended to
  `fxFinishChains` — after every look chain, applied post-ACCUM by `applyFinishChains`
  like all finishes, never into the buffer. Look chains are not touched, reordered or
  re-parameterised.
- **Playback** (`playback.mjs`): `startPlayback` captures the take's stamped world
  (step 3) through the door. `playbackStep` resolves each frame under its own recorded
  world when it carries one (takes recorded from now on do — a landing mid-take replays
  exactly), else under the stamp; an unstamped take plays world-less (null), never under
  the live stage's leftover world. `overlayScene` lays the same effective world over the
  loop's store view, so the contract, the ground and the finish follow the take too.

## 3. Zero-change proof for world-less states

- World-less frames (post-CHAOS / post-opener, world-less documents, the replayGate
  fixture take) take every pre-world path: contract has no world key (pinned), resolve
  input has no world key (spread-only-while-standing), boil channel 0 (pinned), pattern
  keys byte-identical (pinned), strip cells on their periods (pinned), no finish chain.
- `replayGate`, `creatureGate`, `allEraGolden`: green, unmodified fixtures.
- One existing pin was EXTENDED, not weakened: `patternRender.selfcheck` pins the
  renderer's pattern frame call shape; the call now carries the boil kineme time as its
  eighth argument and the pin says so (same layout-blind discipline).

## 4. What was NOT built — two open questions, stopped on, for Matt (one at a time)

The response record ships declared and resolvable, but **nothing consumes its kineme
amounts or its material yet**, because the rulings do not fix how:

- **Q1 (first) — the kineme-amount composition.** Spec §3 fixes only "amounts scale,
  never override". The measured centres live in layout-param units (breath ≈ 0.02–0.13,
  lifeDrift ≈ 0.10–0.20 across styles); as multipliers on a dealt look's kineme amounts
  they would crush dealt motion to a few percent; as absolutes they would override the
  dealt look, which §3 forbids. No composition is written anywhere in the spec or the
  rulings, so none was invented. The question for Matt: how should a style's response
  amounts combine with the dealt look's own kineme amounts?
- **Q2 — the material consumer + the world's ink.** "Material names how its marks answer
  the sun", but the sun's bevel/spec/pool are scene-level and no per-style light seam
  exists; likewise the world's `ink` has no existing mark-colour consumer (palette.ink
  is the UI text-contrast colour and the sun's colour slot — not a line colour), so
  binding either means inventing the rule. Stopped for the same reason.

Also not built, deliberately: **no authored `response` values** on any style (the spec's
§3 examples — swiss matte/breath 0.1, grunge wet/wobble 0.9 — are "illustrative of the
shape, not ruled"; authoring values is a feel call); **no performer dial/lock surface**
over world fields, so spec §4 precedence does not come due in this PR (the step-2 QA
boundary — author override here is authored data, not a performer surface); **no bus
surface** (ruling 9, waits for #1183); **no DISH LIFE rename** (its own slice).

## 5. Verification (as observed in this sandbox)

- `npm run lint`: 0 errors (11 warnings, all pre-existing UI files; none in touched files).
- `npm run format:check`: clean (one file — world.selfcheck — took a prettier pass).
- Decisive suites, run individually with verdict lines read: world (incl. all new step-4
  pins), response (new), sceneContract (15 cases), playback (7 checks), performanceFile,
  replayGate, creatureGate, allEraGolden, cellKinemePlayback, pattern family (elements,
  quilt, glyph, picture, rasterFast, blocks, patternRender 22 checks), canon family
  (canon, canonSettings, canonMotion, canonBaselines, voiceStyle), kineme, palettes,
  chapters — all green.
- Full manifest sweep: 675 pass / 3 fail of 678. The three failures are exactly the
  documented sandbox-environmental set — `swarmWasm`, `rollSafety`, `accum` — proven
  base-identical (same failures on unmodified origin/main in a fresh worktree; CI's
  browser job is authoritative for all three).
- `npm run build`: green, 788 modules.
- Environment note: this worktree's first patternRender run failed in the browser
  section with a WebGL program-link error ("Too many attributes (gl_InstanceID)").
  Proven environmental, not the diff: base @ 38749fb3 + this branch's full source diff,
  in a fresh worktree with a fresh `npm install`, passes 22/22; after reinstalling this
  worktree's node_modules the suite passes here too (22/22). The sandbox's earlier
  node_modules were stale/corrupt (the documented cache family). CI's browser job is
  authoritative regardless.
- CI: CI_TBD.

## 6. Files

New: `app/src/data/canon/response.js`, `app/src/data/canon/response.selfcheck.mjs`
(+1 manifest line), this report.
Touched: `app/src/data/world.selfcheck.mjs` (step-4 pins),
`app/src/gl/sceneContract.js` (contract world), `app/src/gl/liveLoop.mjs` (doc/input
world, ground), `app/src/gl/liveResolve.mjs` (mark boil), `app/src/gl/renderer.mjs`
(frame world state, pattern kinT, line-boil, finish chain), `app/src/gl/playback.mjs`
(take world stand-up), `app/src/pattern/patternSource.js` (kinT + key),
`app/src/pattern/engine.js` + `app/src/pattern/picture.js` (element kinemes on kinT),
`app/src/pattern/patternRender.selfcheck.mjs` (frame-call pin extended).
