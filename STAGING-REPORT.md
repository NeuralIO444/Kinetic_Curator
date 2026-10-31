# STAGING REPORT — #1794 Loot: streamlines — the field drawn as structure (node-influence field)

Review-lane build (Matt judges feel and merges). Branch `feat/1794-streamlines`, base `origin/main` 9deca870. Not pushed, no PR — coordinator publishes.

## What was built

Both halves of the issue, as peers of the existing machinery:

1. **Node-influence field** — `app/src/engine/kernel/field/nodeField.js`, registered in the field registry as `nodes` (`reads: ['seed']`, costTier 0, the field family rate). A seed-deterministic graph of 26 nodes (hash-placed with attractor-style spacing rejection): each node links to its 3 nearest neighbours; 3 hash-chosen **sources** hold influence 1 and it propagates node-to-node with decay 0.82 per hop (proven in the selfcheck to converge to exactly decay^graph-distance). `sample()` returns the falloff-weighted mean influence (the density any field consumer already reads); `sampleVector()` returns the flow: every node's flow points at its highest-influence neighbour, and **sources are sinks that pull radially inward** (see decision 2). The field appears in the kernel tiles UI automatically (the panels roster is the registry roster).

2. **Streamline trace sampler** — `app/src/engine/kernel/sample/streamline.js`, registered in the sampler registry at **costTier 2** (see decision 5). Traces start at nodes and integrate the field's flow with midpoint steps until they reach a source's doorstep, leave the plate, hit a dead zone, or exhaust their step budget. The trace set is built once per (seed, seedOffsets, plate, knobs) and cached (colonize/brush scheme); the sampler deals the traces' points round-robin — `t` is progress along the trace, `rot01` is the trace tangent, so stamps aim along the line. The picture is the paths themselves: marks are dealt *along* lines, never scattered and then connected.

Plumbing follows the sibling path exactly: registry → `placement.js` (knobs + geometry signature) → `buildPlacements.js` → `layout-modes.js` (`LAYOUT_MODES` entry `streamline`, name "streamlines", glyph "stream"; `DEFAULT_LAYOUT_PARAMS` + `PARAM_RANGES` for the three knobs). The mode is dealt by KINETIC rolls like its kernel siblings — the Markov table gained it in the **growth** family (transitions.js), beside dla/eden/colonize.

## Design decisions (each one Matt-overruleable at review)

1. **Flow ascends influence; sources are sinks.** "Sources" in the filing could read as emitters; I built the opposite polarity — traces grow from ordinary nodes *toward* the 3 source hearts and terminate there — because that is what makes lines *connect* nodes into structure (a trace is a drawn graph path). Flipping polarity is a small change if Matt wants fountains instead of rivers.
2. **Sources contribute radial inflow to the vector blend, not their zero node-flow.** First cut had the textbook sink (zero flow), and it numerically *repelled*: the source's high falloff weight diluted neighbours' onward flow near the heart, and only 0–4 of 42 traces ever arrived. With inflow, 25–42 of 42 arrive across test seeds. Pinned by a new field selfcheck (flow near a source points at the heart, dot > 0.5).
3. **Traces seed at nodes, not uniformly.** Sibling traces off one node fan out via a hash offset inside the node's radius. Uniform seeding would draw the field's weather; node seeding draws the *graph's* structure, which is the issue's claim.
4. **Node count (26) and influence radius (0.24) are named constants in nodeField.js, not panel knobs.** Only the trace knobs are plumbed (`streamlineTraces` 42 · `streamlineSteps` 180 · `streamlineStep` 6, all bounded: traces ≤ 96, steps ≤ 400, step 2–24). If Matt wants to play the graph's density, promoting the constants is a follow-up.
5. **Cost tier 2 for the sampler** — the registry's written scale: tier 2 = "cached per-seed structure + per-point reads" (colonize, brush, voronoi, ca). The trace build is a one-off CPU cost per seed (bounded: ≤ 96 traces × 400 steps of O(nodes) vector blends, cached in a 6-entry cache); per frame and per point it is O(1) array reads — zero per-frame cost shape, nothing for the governor to shed at runtime. The field itself rides tier 0 like every registered field.
6. **No BUILD-panel tile and no stub voice.** The composition grid is built from STUB_VOICES; the whole kernel sampler family (brush, colonize, voronoi, poisson, circlepack…) has no tile and no voice — they are dealt by rolls. Streamline matches its siblings; a tile + voice (asset pools, vibe copy) is curated content for Matt to commission, not for a builder to invent.
7. **Dealing is brush's count-dependent round-robin; the traces themselves are count-independent** (same seed + knobs = same traces regardless of mark count; only the dealing stride moves).

## Premise results

