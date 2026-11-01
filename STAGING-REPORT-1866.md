# STAGING REPORT — #1866 BEAST S3: the drawn beast

Issue title (verbatim): **"BEAST S3: the drawn beast — a stamp-rendered linkage creature that walks in place"**
Branch: `feat/1866-beast-s3-drawn` on origin/main c83dad2b.
Governing docs: the issue body (no comments), the Beast foundation handoff
(2026-10-31), `docs/design/creatures-spec.md`, the epic spec
(`docs/design/strandbeest-epic-spec-2026-10-29.md`), the substrate audit
(`docs/design/strandbeest-substrate-audit-2026-10-29.md`).

## Premises verified against the actual tree (2026-11-01, before any code)

1. **S1/S2 foundation is as the handoff says.** `jansenMeasures.js` exports
   JANSEN_HOLY / JANSEN_RELATIVE / WANG_ANCHORS / MEASURE_RANGES /
   MEASURE_IDS / wildTypeMeasures (holy numbers exactly as briefed; k's range
   is the ±2% tripwire). `jansenSolver.js` exports solvePose /
   evaluateGenome / isStillborn — pure, closed-form, branch pinned by the
   signed-area rule (J2 +, J3 +, J4 +, J5 −, F +). `solvePose` returns joints
   {J1..J5, F}; the frame points O (origin) and G (−a, −l) are internal —
   the builder recomputes them from the same lengths, no solver change.
