# Detective report: 8 teamLab-org GitHub profiles → KC-1 usable findings

Date: 2026-09-27. Method: public GitHub API (profiles, repos, READMEs, gists, starred),
public blogs/sites. Read-only; nobody contacted. All 8 confirmed as public members
of the `team-lab` GitHub org.

Bottom line: none of the 8 publish anything touching teamLab's installation/art
pipeline — the artwork stack stays private. The public face is web engineering plus
personal side projects. Two people are high-yield for KC-1 (opheliagame,
tsengkweiming), one is concept-yield (ssh0), one is process-yield (Mushus).
The other four had nothing KC-1-relevant.

---

## 1. opheliagame (Anushka Trivedi) — creative coder, highest pattern yield

Blog: https://opheliagame.xyz/ · Twitch live-coding · p5 sketches gallery (JS-rendered, could not extract)

### joy.js — shape combinators with decoupled renderer
https://github.com/opheliagame/joy.js · live: https://opheliagame.github.io/joy.js/
Tiny TypeScript creative-coding library (p5.js port of Python `joy`).

- **Combinator API**: `circle().repeat({n: 18, transform: rotate({angle: 10})})` —
  higher-order transformations as composition primitives. Directly maps to KC-1's
  shape vocabulary work (sleight-of-hand #679/#623): "repeat with transform" is a
  Davis-esque primitive worth stealing as a shape op.
- **Renderer decoupled from core**: abstract `Renderer` class (`src/renderer.ts`)
  with a `P5Renderer`; the same shape API can target multiple backends (p5, SVG
  examples exist). KC-1 parallel: keep KC-1's shape *description* separate from
  the WebGL *backend* — the same separation the shape-vocabulary work is groping
  toward, and it leaves the door open for alternate render targets (SVG export,
  thumbnail renderer).

### Gist: quadtree generative grid (TypeScript)
https://gist.github.com/opheliagame/ed473b8cc789f5ac71c0f71af694516b
Recursive-subdivision grid producing organic, non-uniform layouts. A **quadtree
sampler** would slot naturally into KC-1's sampler family alongside #673
phyllotaxis / #587 voronoi.

### Gist: antialiased fract GLSL utilities
https://gist.github.com/opheliagame/29485fd380b7a95b7c2c14f195011a7c
`aafract()` using `fwidth` (from Shadertoy) — kills shimmering in procedural
`fract()` patterns. Drop-in useful for KC-1's FX passes: OKLCH grade #680,
displace warp #678, halo #715.

### Gist: easings.js (full easings.net set)
https://gist.github.com/opheliagame/9c125fbf1e76530cc0474b2cc9d29097
KC-1's motion work (joiner/leaver choreography #694, boot animation #707) should
standardize on named easings instead of hand-rolled curves.

### Gist: p5.js text-layout
Text box with proper sizing/alignment — relevant to KC-1's micro-label
typography pass (#536).

### Her starred repos = her toolkit (all worth a look)
- **SableRaf/p5js_nanoKontrol2** — Korg NanoKontrol2 MIDI → p5.js. Directly
  relevant to KC-1's MIDI-learn plans (Davis/Stimuli #613–618).
- **Gargaj/Bonzomatic** — live shader coding, the Shader Showdown workhorse.
- **ubitux/ShaderWorkshop** — local shader dev environment.
- **bandaloo/tinsl** — language for multi-pass texture-to-texture effects.
  Relevant to how KC-1 chains FX passes.
- **cuinjune/Ofelia** — real-time creative-coding tool.
- **celestebetancur/CineVivo** — live coding with video/cameras.
- **mrdoob/frame.js** — JavaScript sequence editor; relevant to KC-1's
  timeline/sequencer thinking.
- Also: algoraveindia.github.io — she's in the algorave (live-coded music/visuals)
  scene; that community's tools (TidalCycles, Hydra) are worth knowing.

---

## 2. tsengkweiming (Tseng KweiMing) — graphics programmer, highest technique yield

### Order-independent transparency (OIT)
- https://github.com/tsengkweiming/unity-weighted-blended-oit (HLSL)
- Siblings: `unity-depth-peeling`, `unity-oit`, `unity-prefix-sum`
KC-1's WebGL renderer composites many translucent assets; OIT (weighted-blended
is the cheap, no-sort variant) is the textbook answer to layering artifacts.
Worth studying before KC-1's transparency gets more ambitious.

### TextureSynthesis — Efros & Leung (1999), CPU + GPU
https://github.com/tsengkweiming/TextureSynthesis
Non-parametric texture synthesis with a compute-shader version to 2048², full
algorithm writeup in the README. Idea for KC-1: **grown** background
textures/fields from a tiny sample — very "grow, don't manufacture" (the Oxman
pillar). A seeded texture-synthesis field generator would be a distinctive
KC-1 feature.

### fxhash-webpack-boilerplate — the seeded-token pattern
https://github.com/tsengkweiming/fxhash-webpack-boilerplate
Thin, but the pattern matters: `fxrand()` — a **deterministic seeded PRNG from
the token hash**, never `Math.random()` — plus `$fxhashFeatures` metadata
(e.g. `{"Background": "Black", "Number of lines": 10}`).
KC-1 already does seeded compositions; adopting the fxhash discipline —
hash → seed → *named features recorded alongside* — would upgrade the keep/pass
ledger: every kept render carries its feature set, which is exactly what the
taste model wants to learn from.

### Others
`unity-mcmc` (stochastic sampling), `SimpleRayTracer` (minimal CUDA raytracer —
GPU-parallel thinking reference), `GLSLSandbox` / `MaskMaker` /
`GraphicsPlayground` (shader sketching habit).

---

## 3. ssh0 (Shotaro Fujimoto) — the math/physics brain, concept yield

Bio: "Physics, Mathematics, Art, Linux, Vim, Python, ShellScript."
25+ repos of Waseda physics-course numerical simulations: **DLA
(diffusion-limited aggregation)**, Eden model, invasion percolation, growing
surface, fractal dimension by renormalization, Hénon map, Lyapunov exponents,
Poincaré sections, standard map, Feigenbaum bifurcations.

The repos are TeX writeups, not libraries — the value is the concepts:
- **DLA → branching coral-like growth**; **Eden model → organic blob growth**;
  **percolation → natural textures**. A "DLA growth sampler" or "Eden growth"
  would fit KC-1's sampler family (#673–676) and the bio-drives/Haeckel pillar.
- His starred `kepano/flexoki` (inky color scheme) signals color-system thinking.

---

## 4. Mushus — the toolmaker, process yield

### blender-addons
https://github.com/Mushus/blender-addons
UV Island Mask, Slide Relax, Smooth Weight — small, focused, individually
installable, distributed via a **remote extension repository** (`index.json`
added in Blender preferences).
KC-1 relevance: this is the distribution model for the "DLC-style packs" idea
(cut features returning through the earn-back rule) — a remote pack registry
with one-click individual install, rather than bundled releases.

### bms-parser (C#)
https://github.com/Mushus/bms-parser
Parser for BMS rhythm-game files — **timed event channels**. KC-1 parallel: the
Euclidean phrase clock (#677). BMS's channel/timing model is a proven pattern
for phrase-level sequencing if the clock ever grows beyond Euclidean.

---

## 5–8. Low/no yield (being honest)

- **takuma-ru** — web engineer (Vue). `auto-story-generator` (51★) is Storybook
  tooling; no KC-1 relevance. Blog takumaru.dev is a minimal landing page.
- **dayaman** — Discord bots, Niconico streaming tools. Nothing found.
- **NAKNAO-nnct** — homelab/infra (Docker, GNS3, Proxmox). Nothing found.
- **hironokyohei** — dotfiles, Chrome extensions, Go/PHP boilerplate. Nothing found.

---

## Cross-cutting notes

- The 8 people's public work clusters in **web engineering + personal creative
  side projects**; the installation pipeline is invisible publicly, consistent
  with teamLab keeping artwork tech in-house.
- Strongest KC-1 leads, ranked: (1) joy.js renderer separation + repeat
  combinator, (2) fxhash seeded-PRNG + feature-metadata discipline,
  (3) weighted-blended OIT for the WebGL renderer, (4) antialiased fract GLSL,
  (5) DLA/Eden growth samplers, (6) remote pack-registry distribution model,
  (7) NanoKontrol2 MIDI bridge pattern, (8) named easings set.
- Could not verify: contents of opheliagame's p5 sketch gallery (JS-rendered
  page, no extractable content); her long bio page (fetch failed, not retried
  per policy); anything on Twitter/X (no auth); any private teamLab work.