All filing premises verified true against the tree before building: kernel fields are scalar `{kind, sample}` registrations in `FIELDS`; samplers are declared registrations returning `{x, y, t, rot01}`; colonize (#1197) is the cached-graph sibling; the plumbing path is registry → placement → buildPlacements → layout-modes. One premise needed a correction in-flight, not a stop: the field layer's vector story lives on the *sampler* side in today's code (fields are scalar-only), so the flow vector is an extension method on the node-field instance (`sampleVector`), not a registry-contract change — no existing consumer is affected.

## Verification

- **New suites:** `nodeField.selfcheck` 12/12 · `streamline.selfcheck` 8/8 (determinism, count-independence of traces, step spacing == the named step, rot01 == tangent, arrival + doorstep bound, column-mode parity, knob clamps).
- **Live-path smoke (headless, real placement):** `computePlacements` with mode `streamline` dealt 600/600 marks spanning the full plate, `t` ∈ [0, 1]; changing seed, trace count (585/600 points move) and step (560/600) all re-deal.
- **Full manifest sweep:** 544 suites. 12 failed on first pass; every one adjudicated:
  - **8 were this change's legitimate blast radius — fixed by re-pin / registration, each with its cause:**
    - `registry.tiers` — built-in count 27 → 28, `streamline` added to the tier-2 list.
    - `census` — distinct layout signatures 22 → 23 (streamline's signature is distinct; collision list unchanged).
    - `kernelTiles` — field tile roster + `nodes`; field registry count 6 → 7. Same count pin re-pinned in `dishWeather`.
    - `transitions` — `streamline` added to the Markov **growth** family (the file's own #720 invariant: an unfamilied mode is unreachable from brush's row); seeded-chain pin re-derived (the walk legitimately diverges when the domain grows; the stochastic / reachability / kin-affinity / stationary checks pin the mechanics independently).
    - `wingWarp` — REST/BENT resolver pins re-based (`dfb2915f` → `4b47bdad`, `981bdefe` → `a88fdc98`). Strip proof first, per the file's own precedent chain (#1183/#1694/#1574–6): with the 3 new default keys stripped, the suite reproduces the old pins exactly — the only delta is the keys at parity defaults; builder pins unmoved.
    - `replayGate` + `creatureGate` + `refreshFixtureCheckpoints` — both `.kcperf` fixtures re-recorded with the sanctioned checkpoint-only tool (`scripts/refreshFixtureCheckpoints.mjs --write`): replayGate 61/61 checkpoint hashes moved, creatureRepipe 16/16, `nonCheckpointDiffs: []`, inputs byte-identical, deterministic across two runs; strip proofs attached (with the 3 keys stripped, both originals verify byte-for-byte). Provenance entries appended to both PROVENANCE.md files with the sha256s.
  - **4 proven environmental (re-run on pristine base, identical behaviour):** `swarmWasm` (base fails identically: `cargo not found on PATH`), `rollSafety` (headless Chromium target crashes at the same GL render on base, same 5 checks passed first), `livingMotion` (wall-clock perf delta straddles its 2 ms budget on *both* trees interleaved: base +1.57/+2.06, mine +3.06/+1.94 — sandbox noise, CI authoritative), `wetSoak` (300 s sweep timeout under contention; solo on this tree: 31/31 pass).
  - After all fixes, every adjudicated suite was re-run solo on this tree: green (except the environmental four above, as documented). The touched-file pin sweep (grep selfchecks for every touched file, run those suites) is included in the above.
- `npm run format:check` — clean. `npm run build` — clean.
- No control surface was converted (a mode and its knobs were *added* through the generic PARAM_RANGES surface), so the #1885 e2e-selector sweep does not apply; no e2e spec references the new mode.

## Visual evidence

- `~/workspace/kc-1794-shots/before-factory-stage.png` — the real built app in the headless harness (factory fibonacci stage; footer shows the base build hash — the harness serves the preview build of this branch).
- `~/workspace/kc-1794-shots/offline-traces.png` (+ `.svg`) — **an offline render of the sampler's actual output** (seed 1234567, real `buildStreamlines` points drawn as polylines; green = traces that arrived at a source, pink rings = the 3 sources, faint lines = the node graph). It is *not* a stage screenshot: the kernel sampler family has no BUILD tile to click (decision 6) and the harness could not force the mode through the remaining supported surfaces, so no honest live-stage shot of streamline exists yet. First thing to do at review: roll KINETIC until streamline deals (growth family — it follows colonize/dla/eden), or ask for the tile.
- In the offline render the structure reads as intended: traces leave nodes all over the plate, bundle along shared flow, and fan *into* the source hearts.

## Files

New: `kernel/field/nodeField.js` + selfcheck · `kernel/sample/streamline.js` + selfcheck.
Edited: field/sample registries, `placement.js`, `buildPlacements.js`, `layout-modes.js`, `transitions.js`, `selfcheck.manifest` (+2 lines), 2 fixtures + their provenance notes.
Re-pinned (causes above): `registry.tiers`, `census`, `kernelTiles`, `dishWeather`, `transitions`, `wingWarp` selfchecks.
Untouched, per orders: `liveLoop.mjs` / `liveResolve.mjs` / `particles.js`.
