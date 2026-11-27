# STAGING REPORT — #2104 follow-up: the style-response blend (Q1) (branch `kc-2104-response-blend`)

Base: origin/main @ d078122e (step 4, PR #2172). One PR, review lane — Matt merges.

## 1. The visible-change verdict, plainly

**This PR CHANGES how the stage feels — it is a feel change, so it is REVIEW LANE.**
Step 4 shipped the style-response record and resolved it, but nothing consumed it (QA on
PR #2172 verified zero consumers). This slice is the first consumer, built exactly on the
composition Matt ruled on 2026-11-13 (Q1, issue comment 6869761329): a dealt look's kineme
amounts now BLEND toward the standing chapter-style's measured response amounts.

What Matt would actually feel, honestly: the measured centres are small (breath
0.02–0.13, drift 0.10–0.20 across the eight measured styles) and a fresh scene's dealt
defaults are larger (breath 0.3, drift 0.5), so on a typical scene the blend CALMS the
living motion toward the chapter's character — a default scene standing in Swiss resolves
at breath ≈0.16, drift ≈0.30 instead of 0.3/0.5. It is a softening of the ambient breath
and drift, not a new motion and not a dramatic one; on an already-quiet look dealt below
its style's centre (say breath 0.01 in Engraving, centre 0.13) the pull runs the other
way and the scene breathes a little more. The single most noticeable case: a look dealt
completely still (every amount 0) is no longer frozen while a measured chapter's world
stands — it breathes gently at half the style's centre. Before any chapter landing (the
house world), and in the chapters whose styles have no members to measure (Organic /
Pixel / Techno) or no style at all (Now), nothing changes at all — the amounts pass
through untouched. Motion cannot be screenshot; this paragraph is the evidence, and the
suite pins below prove the maths the paragraph describes.

## 2. The seam, and why it is the seam

The survey found exactly one point where a dealt look's kineme amounts and the standing
chapter's style meet: the living-motion floor in the resolver, `livingMotion`
(`app/src/gl/liveResolve.mjs`). It is where step 4 already binds the world's boil, from
the same doored world:

- The resolver already doors the frame's world once per resolve. It now also resolves
  `chapterStyleResponse(world.chapter)` once per resolve, beside the boil — a pure
  function of the recorded world and the authored Canon data (no clock, no dice), so a
  take replays under exactly the pull it was performed with.
- `livingMotion` receives the response exactly the way it already receives the world's
  boil: one more threaded argument, on all three call sites (content layers, moth floor,
  dish-creature floor — the creature floors stand in the same world as the marks).
- Inside, the dealt literal `{ breath: kinemeBreath, drift: kinemeDrift, pulse:
  kinemePulse }` passes through `blendResponseAmounts` BEFORE `patternAmounts` re-weights
  it. Order matters and was chosen deliberately: the blend adjusts what the LOOK brings;
  the Director pattern's re-weighting (SWELL ×3, THUMP's beat pulse) and the beat itself
  still apply afterwards, unchanged — the pattern's say comes last, as it always has.
  Blending after the pattern would have let the style resurrect amounts a pattern
  deliberately zeroed.

`blendResponseAmounts` and the pull live in `app/src/data/canon/response.js`, beside the
record they consume: `RESPONSE_BLEND_PULL = 0.5` (the ruled even blend), one named
exported constant, read in exactly one module — a suite pin proves the resolver calls the
helper and never names the constant.

## 3. The blend's exact behaviour (the exactness laws)

- Per key: `blended = dealt + PULL × (response − dealt)`, for the measured keys only —
  breath and drift. Pulse and wobble are NEVER blended (never measured, never invented),
  even if an authored response someday declares them; palette-breath and brush-wobble are
  separate channels the response does not name and are untouched.
- Only keys BOTH sides carry move: a response key with no dealt counterpart invents
  nothing; a dealt key the response does not carry passes through at its exact value.