2. **The solver's coordinate frame, measured** (probe on wild type, a=38):
   the leg hangs toward **negative y**; stance (Wang's lowest-15% band) sits
   at y ≈ stanceMean (−88.9 at a=38, −2.34 relative); the foot lifts to
   −63.1 in swing (clearance 25.7 ✓). During stance, as θ rises, the foot
   travels **+x** (−52.1 → −8.8). Canvas mapping is therefore
   `screen = origin + (lx, −ly) · unitPx`, and a right-facing beast runs its
   crank **backwards** (θ decreasing with driver time) so the stance foot
   strokes backward under the body — no glide, no skate, by geometry.
3. **The S3 stub is a pose calculator, not a builder.** `beastBuilder.js`
   (36 lines) exports buildBeastPose (7 of the 12 bars, no frame/crank/beam,
   no items) + stepCrank. Nothing anywhere imports it (grep: only the file
   itself). The bar set from the solver's own construction is 12:
   crank O–J1 (m) · frame O–G · G–J2 (b) · J1–J2 (j) · J2–J3 (e) · G–J3 (d) ·
   J1–J4 (k) · G–J4 (c) · J3–J5 (f) · J4–J5 (g) · J4–F (i) · J5–F (h).
4. **The builder contract** (creature.js / dishCreature.js, read in full):
   `createXBuilder()` → `{ append(input, entries, pool, motionFor, groundFor),
   snapshotState(), restoreState(s), dispose() }`. append counts **every**
   resolver frame; finds the top content entry (last non-FX, non-pattern
   entry with items); reads the palette from it; emits flat stamp items
   flagged `_creature: true` with keys `creature:<pin>:…`. Per-pin data
   rides resolver input fields; an absent field = byte-identical old stage.
   The architecture moved since the audit: the resolver owns the spawn
   channel (#1694), decisions are published by liveResolve and stamped onto
   the next frame's input by liveLoop.
5. **The one-writer seam is real and is NOT this builder's to cross.**
   Wiring a third family needs liveResolve.mjs (import + construct + append
   + dispose + snapshot/restore, ~15 lines) and a liveLoop.mjs stamp for any
   spawn-derived host field. Both are one-writer files; the audit itself
   calls the wiring "serial, coordinator-owned work". **This build therefore
   delivers the complete builder + input contract + suites + cost, and the
   exact wiring spec (below) for the coordinator to apply and diff
   personally** — the #1830/#1910 pattern. Consequence, stated plainly:
   screenshot evidence is rendered from the builder's own emitted items
   through the app's asset SVGs in a harness (same items, same transforms);
   the live stage shows beasts the moment the coordinator lands the wiring.
6. **Genome → measures exists.** `expressGenome(genome, age)` collects
   measure genes into `out.measures` (creatureGenome.js); `addJansenMeasures`
   writes them (S1). The builder's host record takes measures directly;
   `beastHostFromGenome` is the seam the record slices (#1849/#1852) will use.
7. **Drawing assets exist in the stage vocabulary.** Bars:
   `line_solid_01` — a solid line spanning x∈[6,94] (88 units) at y=50,
   stroke-width 4, round caps. Nodes: `dot_single_01` — a filled circle
   r=14 (28 units) at centre. Both take the item's colour through the
   asset's ink slot, so the ground recolour dresses them like any mark.
8. **Cost.** `beast/solver` (0.08 ms, declared "estimate pending real
   measurement") and `beast/trails` already registered in the append-only
   BEAST block of costRegistry.mjs. The issue requires the **drawing** cost
   registered and **measured** at the 4-creature cap — that registration
   does not exist yet; S3 adds `beast/draw` in its own append-only block,
   measured by a builder bench at cap (the creature/alife precedent:
   builder-only bench, median of warm frames). creatureCost.selfcheck reads
   only creature/moth + creature/dish by name — a new beast tier breaks
   nothing there (verified by reading it).
9. **Citizen gates.** mothsAllowed/dishAllowed wrap the append calls in
   liveResolve; the family option is 'both'|'moth'|'dish' — there is no
   'beast' family value, and inventing one is a citizen-semantics change.
   The builder follows the family pattern (the gate belongs to the call
   site); the wiring spec flags the citizen question for the coordinator/
   Matt rather than silently extending CREATURE_FAMILIES.

## D-B1–D-B4 disposition (the stop rule)

- **D-B1 (reading of the body)** — the profile reading is embodied in the
  ruled scope itself: the issue ("side-on" builder at a pin, stance
  "stationary against the ground line"), the handoff work order ("wire the
  side-on stamp path"), and the shipped stub's header all say profile. The
  drawn-structure/signature half of D-B1 is S5's content (#1868), out of
  scope here. Building the profile follows the issue; not a stop.
- **D-B2 (tier order)** — Jansen first is already foundation fact (S1/S2
  shipped Jansen only). Not S3's to revisit.
- **D-B3 (pantograph scale gene)** — S1 shipped the plain `scale` gene
  (0.6–1.4); no pantograph gene exists in the tree. The builder consumes
  `scale`; adopting a pantograph gene is a genome change for the record
  slices, not a drawing-slice structure decision.
- **D-B4 (stillbirth visibility)** — the builder draws nothing for an
  infeasible genome (the gate is S2's evaluateGenome, applied before any
  item exists). Whether a stillbirth is ever *shown* is a record/lineage
  surface question (#1849/#1852 territory); nothing in S3's structure
  depends on it.
→ No D-B decision changes S3's structure. No stop.

## Design (as built)

**`app/src/engine/beastBuilder.js`** — rewritten from the stub into the
third builder, same contract as the families: `createBeastBuilder()` →
`append(input, entries, pool, motionFor, groundFor)`, `snapshotState()`,
`restoreState(s)`, `dispose()`, plus `lastFeet()` (the moth's
lastSkeletons-style debug read). The stub's pose-level exports survive,
completed: `buildBeastPose` (all 12 bars + 8 nodes per leg), `legPoints`,
`stepCrank`.

- **Input contract.** One new field, `input.beastHosts`, parallel to
  dishPins: `null`/absent = no beast; otherwise `{ measures, drive?,
  phase? }` — S1 relative measures (sanitized against MEASURE_RANGES,
  k's tripwire included), drive = the crank-rate multiplier clamped to
  the genome's drive-gene range [0.25, 2], phase = crank offset in turns.
  Absent field → the builder appends nothing (every pre-S3 take is
  byte-identical). Formed pins only; a dish-hosted pin grows no beast.
- **The drawing.** Per leg: the full 12-bar linkage (crank, frame, the
  ten moving bars) as `line_solid_01` stamps fitted endpoint-to-endpoint
  (scaleX = length/88, thickness from a named solver-unit constant), 8
  nodes as `dot_single_01` (hub stouter, foot stoutest), plus one body
  beam through every crank centre. Legs stand along the beam at 0.85-unit
  spacing, each at its own phase (measure genes phase0..N, default
  i/legCount). The pin is the ground point under the body's centre: the
  crank line rides at pin.y + stanceMean·unitPx, so stance feet plant
  exactly on the pin's ground. All items `_creature: true`, keys
  `creature:<pin>:beast<leg>:bar|node:<name>`.
- **The crank.** θ per leg = TAU·(phase + legPhase − crankHz·drive·
  driverSec), crankHz = 0.18. driverSec is the layer's anchored kineme
  clock via motionFor — the same floor the band paces and both families
  read; no wall time, no dt integration, so the pose at a frame is a pure
  function of the input sequence. The crank runs backwards (θ falls) so
  a right-facing beast's stance foot strokes backward. **No hover, no
  breath**: a walking body's feet must stay planted — drift would be
  skate. The moth's still-pin law is respected by construction (the
  anchor never moves).
- **Colour / ground.** Bars in the palette ink, joints in the most vivid
  swatch (the moth's ranking), feet in the next; every colour passes
  through `groundTreatment` (the same GROUND/EDGE/SNAP functions the
  marks use) sampled at the pin — the beast dresses for the room.
- **Feasibility.** Per measures-fingerprint, `evaluateGenome` runs once
  (cached, derived — never snapshotted): infeasible → no items, ever
  (a stillbirth). A pose failing at an off-grid angle skips that leg for
  that frame rather than crashing. The gait score is computed nowhere in
  the draw path and gates nothing.
- **Grow-in.** Per-pin ages with the moth's easeOut over 45 frames,
  scaling the whole beast up from its ground line (feet stay planted).
  A changed measures fingerprint at a pin re-hatches it. Snapshot =
  { ages, keys, frame }, all-or-nothing restore, the fingerprint riding
  along so a restored take doesn't re-hatch a grown beast.
- **Genome seam.** `beastHostFromGenome(genome, age)` — expressGenome's
  measures, complete set or null. For #1849/#1852 to consume; nothing in
  S3 calls it live.
- **Cost.** `beast/draw` registered (own append-only block in
  costRegistry.mjs), **measured**: builder bench at the 4-creature cap
  (4 wild-type beasts, 964 items/frame) — append median-of-medians
  0.271 ms/frame, solver leaf alone 0.022 ms of it, drawing 0.249 →
  registered 0.25 ms. (beast/solver's declared 0.08 estimate stands —
  its block is S2's; the bench number is recorded in my block comment.)

**Suite** — `app/src/engine/beastDraw.selfcheck.mjs` (registered in
app/selfcheck.manifest after the foundation suite): 10 checks — the
gates (absent field / null host / unformed / dish-hosted / stillbirth),
item accounting (241 items at the wild type), a solver anchor, and the
issue's acceptances at the builder contract: (1) mid-stance height
range/step < 0.05, stance stroke monotone backward, stance planted on
the pin, swing height matching the solver's clearance; (2) the h×1.15
mutant's drawn foot path diverges > 2px with metrics to match;
(4) two fresh builders byte-identical, snapshot continuation
bit-identical; the genome seam; ground treatment reaching the items.
Zero re-pins (one fixture expectation of mine was corrected during the
build: genome gene values are rounded to 4 places by creatureGenome
itself, so the seam check compares at that grain).

## The coordinator wiring spec (NOT applied by this build)

In `app/src/gl/liveResolve.mjs` (one-writer; apply + diff personally):

1. Import beside lines 73–74:
   `import { createBeastBuilder } from '../engine/beastBuilder.js';`
2. Construct beside line 610: `const beasts = createBeastBuilder();`
3. Append after the dishCreatures.append block (~line 1425), passing the
   SAME livingMotion / creatureGround closures the other families get,
   gated. Gate decision for the coordinator/Matt: the citizen family
   option has no 'beast' value today (curator/creatureCitizen.js);
   the minimal honest gate is `creatureEnabled(input)` — the builder
   itself only acts where input.beastHosts carries a host, the same
   input-gate law as every creature loot gate since #1731. Extending
   CREATURE_FAMILIES with 'beast' is a citizen-semantics change, left
   to the record slices that give the tile something to say.
4. Snapshot: add `beasts: beasts.snapshotState()` beside the
   dishCreatures entry (~line 1489); restore beside lines 1512–1513 and
   1558; the shape guard beside line 1674 must treat `snap.beasts` as
   OPTIONAL (pre-S3 snapshots carry none — restore empty, the moth's
   optional-key convention).

In `app/src/gl/liveLoop.mjs` (also one-writer): **nothing for S3.**
input.beastHosts is deliberately unstamped until a host source exists:
the creature-record assembler (#1849) is that source (its records'
genomes → beastHostFromGenome). An interim spawn-channel allocation
(beastHosted, decided like dishHosted) is possible but is a ruling to
take with Matt — it invents a stage-allocation policy S3 was not given.
Until either lands, the field is absent live and this slice changes no
live behaviour — the beast exists at the builder contract, proven, ready
to append the frame the wiring lands.

## Verification

- **New suite**: beastDraw 10/10 (see above). beast foundation suite +
  jansenSolver suite + costRegistry + creatureCost + registry.tiers +
  runSelfcheck suites all re-run after the registry edit: green.
- **format:check**: clean (`npm run format:check` in app/ — one
  prettier fix to the new suite, applied and re-verified).
- **e2e grep**: no `beast` reference anywhere in app/e2e — no surface
  changed, nothing to re-pin.
- **Full manifest sweep** (continue-on-error loop over
  app/selfcheck.manifest, log at ~/workspace/kc1866-sweep-results.txt):
  **565 lines run, PASS=558, FAIL=7** — quoted from the sweep's own
  markers. Process note, stated plainly: the sweep ran in two segments
  (431 lines, then a resume of the remaining 134) because the first
  loop's session was reaped mid-run while a second lane's sweep was
  loading the same sandbox (the VM also restarted once in the window);
  coverage is complete with no gap or overlap (segment 2 began exactly
  at the line segment 1 died on).
- **All 7 failures are proven sandbox environmentals, none touching
  this slice's files:**
  - swarmWasm — needs cargo; `command -v cargo` is empty in this
    sandbox.
  - fx/rollSafety — Chromium `page.evaluate: Target crashed` in the
    shared GL harness; **base-identical**: pristine origin/main
    (c83dad2b, detached worktree) dies with the identical crash after
    the identical 5 checks.
  - gl/composite — standalone re-run: **OK (15 cases)**.
  - gl/accum — standalone re-run with the manifest's heap flag:
    **OK (85 cases)** (in-sweep it aborted natively under load).
  - gl/wetWarmup — standalone: **21 checks passed**.
  - gl/livingMotion — standalone: **15 checks passed**.
  - pattern/patternRender — standalone: **21 checks passed** (in-sweep
    its browser was closed mid-run after all rendered checks passed).
  CI's selfcheck-browser job remains authoritative for the gl/fx set.
- **Screenshots** (~/workspace/kc-1866-shots/, labelled build 31a7aadc):
  sheet-wild-gait-cycle.png (6 frames, one crank revolution),
  hero-wild.png, hero-mutant-h115.png — the builder's own emitted items
  rendered through the app's asset SVGs on canvas2D, because the stage
  shows beasts only once the coordinator lands the wiring spec above.
  The mutant hero is visibly rangier than the wild type at the same
  driver second. Scratch harness files were deleted after the shots.

## Files in this slice

- `app/src/engine/beastBuilder.js` — rewritten (the builder + pose
  helpers + genome seam).
- `app/src/engine/beastDraw.selfcheck.mjs` — NEW, the S3 suite.
- `app/selfcheck.manifest` — +1 line (the new suite, after beast).
- `app/src/engine/kernel/costRegistry.mjs` — append-only `beast/draw`
  block (measured 0.25 ms at cap).
- `STAGING-REPORT-1866.md` — this report.

Nothing else. No one-writer file touched; no live behaviour changes
(input.beastHosts is absent from every live input until stamped).
