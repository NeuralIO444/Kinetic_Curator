# Smoke Study + Generative Technique Capability Matrix
**Plan — 2026-09-17 · no code, no PRs · repo: NeuralIO444/Kinetic_Curator (main)**

Matt's bar: *develop systems that build systems, not kitchen sink.* Every recommendation below is judged against it: a new system must unlock a **family of voices**, never a single effect.

---

## PART 1 — "Smoke Study": the flow-field voice

### The reference
A classic Processing sketch (wifflegif "generative art processing", source glitchdo.tumblr.com): thousands of hairline particles drift along a noise vector field; each frame the canvas is overlaid with a semi-transparent black rectangle so old trails decay — the signature smoky-ribbon look. Monochrome, ambient, seamless loop.

### The clever build — with KC's systems today
KC already *is* this sketch, three times over:

1. **The flow field exists.** `app/src/engine/particles.js` steers every particle with a time-evolving 3D-simplex noise vector field (`noise3D(x·freq, y·freq, t)` → wind angle + magnitude, lines 541–545). `app/src/engine/noise.js` also ships `curl2` — a divergence-free curl primitive. This is not an approximation of a flow field; it is one.
2. **The trail persistence exists.** ACCUM's fade pass is exactly the "semi-transparent black rectangle" trick, in-shader (`app/src/gl/accum.mjs`, `u_keep`). Fade 0.95–0.97 gives the long smoky decay.
3. **The smoke curl exists.** ACCUM Phase B2 advects the *buffer itself* through a curl field as it decays, so trails curl while fading (`accum.mjs` lines 223–262). This is the difference between "lines that fade" and "smoke."

**The recipe (voice params, all existing knobs):**
- `mode: 'swarm'`, `particleCount: 400` (the hard cap — see below), `scale: [0.12, 0.35]`, `alpha: [10, 35]`
- `noiseFreq ~0.003`, `noiseSpeed ~0.15` (slow drift), `swarmCohesion: 0` (kill flocking — pure flow), `damping: 0.98`, `gravityWells: 0`, `wind: 1`
- ACCUM on: `fade 0.96`, `flow ~0.3`, `optics 0`, glow ~0.15, tunnel/prism 0
- Palette: new `SMOKE` data entry — bg `#000000`, gray swatches (data-only, no system change)
- Assets: dots category, tiny; FX: grain 20 or none

**Two honest gaps, both small:**
- **ACCUM `flow` has no UI.** The B2 advection parameter exists in `accumRecipeParams` but no slider reaches it (`grep` finds zero UI references). Exposing it is a tiny change — and it unlocks smoke-curl voices generally, not just this one.
- **400 particles, not thousands.** `app/src/data/quality.js` caps `maxParticles` at 400 absolute (350/200/100 by tier). The cap is real: particles integrate on the CPU in JS with a spatial hash per frame. 400 hairline particles + long trails gets ~85% of the reference look. The last 15% (true density) needs the GPU system below.

### Minimal new systems (each unlocks a family)
1. **Loop Capture** — the prime candidate. A deterministic N-second take (fixed seed, frozen UI, optional `noiseSpeed: 0` static-field "streamline mode"), recorded through the existing WEBM path (`useMediaExport.js` → MediaRecorder VP9), then exported as a **seamless loop via dissolve**: crossfade the tail K frames into the head. No hard cut — pure Matt philosophy ("never a quick jump, always blend"). *Family unlocked:* every voice becomes a shareable loop; it's the VJ's export format, not a Smoke Study one-off. GIF encoding can ride the same path (client-side encode or WEBM-first + external convert — decide at build time).
2. **ACCUM flow slider** — expose B2 advection in the Layout panel next to fade/optics/tunnel/prism. *Family unlocked:* curl-smoke voices across every mode.
3. **GPU particle field** (later, bigger) — move integration to transform-feedback or texture ping-pong; thousands of particles. *Family unlocked:* dense flow fields, attractors, DLA growth, stippling. Not required for Smoke Study v1 — recommend as the follow-on system.

**Sequencing:** voice the recipe now (needs only the flow slider + SMOKE palette data) → Loop Capture as the system build → GPU particles when density becomes the constraint.

---

## PART 2 — Generative technique capability matrix

