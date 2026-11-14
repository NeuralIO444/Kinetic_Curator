# STAGING REPORT — #2104 Q2 (first half): material through light (branch `kc-2104-material-light`)

Base: origin/main @ 3985ba2b (the Q1 blend, PR #2173). One PR. Lane: decided by the
coordinator from the verdict in §1 — the slice is built to be zero-visible-change, so
the expected lane is the zero-review backend lane (arm auto-merge once QA is clean);
nothing here asks Matt to merge by hand unless §1's verdict surprises.

## 1. The visible-change verdict, plainly

**NO VISIBLE CHANGE today — the mechanism is live and provably inert.**

The ruling (Matt, 2026-11-13, issue comment 6873822045): a style's material acts
through LIGHT ONLY — matte flat, enamel hard shine, wet dark and glossy, no edge
behaviour. This slice builds the consumer: the light table and the one seam that reads
it. But a style's material exists only where an author writes one — the response
resolver's MEASURED centre names no material (pinned since step 4), and no shipped
style carries an authored `response` (the response suite pins `s.response ===
undefined` for every style in the deck). So over the whole shipped catalogue, nothing
resolves a material, the seam's helper returns the sun record untouched, and every
frame builds bit-for-bit as it did on the base.

The proof is in the suites, not in this paragraph:

- `response.selfcheck` pins, for every chapter in the deck, that
  `chapterStyleResponse(id)?.material === undefined` — the seam's exact input can
  carry no material today.
- `world.selfcheck` pins, for the house world and EVERY chapter's dealt world, that
  a contract built from a lit doc + that world carries a `light` deep-equal to the
  world-less contract's light — the consumer ran, and changed nothing, across the
  whole dealt deck.
- `replayGate`, `creatureGate`, `allEraGolden` (985 assets, 24296 svg bytes) pass on
  unmodified fixtures — frame-level identity, not just contract-level.

If a future PR authors a material onto a style (Matt's feel call — the spec's §3
swiss-matte / grunge-wet examples are illustrative of shape, not ruled), THAT PR is
the visible-change one and goes to the review lane. This one only makes it possible.

## 2. The seam, and why it is the seam

The step-4 report stopped on Q2 because "the sun's bevel/spec/pool are scene-level
and no per-style light seam exists". The survey found the seam the step-4 build itself
created: **`buildSceneContract` (`app/src/gl/sceneContract.js`)**. In one function,
from one doc, two scene-level spreads sit side by side: the sun
(`contractLight(doc.light, pal)`) and the standing world (`sanitizeWorld(doc.world)`).
Every production path that renders — the live loop (which passes the frame's standing
world into the doc), playback (whose overlay lays the take's world over the same doc
path), export and accum stills (whose project docs carry the recorded world) — builds
its contract here, and the renderer turns `contract.light` into the sun uniforms
(`u_sunLight`, `u_ambient`, `u_sunMat` = (bevel, spec), `u_pool`) on both draw paths.
So modulating the contract sun's existing numeric fields, from the doored world's
chapter response, reaches every mark exactly once per build — the same
resolve-once discipline the blend uses in the resolver, at the contract's own point.

Why not the alternatives:

- **Not in `contractLight`** (data/light.js): that is the sun's DOOR — sanitize +
  colour resolution. Doors in this codebase do not consume Canon state; the blend
  likewise lives in the consumer, not in a door.
- **Not per-instance in the shader**: the glass precedent (`glassBevel.mjs`) selects
  a bevel variant per instance via `v_glass`, but the ruled material is the STANDING
  STYLE's answer to the sun — scene-level, like the world itself — and the shader's
  sun block is source-pinned by the glass family. Modulating the uniform VALUES
  upstream leaves every shader string untouched.
- **No resolved shape changes**: the modulation rewrites values of fields the
  contract sun already carries; it adds no key anywhere (the step-2 lesson: a new
  key in a resolver's output rewrites every frame hash). `assertSceneContract`
  validates the carried world as a door fixed point and places no fixed-point demand
  on the sun; a modulated sun remains inside the sun's own field ranges by clamping.

## 3. The light table and the helper (data/canon/response.js)

Beside the blend, in the module that owns the response record:

- **`MATERIAL_LIGHT`** — the one home of the starting vocabulary's light behaviour.
  Each word maps to FACTORS over the contract sun's fields:
  - `matte`: `{ bevel: 0, spec: 0 }` — flat, no shine. The bevel relief and the
    specular are answered with nothing; the mark is still lit by the flat light that
    remains (ambient + diffuse are not the material's to take).
  - `enamel`: `{ spec: 1.6 }` — a hard shine: the specular strengthens. Its
    TIGHTNESS is the shader's existing enamel default (the bevel block's spec
    power, 48) and is deliberately not the table's to change.
  - `wet`: `{ intensity: 0.7, ambient: 0.7, spec: 1.5 }` — dark and glossy: the
    light that reaches the mark falls on both its terms (darkening THROUGH light,
    never a tint — the sun's colour is untouched, pinned), and the specular
    strengthens against the darkened base, which is what wet gloss is.
  Fields a word does not name — position, height, pool, colour — are the sun's own
  character and never the material's. The numbers are implementation constants in
  this one table, tunable like the blend's pull; the qualitative mapping is the
  ruled part.
- **`applyMaterialLight(light, material)`** — scales the named fields, clamped to
  the sun's own 0..1 field range (a strengthened specular can never push past 1).
  Identity is a law, as with the blend: a null sun, a missing material, or a word
  the table does not carry (the vocabulary is OPEN — an unlisted word is lawful
  data reading as unmodulated, e.g. `raw-linen`) returns the sun record ITSELF —
  same reference, no float ops, no shape change. A modulating answer is a copy
  carrying exactly the input's keys, in the input's order, and a field the sun
  does not carry is never invented.

The seam, in `buildSceneContract`'s sun spread: door the doc's world (the same
pure door the world spread below applies), resolve
`chapterStyleResponse(world.chapter)?.material` once for the build, and answer the
contract sun through the helper. `sceneContract.js` never names the table — a suite
pin proves it consumes through the helper only, mirroring the blend's single-home
pin on the pull.

## 4. What was NOT built

- **No authored `response` values on any style** — no style is assigned a material
  in this PR (authoring values is Matt's feel call; the deck's pin stands).
- **The world's ink (Q2, second half)** — untouched: no line-colour consumer, no
  mark-colour seam. It has its own ruling (6874295763) and its own slice.
- **No edge behaviour of any kind** — no bleed, no crisping, no geometry, no shader
  change: the QUAD_FS source is byte-untouched.
- **No dial/lock surface** over the material or the table — spec §4 precedence does
  not come due.
- **No bus surface** (ruling 9). No DISH LIFE rename. The ground, finish, boil and
  blend behaviour of steps 1–4 + Q1 are untouched.

## 5. Verification (as observed in this sandbox)

- `npm run lint`: 0 errors (11 warnings, all pre-existing, in UI files — App.jsx,
  FavoritesTray, ShelfView, pipeline rows; none in touched files).
- `npm run format:check`: clean (the two edited selfchecks took a prettier pass).
- Decisive suites, run individually with verdict lines read: response (incl. all new
  material-light pins), world (incl. the new contract-sun identity pins),
  sceneContract (15 cases), light, light.pool, playback (7 checks), performanceFile,
  livingMotion (18 checks), replayGate, creatureGate, allEraGolden (985 assets,
  24296 svg bytes — byte-identical) — all green. The kineme, canon, pattern and
  glass families (37 manifest suites): all exit 0.
- Full manifest sweep (continue-on-error loop over all 683 manifest lines): every
  suite green except the three documented sandbox-environmental failures, each
  proven BASE-IDENTICAL against a detached worktree at the base head (3985ba2b)
  with identical node_modules — swarmWasm (the same `build-wasm.sh --verify`
  assertion: the checked-in kernel wasm does not reproduce in this sandbox),
  rollSafety (the same `page.evaluate: Target crashed` in the headless-browser GL
  section, after its pure checks pass), accum (the same native abort, exit 134,
  same V8 frame tail, after 69 checks pass). The sweep's own shell was OOM-killed
  at ~line 617 of 683; the tail (lines 610–683) was re-run separately: 74/74 pass —
  together the two runs cover every manifest line. CI's Mac-runner jobs are
  authoritative for the three.
- `npm run build`: green (✓ built in 3.54s).
- CI (PR #2174, run 43623358828, as observed): closes-line ✓ · cargo-check ✓ ·
  advisory-audit ✓ · lint-build-selfcheck ✓ (12m34s) · selfcheck-browser ✓
  (32m30s) · e2e-smoke ✗ (5m24s) — read from the failed job's log: the single
  failure is `e2e/topbar-expand.spec.js:323` ("KIN cools by gliding"), its
  animation-speed sampling assertion (fastest stretch 1.75 px/ms against the
  1.5 bound, spec line 373) under Mac-runner load; 111 specs passed. That is the
  documented topbar-glide flake family (the AGENTS.md ruleset note names this
  spec and signature on main's own runs); this PR touches no UI, topbar or
  animation code. A re-run of the e2e job is the coordinator's call.

## 6. Files

Touched: `app/src/data/canon/response.js` (MATERIAL_LIGHT + applyMaterialLight;
header updated — the material is consumed now, through light only),
`app/src/gl/sceneContract.js` (the sun spread answers through the standing chapter's
material; one import line), `app/src/data/canon/response.selfcheck.mjs` (section 8:
the table, per-word behaviour through synthetic authored responses, identity laws,
the deck-wide no-material proof, the table's single home),
`app/src/data/world.selfcheck.mjs` (the seam's identity pins across the house world
and every dealt chapter world). No manifest change (both suites already run).
