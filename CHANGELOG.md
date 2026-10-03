# Changelog

## Current — Pipeline, audio routes, light (2026-10-01)

Everything merged to `main` since the 2026-09-28 sync.

- **Pipeline SETUP + STAGE (#606 #607 #608, #827)** — canvas presets, W×H lock/swap, capture fps; the live raster and scene units follow the authored size (a new aspect reveals canvas, never scales content; the 1000×700 instrument default is unchanged). Stage preview / fullscreen (Tauri stage window native) / Syphon status (honest not-linked).
- **Audio as data (#790 PR1–4, #613, #615, #618)** — route table engine with default parity; `audioRoutes` is saved, undoable project state; METER hero with seven named bands; editable MATRIX (band, target, depth; ≤16 routes); FEEL presets; FILE source + `kc-audio-envelope/1` sidecar.
- **Director (#830, #616, #717, #734)** — DAVIS renamed Director; regrouped VOICES / GENERATE / PERFORM with live EVOLVE progress; flagship voices moved here, load-only, with ✎ fork dish into MY VOICES.
- **Light and mass (#594 1–3/5, #704, #741, #740, #532)** — the one CHIAROSCURO sun, bevel normals + tight spec, squash-and-stretch, DARK GLASS voice, gate weave, FXAA as governor cut 0, ACES + Bayer resolve.
- **Motion (#781, #558, #796, #807–#821, #763, #711, #710)** — kinemes (Build A, Build C UV window), per-node uniqueness at instantiation, diorama parallax, remainder clocks, ACCUM feedback guard, seek/flee in swarm mode, lorenz re-entry.
- **Colour + shapes (#632, #733, #735, #716)** — FADE per-node transition, 4-state shape mixer, taxonomy LOOK/VOICE/SYSTEM/CAST, Curator cluster in the top bar. An FX slot reads as a TX-6 tile: abbreviation, ✕, glyph, one mode word. Track rows head with a numeral tile (KC I–IV, FX 1–4); the edited track inverts.
- **Curator (#762, #719, #793)** — Taste v1 + `taste.json` import, named recipe features on keeps, biology lifecycle policy, taste validator.
- **FX (#732, #744, #745, #520)** — one family per FX stack slot, signed grain, RGB split keeps source alpha, FX rack UI.
- **Samplers (#586–#592)** — truchet, voronoi scatter, l-system, OKLCH grade, displace domain-warp, Markov weights, euclidean phrase clock.
- **Reverted:** asset sub-animation frame strips (#699, #782).
- **Tooling** — CI parallel jobs + Playwright cache (#747); e2e de-flakes (#769, #788, #798, #805); hardware research (#785), KINEME handoff (#783).

## Current — KC-1 review queue (2026-09-28)

One-PR-at-a-time review lane. Builders build, Matt looks and merges.

- **Phyllotaxis sampler + DIVERGENCE slider (#673)** — fibonacci's sibling: the golden-angle family with the divergence exposed. At 0° it's bit-identical to the phi tile; the DIVERGENCE slider (−20°…+20°, BUILD panel, mode-gated) re-counts the visible spiral arms live.
- **Lorenz-ride behave row (#671)** — seventh BEHAVE mode: each agent rides an independent Lorenz trajectory (`lorenzRho` 28, `lorenzGain` 0.05). Below rho ~25 it settles; ~40 goes wild.
- **Asset Studio merge (#698)** — merge with chamfer + live blend preview.
- **INJECT color mode (#689)** — the field dyes first, agents catch up. Joins FADE and WASH (#682, soak from the middle outward) on the palette bar.
- **Halo / chiaroscuro (#715)** — soft wide bloom + vignette tuned for dark grounds; CHIAROSCURO palette (#709) and sparse-facet preset (#714).
- **Living boot (#713)** — First Light starters: the instrument wakes up playing.
- **Joiner/leaver (#694)** — obvious face / invisible face pairing.
- **TE-limited gradients, per-asset opt-in (#708)**; Rendah style pack: 5 palettes + 6 presets + 3 Plenum recipes (#696); Micro-HUD ornament pack (#697); Letterform asset pack A–Z 0–9 (#700).
- **Tooling** — DEV panel merges Shader Lab + X-Ray + Gov Tune (#692); before/after visual diff for PR review (#693); build board (#684); PR review cockpit (#686).
- **Closed unmerged: #690** — dirty-range uploads measured ~0.3% savings; not worth the 311-line complexity. The #685 byte meter stays.
- Fixes: shape transitions play a per-node move vocabulary (#679), palette-import fallback ids (#683), upload-byte meter (#685), e2e cache-verify independent of wall clock (#687), audio envelope contract docs (#688), teamLab people-detective research report (#718).

## Stage 0/1 (2026-09-23)

Night Migration 30/60 sign-off recorded — embargo lifted for Stage 1 (`docs/EMBARGO.md`).

- **Engine spines A–G** — dt clock, atlas-cell skip, heading spring + ballistics + life, live mask tint, mode-chip dissolve + slider springs, shared noise + curl wind, bufferSubData.
- **Governor R1–R4** — one tape readout, instrument-named shed stages, FULL/SHOW/LEAN budget knob, registry-driven FX-stack weight.
- **Tracks** — PATCH strength sliders + inline live readout, stable-id targets, patch round-trip + 4-track cap on load, MOD steering (source motion retunes weights), one shared scent field, patch matrix overview.
- **Gate cuts** — `materials.js`, `glyphAtlas.mjs`, null `QualityRow` mount removed; shimmer prototype accepted, sidecar still deferred.
- **Roadmap + research** — `docs/ROADMAP_V1.md` (staged to v1.0), `docs/BENCHMARK_REPORT.md`, render/biology 1–8 opportunities placed.
- Open and ordered: evolve jitter (#471), BEHAVE weights (#479), ballistics shaping (#503), motion factors (#515–#519), EF rack (#520).

## Unreleased — one WebGL instrument (2026-09-17)

The SVG split is gone: the live canvas renders through the same WebGL2 GPU
pipeline as the exported stills — one instrument, no preview/final mismatch.
The old SVG emitter survives in-repo only as the dev-only parity reference,
excluded from the shipped bundle (enforced by `gl/phase6.selfcheck.mjs`).
Parity is still proven by a headless selfcheck on fixed seeds (Matt's bar:
under 10% pixel difference is a pass — this is art, not rocket science).

- **Live WebGL loop (#224)** — the visible canvas renders through the same GPU pipeline as stills (`app/src/gl/liveLoop.mjs`): real GPU pixels for PNG captures, same scene contract the export path consumes.

- **Phase 0** — GL scene contract (`docs/GL_CONTRACT.md`) + parity harness, wired into `npm run selfcheck`.
- **Phase 1** — texture-atlas asset rendering on WebGL2.
- **JS↔GL bridge** — `app/src/gl/bridge/` ships JS state into GL textures.
- **Shader debug harness** — dev-only GLSL tooling (compile diagnostics, flag pass, tap points, printf strip, GPU timer); Shader Lab panel lazy-loads behind `import.meta.env.DEV`.
- **Effect-authoring template** + shared GLSL chunk library — one effect = one fragment shader + one param descriptor.
- **Phase 2** — GPU FX library: rgbSplit, displace, tear, grain, blur, scanlines, posterize, invert, solarize, edge as GLSL passes.
- **Phase 3** — layer compositing + mattes on the GPU.
- **Phase 4** — GPU accumulation (ping-pong textures) + bloom / halation / blur-over-time optics.
- **Glow system, no gaussian blur (#308)** — the instrument's gaussian blur is gone: ACCUM optics now run mip-chain bloom + stipple diffusion + a slight chromatic RGB offset. The FX roster's Blur entry is dead on the GPU path until #310 cuts it from the UI.
- **TE removal cuts (#310)** — the heaviest taste call in the batch: controls leave, capabilities stay. Cut from performer sight: the FX roster's Blur entry (dead since #308), the QUALITY tier switcher (one ceiling; the governor sheds — tier data stays for #296's budget ceiling), the dead VIDEO (soon) button, the duplicate CLEAR ACCUM (GHOST STATION's gesture row is canonical), all per-parameter dice, and the global blendMode select (state kept; the engine contract falls back to 'normal'). Demoted to voice properties (settable via presets, not live knobs): Z-TIERS, NOISE FREQ, DISPLACE, ACCUM GLOW, paletteShift (MATERIAL/SHADING were already voice-only). Demoted to hidden defaults: SHIMMER (whisper stays on), AUTO-SNAP (off), SMOOTHING (already inert). BG cycle moved to OUTPUT; GRID/LIST is a remembered preference; audio source row collapses into setup; the DavisPanel favorites list leaves (bottom tray is canonical). Earn-back rule: nothing returns unless a performer reaches for it mid-set and it's not there, or Matt's eyes miss it on the demo.
- **Phase 5** — finals via GPU readback (`app/src/gl/exportStill.mjs`): 1×–8K PNG + JSON sidecar, off-store — the old flip-then-restore mechanism is deleted. resvg retired from finals; the SVG emitter is now a dev-only parity reference.
- **Phase 6** — SVG renderer removed from the shipped bundle; governor retuned (resolution sheds before effects — see `docs/SHOWRUNNER.md`); `maxFxLayers` budgets retired; shed states are always reported, never silent.
- **Quality pillars (#168)** — one kernel, one seed; finals off-store; caps hold; substitutions recorded in the sidecar.
- **Moth bodies remainder (#109)** — second blend ladder + u-driven paint.
- **Organism contacts (#167)** — radius, repel, bounce, swap, breed through one integrator (no second physics engine).
- **Overlay QA (#134)** — ingest/overlay selfchecks wired into the normal selfcheck command.
- **VORTEX RWB preset (#178)** — kaleidoscopic red/white/blue ribbons (fibonacci + soft blobs + displacement; see `docs/VORTEX_RWB.md`).
- **KILN COLUMNS preset (#179)** — lathe-like organic stacks on a dusty matte palette (see `docs/KILN_COLUMNS.md`).

## 0.9.0 — 2026-09-15

### Kernel v1 (sleeper math backend)

**Seed-driven looks change.** Project JSON still loads; re-favorite hits if a seed no longer matches your eye. There is **no** dual legacy RNG path.

- **K0** — Channel RNG (`dens` / `geo` / `attr` / `asset` / `color` / `noise` / `dyn`). Index-stable density skips and attributes; per-index geo streams; index-stable asset + color picks (#58).
- **K1** — Instanced Simplex/fBm via `createNoise(seed)` (no shared global perm table). Placement displacement + particle wind use isolated instances (#59).
- **K2** — Sampler registry (`getSampler` / `registerSampler`). All layout modes migrated; power sampler **`stratified`** (jittered stratum, seed-stable) (#60).
- Golden placement fixture retargeted to **`kernel.v1`** hash `e892d112…a9a2` (#58 / #61).

Plan: [docs/KERNEL_V1_PLAN.md](docs/KERNEL_V1_PLAN.md). Post-MVP: fields (#62), bake particles (#63), color channel (#64).

### Docs / CI
- README reproducibility updated for index-stable channels.
- Architecture documents kernel modules under `engine/kernel/`.
- `npm run selfcheck` includes rng + noise + sample checks.

## 0.8.0 — 2026-09-15

### Engine / export
- Pure **`buildPlacements`** shared by live preview and final render (#32).
- **RENDER FINAL** with optional **UNCAPPED** density lift (#24).
- **Project document** v1 (seed, palette, layout, assets, weights, quality) + localStorage autosave (#33).
- Runtime **asset weight overrides** + category bulk mix UI (#34).
- **Batch edition** — N sequential seeds → PNG + JSON sidecar (max 48) (#29).
- **Accumulation buffer** — HYPE-style trails; SNAP/RENDER capture the pixel buffer when ACCUM is on (#28).

### UX / performance
- **Hits setlist** — ordered tray, Enter advances, reorder, morph-to-favorite (#35).
- **Perf LOD** — stable placement keys, enabled-only SVG symbols, gloss skip under PERF / high node count (#36).

### CI / quality
- **`npm run selfcheck`** — determinism + **golden placement SHA** fixture (#37).
- **Playwright smoke** — load app, switch tabs, toggle layout param (#37).
- CI: lint → selfcheck → build → e2e smoke.

### Chore
- Removed legacy `KineticCuratorUI/`, `KineticCuratorSketch/` content targets, `design_handoff*` (#38).
- Reproducibility contract documented in README + architecture.
- Known limitations: [docs/BUGLIST.md](docs/BUGLIST.md).

## 0.7.0 — 2026-09-13

### UX
- **Right-column tabs** — Layout / Assets / Stimulus / Davis / Output; last tab persisted (#13).
- **First-run “Play Me” overlay** (#12).
- **Floating Favorites / Hits tray** — 1–9 recall when focused (#8).

### Chore
- Architecture docs aligned with Zustand slices + composition root + event bus.
- Package version bumped; basic CI (lint + build).

## 0.6.0 — 2026-09-13

- Event-bus panel communication; Layout / Davis / Stimulus emit-only subcomponents.
- Composition root (PanelRegistry + Shell + dispatchPipe).
- Placement modes split; Canvas hooks extracted.
- Morph evolve, phrase loop, tooltips on RangeRow.