Ratings: **NATIVE** (do it today) · **VOICE-ONLY** (possible, needs authoring) · **NEW SYSTEM** (small principled addition — named) · **OUT OF PHILOSOPHY** (doesn't fit the instrument).

### Summary table

| # | Technique | Rating | One line |
|---|---|---|---|
| 1 | Flow fields | NATIVE | Noise-vector wind per particle + curl primitive + ACCUM B2 buffer advection — the reference GIF is literally this stack |
| 2 | Flocking / boids | NATIVE | `behave.js` separation/alignment/cohesion + spatial hash; swarm & hype modes |
| 3 | Cellular automata | NATIVE | `ca-engine.js` (Conway Life), `ca` layout mode, CA density fields with index-stable rejection sampling |
| 4 | Reaction-diffusion | NEW SYSTEM | Gray-Scott as an ACCUM-style ping-pong shader pass — the buffer architecture already exists; unlocks coral/skin/marble family |
| 5 | Strange attractors + IFS chaos game | NEW SYSTEM | "Iterated force" wind mode (Lorenz/Clifford/de Jong ≈ 10 lines each in the JS wind computation); unlocks the whole attractor family |
| 6 | L-systems | NEW SYSTEM | Tiny turtle interpreter → polylines baked to strokes/assets; unlocks botanical/fractal-growth family |
| 7 | Circle packing | NEW SYSTEM | Packing sampler in the kernel sampler registry (`registerSampler` is the system; this *uses* it); unlocks dot-matrix/poster family |
| 8 | DLA (diffusion-limited aggregation) | NEW SYSTEM | Offline grower in `studio.py` → bakes into the asset library; fits the "heavy thinking offline, live instrument enforces" thesis; unlocks lightning/coral/mycelium family |
| 9 | Voronoi / stippling | VOICE-ONLY → NEW SYSTEM | Static stipple today via field rejection sampling; animated Voronoi needs GPU jump-flooding (medium build, print-desk justification) |
| 10 | Recursive subdivision | OUT OF PHILOSOPHY | Static composition trick with no temporal dimension — a design-tool layout, not a live instrument; the sampler registry *could* host it, but it would never be performed |

### Technique notes (grounded in the repo)

**1. Flow fields — NATIVE.** The signature look: particles streaming along curved paths, organizing into churning ribbons. KC's particle wind (`particles.js` lines 541–545) samples two 3D-simplex fields per particle per frame — one for direction, one for magnitude — with time as the z-axis. `curl2` (`noise.js` line 135) gives divergence-free flow. ACCUM B2 then curls the *trails themselves*. Three independent flow systems compose; the Smoke Study voice uses all three.

**2. Flocking — NATIVE.** `app/src/engine/organisms/behave.js` implements the classic Reynolds trio with per-profile radii and weights; `particles.js` runs it through a spatial hash. This is the instrument's mother tongue (swarm/hype) — no work needed.

**3. Cellular automata — NATIVE.** `ca-engine.js` is Conway's Life; the `ca` layout mode plus `makeCaField`/`sampleFieldPoint` turn live grids into density fields for placement. Organic clustering, decay, rebirth — all performable today.

**4. Reaction-diffusion — NEW SYSTEM.** *What it is:* two chemicals reacting and diffusing on a grid — the leopard spots, coral brains, zebra stripes, marble veins of generative art. Nothing like it exists in the repo (no Gray-Scott, no activator-inhibitor). *The system:* an RD sim as a GPU ping-pong pass reusing ACCUM's buffer/feedback architecture — feed, react, diffuse, fade. *Family unlocked:* organic pattern voices that no slider combination can reach today. This is the highest-leverage NEW SYSTEM on the list.

**5. Strange attractors + IFS — NEW SYSTEM.** *What it is:* particles iterated through chaotic maps (Lorenz's butterfly, Clifford's splatter-fields, the Barnsley fern's chaos game) — instantly recognizable signatures. Nothing in the repo. *The system:* a new `windMode` in the particle update — alongside the noise wind, offer `lorenz`, `clifford`, `dejong`, `ifs-fern` iterated maps, each ~10 lines in the existing JS force loop. *Family unlocked:* every chaotic map becomes a voice; the MIX slider crossfades between dynamical systems.

**6. L-systems — NEW SYSTEM.** *What it is:* turtle-graphics grammars grown through rewriting rules — the botanical look: branching trees, weeds, river deltas. No turtle anywhere in the repo. *The system:* a tiny string-rewriting turtle (one module, pure functions) whose polylines bake into strokes or assets through the existing SVG→texture pipeline. *Family unlocked:* grown, botanical voices; pairs with the asset library's hand-drawn direction.

**7. Circle packing — NEW SYSTEM.** *What it is:* non-overlapping circles packed by relaxation — the dot-matrix poster look. The contact system (`#167`) has repel/bounce but no packing solver. *The system:* a `pack` sampler registered in the kernel sampler registry (`app/src/engine/kernel/sample/registry.js`) — front-chain or relaxation packing, index-stable like the other samplers. *Family unlocked:* poster/dot-matrix voices. Note the meta-point: the registry is already a system that builds systems; packing is the proof.

**8. DLA — NEW SYSTEM (offline).** *What it is:* particles random-walking until they stick — lightning, coral, mycelium, city growth. Too slow for live frames, which is exactly why it fits KC's thesis: MLX/heavy thinking happens offline, the live instrument enforces from cheap artifacts. *The system:* a DLA grower in `studio.py` that bakes growths into the asset library. *Family unlocked:* organic-growth asset shelves no live sim could produce.

**9. Voronoi / stippling — VOICE-ONLY → NEW SYSTEM.** *What it is:* cells around seed points (cracked earth, giraffe spots) and their inverse — stippled portraits via weighted Voronoi. Static stipple is voice-able today: `sampleFieldPoint` does density-weighted rejection sampling against any field — feed it an image-derived field and you get stippled placement. Animated Voronoi (cells breathing, seeds drifting) needs GPU jump-flooding — a medium build, justifiable through the print desk (editioned Voronoi prints).

**10. Recursive subdivision — OUT OF PHILOSOPHY.** *What it is:* recursively split rectangles (Mondrian grids, map layouts). It has no temporal dimension — it produces a static composition, not a performance. The instrument is played live; a subdivision voice would sit frozen while everything else breathes. This is the bar with teeth: the sampler registry could host it in an afternoon, and we still shouldn't.

**Honorable mention — phyllotaxis / mathematical placement: NATIVE.** The `fibonacci` sampler (golden-angle spiral), `radial`, `grid` in the kernel registry — sacred-geometry voices, performable today at the placement level.

### Sequencing recommendation
1. **Now:** Smoke Study voice (flow slider exposure + SMOKE palette data) — pure authorship.
2. **Next system:** Loop Capture — every voice becomes a shareable loop.
3. **Then, by leverage:** reaction-diffusion ping-pong pass → iterated-force wind modes (attractors/IFS) → packing sampler → L-system turtle → DLA offline grower → GPU particle field (when density, not ideas, is the constraint).
4. **Never:** recursive subdivision as a voice.