- Null response (no world standing, the chapterless house world, a memberless style, the
  style-less Now chapter, an unknown chapter) → the helper returns the dealt amounts
  object itself — same reference, no float operations, no shape change. World-less and
  unmodulated frames resolve bit-for-bit as before this slice: replayGate, creatureGate
  and allEraGolden (985 assets, 24296 svg bytes) pass on unmodified fixtures, and NO key
  is added to any resolved shape (the step-2 lesson: a new key in the resolver's output
  rewrites every frame hash — this slice adds none; it only changes two existing values,
  and only while a measured world stands).
- Playback: the blend is a function of the take's recorded world (through its chapter)
  and the recorded layout amounts, both already in the take — so playback re-derives the
  same blended amounts the performance resolved. Unstamped takes carry no world and play
  exactly as recorded, untouched.

## 4. What was NOT built

- **Q2 — the material consumer and the world's ink: untouched.** The response's material
  still has no consumer; no mark-colour seam was created. Q2 is next in Matt's question
  line and is not pre-decided by anything here.
- No authored `response` values on any style (the response suite still pins
  `s.response === undefined` for every shipped style — all answers remain measured).
- No performer dial/lock surface over the pull or the world: the pull is a named constant
  in code, not a dial — spec §4 precedence does not come due.
- No bus surface (ruling 9). No DISH LIFE rename. The census harness, which builds its
  own un-blended floor context to MEASURE the drivers, is a probe, not the render path,
  and is deliberately left measuring the un-pulled floor.

## 5. Verification (as observed in this sandbox)

- `npm run lint`: 0 errors (11 warnings, all pre-existing, none in touched files).
- `npm run format:check`: clean (one file — response.selfcheck — took a prettier pass).
- Decisive suites, run individually with verdict lines read: response (incl. all new
  blend pins), world, sceneContract (15 cases), playback (7 checks), performanceFile,
  replayGate, creatureGate, allEraGolden (985 assets, 24296 svg bytes — byte-identical),
  livingMotion (18 checks, 3 new: the blend through the real resolver, exact pass-through
  for no-world/house/memberless, the pull waking a still floor), the kineme family
  (kineme, gl kineme, kinemes, kinemeCulture 8, kinemeScatter, kinemeStack 13,
  kinemeRateAudio, driverTable, kinemeSources 9, cellKinemePlayback), the canon family
  (canon, canonSettings, canonMotion, canonBaselines, voiceStyle, canonBus), the pattern
  family (elements 10, quilt 24, glyph 30, picture 14, rasterFast 8, blocks 12,
  patternRender 22, motion 19, tides 12, rewrite 10, field 30, patternRoll 7,
  patternTrack 17, patternShuffle 12, patternAudio 7, patternEditor 6) — all green.
  Source-shape sweep: the suites that read liveResolve.mjs's source (formation,
  clockRecord, stressRecord and kin) are inside the manifest sweep below and pass.
- Full manifest sweep: **680 pass / 3 fail of 683**. The three failures are exactly the
  documented sandbox-environmental set — `swarmWasm` (no cargo on PATH), `rollSafety`,
  `accum` — proven base-identical: the same three fail with the same signatures on
  unmodified origin/main @ d078122e in a fresh worktree. CI's browser job is authoritative
  for all three.
- `npm run build`: green (✓ built in 3.52s).
- CI: CI_TBD.

## 6. Files

Touched: `app/src/data/canon/response.js` (RESPONSE_BLEND_PULL + blendResponseAmounts;
header updated — the kineme amounts are consumed now, the material still is not),
`app/src/gl/liveResolve.mjs` (the response resolved once per resolve from the doored
world; threaded to the floor's three call sites; the blend inside livingMotion ahead of
patternAmounts), `app/src/data/canon/response.selfcheck.mjs` (blend pins: exact maths,
per-key only, pulse/wobble never, identity = same reference, the constant's single home),
`app/src/gl/livingMotion.selfcheck.mjs` (the seam against the real resolver path).
Plus this report. No manifest change (both suites already run).
