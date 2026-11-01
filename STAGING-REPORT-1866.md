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

## Design (as built — filled in per commit)

(filled in as the build lands)

## The coordinator wiring spec (NOT applied by this build)

(filled in at the end — exact liveResolve.mjs diff plan + the input
stamping question, for the coordinator to apply and diff personally)

## Verification

(pending)
