# Noise and layers — weather on the tape

*Review of main as of 2026-09-19. Plan, not a patch. Companion to [ORGANIC_MOTION.md](ORGANIC_MOTION.md) (the clock), [KC1_LAYERS.md](KC1_LAYERS.md) (the tape), [BIO_DRIVES_PLAN.md](BIO_DRIVES_PLAN.md).*

Two systems, one world. Layers are how tracks share a plate. Noise is the weather on that plate. Stacking blend modes is a stamp. A shared field that one track writes and another reads is a system.

The UI says "Perlin." The engine is **seeded 3D Simplex + fBm + unused curl**. Do not "upgrade to Perlin." Use what is already there.

Standing bars: no new panel, no fifth track, no noise-layer type. Oxman gate — *does it grow, or does it stamp?*

## 0. Ground truth

### Four things named "layer"

| Name | File | What it actually is |
|------|------|---------------------|
| **KC-1…KC-4 content tracks** | `state/slices/layersSlice.js` | A full instrument state per slot: seed, offsets, palette, layout, CA, assets. Cap `MAX_CONTENT_TRACKS = 4`. Active track in the store; others in `layerSnapshots`. |
| **FX tracks** | same slice, `type: 'fx'` | Adjustment passes over everything below. Cap 4. |
| **Mode `layers`** | `engine/kernel/sample/registry.js` | A sampler. Bins index `i` onto 5 horizontal bands. Sediment, not a track. |
| **`zTiers` (1–12)** | `engine/placement.js` | Fake depth on *one* track. `zTier = i % tiers`, `depth = 0.6 + t * 0.8`, multiplies scale. |

Plus per-track `layerBlendMode` / `layerOpacity`, and the patch row (`off / mod / field / feed`) already on each content layer.

### Patching already in the live path

`engine/kernel/tracks/trackGraph.js` + `gl/liveResolve.mjs`:

| Patch | Status | Behaviour |
|-------|--------|-----------|
| **OFF** | live | Stack + blend only. |
| **FIELD** | live | Source points attract/repel target points. Soft `1/(d²+ε)` well. Hop-clamped to `HOP_MAX_PX = 4`. |
| **FEED** | live | Delay-1: last frame's positions become a flow sample for this track. |
| **MOD** | coded (`applyMod`) | Source agitation/speed writes glow / fade / displace knobs. Not applied in the live hop path yet. |

That is layering-as-physics. KC-1 design ([KC1_LAYERS.md](KC1_LAYERS.md) §6) already named these three flavors. Do not invent a node graph.

### Noise is Simplex, not Perlin

`engine/noise.js` (Kernel K1):

```js
createNoise(seed) → { noise3D, fBm3D, curl2 }
```

- Isolated perm table per instance. Seed from `CH.noise` (`hashU32(seed, CH.noise, …, seedOffsets)`).
- `fBm3D` defaults: 4 octaves, lacunarity 2, gain 0.5.
- `curl2` is a finite-difference curl of fBm — **divergence-free, unused by the swarm.**

Defaults in `layout-modes.js`: `noiseFreq: 0.005`, `noiseSpeed: 0.5`, `displacement: 0`. Most looks are unwarped until DISPLACE opens.

### Two consumers, two jobs

**A. Still placements — warp the armature** (`placement.js` `computeGeometrySoA`). Only if `displacement > 0`:

```js
px += noise.fBm3D(pos.x * freq, pos.y * freq, nt, 3) * displacement
py += noise.fBm3D(pos.x * freq + 200, pos.y * freq + 200, nt + 100, 3) * displacement
```

Mode `noise` is **grid + this warp**. The sampler itself is `grid`. `nt = (seed & 0xffff) * 0.02 * noiseSpeed` is a **frozen z-slice**. Changing speed on a still changes the cut, not a movie. Geometry is cached (`geometrySignature` includes `displacement / noiseFreq / noiseSpeed`); life/audio never re-runs fBm.

Independent X/Y fBm is a scalar pinch. It does not flow.

**B. Swarm — wind from a time-varying field** (`particles.js`):

```js
nt = time * noiseSpeed * 0.001
nval = noise.noise3D(x * freq, y * freq, nt + seedOffset * 0.0001)
windAngle = nval * TAU
windMag  = (noise.noise3D(x*freq+200, y*freq+200, nt) + 1) * 0.4 * windMul
```

Angle from one sample, magnitude from another. A **pointing field**, not curl. Particles can pile into sinks. `time` is `Date.now()` from `liveResolve` — same tab-switch jump called out in [ORGANIC_MOTION.md](ORGANIC_MOTION.md) §1.

Mode `flow` is a sine across x. The name is a lie.

## 1. Why it reads like stickers, not weather

| Symptom | Cause |
|---------|--------|
| Two swarm tracks ignore each other | Each `ParticleSystem` builds its own `createNoise`. Same seed ≈ same planet; different seeds ≈ different universes. |
| Trails converge into blobs | Wind is `noise3D → angle`, not `curl2`. Sinks are free. |
| Mode `noise` is a stamp | Placement `nt` is pinned to the seed. Live time never reaches fBm. |
| Mode `layers` is flat sediment | Five bands, same jitter, no per-band octave. |
| Mode `flow` is a wave | Sampler is `sin(t * 3π)`, not a noise field. |
| FX displace feels like the only "depth" | Fullscreen stamp. Real depth is zTiers + ACCUM + a slow `nt`. |
| MOD patch does nothing on stage | `applyMod` exists; `liveResolve` only hops FIELD and FEED. |

## 2. The six changes that survive the bar

### 2.1 One shared noise world per project seed

- **What:** one `createNoise(noiseSeedFor(projectSeed, seedOffsets))` owned by the live resolver (or a tiny `engine/kernel/field/worldNoise.js`). Every track samples it with a domain offset from that track's `seedOffsets.noise` (already a scalar in `#305`). FIELD patches then couple *agents in one weather*, not two planets.
- **Touchpoint:** `liveResolve.mjs` constructs the instance once per seed/offset change; `particles.js` and `computeGeometrySoA` accept an injected noise instead of minting their own when live.
- **Stills:** bake keeps minting from the same hash so hashes do not move.
- **Gate:** a shared field is infrastructure. Two sliders that pretend to be two worlds are a stamp.

### 2.2 Curl wind on the swarm

- **What:** default organism / cloud wind samples `noise.curl2(x * freq, y * freq, nt)`. Divergence-free. ACCUM ribbons instead of smudges.
- **Peppered:** a behave-adjacent enum, not a new force type — `wind: 'curl' | 'point'`. `point` is today's `noise3D → angle` (HYPE / scatter still want chaos sinks). Flock / murmuration / mold default to `curl`.
- **Touchpoint:** the existing wind block in `particles.js`. `curl2` already lives in `noise.js`.
- **Cost:** `curl2` is 4 fBm taps at 3 octaves. Declare a cost tier if it shows up in the GPU/CPU budget; shed back to `point` under LEAN.
- **Gate:** using the function you already wrote is the work.

### 2.3 Live `nt` on placement warp — weather, not a cut

- **What:** when the loop is running and `displacement > 0`, feed `nt = loopTime * noiseSpeed` into the warp. Stills and `RENDER FINAL` pin `nt` to the seed slice (today's formula) so editions stay deterministic.
- **Touchpoint:** do **not** bust `geometrySignature` every frame. Either (a) a cheap stage-B' that only re-adds fBm on cached unwarped `pos`, or (b) treat animated warp as a live-only offset applied in `liveResolve` after `buildPlacements`, the way breath is applied in `liveLoop`.
- **Option (b) is the KC pattern.** Geometry cache stays valid. Live loop already transforms instances.
- **Composes with:** [ORGANIC_MOTION.md](ORGANIC_MOTION.md) §2.1 — same loop clock, no `Date.now()`.
- **Gate:** a slider that rebuilds the sampler every frame is a hitch. An offset pass is weather.

### 2.4 Domain-warped bands for mode `layers`

- **What:** keep the 5-band sampler. Warp each band with a slower octave than the next (`freq * 2^band`) from the shared noise. Sediment at different geological speeds.
- **Touchpoint:** `registry.js` `layers()` — one extra fBm call per point, or do it in the live offset pass (§2.3) keyed by `i % 5`. Geometry stage already pays for two fBm calls when displacement is on.
- **No new mode.** `flow` can stay a sine; a later voice can pin `layers` + displacement instead of inventing `perlin-flow`.
- **Gate:** five bands that breathe at one rate are a stamp. Five bands that slip past each other grow.

### 2.5 FEED as weather, not only last positions

- **What:** `lumaToFlow` already encodes a texture into a flow field. A track can be a **field source**: low or zero sprite count, noise volume written into the feed texture, other tracks sample it. No new layer type — a voice with sparse content + FEED out.
- **Touchpoint:** `feedOps.js` / `applyFeed`. Optional: if the source track has `displacement > 0` and almost no items, fill the feed from `curl2` sampled on a coarse grid instead of point positions.
- **Tape:** `tapePreflight` already charges FEED textures. Empty-looking weather tracks still cost the feed buffer — say so on the tape, never silently.
- **Gate:** a "noise layer" chip is a fifth type. A voice that *is* the weather is a system.

### 2.6 Finish MOD on the live path

- **What:** `applyMod` already maps source agitation → glow / fade / displace. Wire it in `liveResolve` next to FIELD / FEED so a dense swarm can bloom the FX track without a new expression language.
- **Touchpoint:** one call per patched pair per frame. Metrics already exist (`motionMetrics`).
- **Keep hop caps.** MOD writes knobs, not positions — no `HOP_MAX_PX` issue.
- **Gate:** this is Phase 3a of KC-1. It is specified. Land it before inventing more patch flavors.

## 3. Recipes that work today (no code)

Bone + weather + crust, three tracks:

| Track | Mode | displacement | noiseFreq | noiseSpeed | Patch |
|-------|------|-------------|-----------|------------|-------|
| KC-1 | stratified | 80 | 0.004 | 0.3 | off |
| KC-2 | swarm / flock | 0 | 0.008 | 0.7 | FIELD → KC-1, strength 0.2 |
| KC-3 | layers | 40 | 0.012 | 0.15 | FEED → KC-2, strength 0.12 |

KC-1 is the armature. KC-2 is the flock in that weather. KC-3 is a slow crust that tugs the flock one frame late.

Also useful:

- Two swarms, same project seed, different `seedOffsets.noise` and `noiseSpeed`. FEED the slower into the faster.
- `zTiers` 4–8 on a dense grid + ACCUM. Far tiers stay small; trails read as haze. Not an FX.
- Mode `layers` + displacement 40–120 = folded sediment. Cheap plate texture, no new assets.

## 4. Killed

- **A Perlin rewrite.** Simplex + fBm + curl is already the better basis. Rename the help string if the word bothers you; do not swap the kernel.
- **A noise track type / fifth content slot.** Four tracks. Weather is a voice or a FEED source.
- **More octaves as the organic knob.** Placement already uses 3. A fourth is sparkle, not body. Cost with no family.
- **Fullscreen FX displace as the depth system.** Stamp. Depth is zTiers + ACCUM + live `nt`.
- **A node-graph patch bay.** OFF / MOD / FIELD / FEED is the language. [KC1_LAYERS.md](KC1_LAYERS.md) already killed this.
- **Animating geometry by invalidating the placement cache every frame.** Hitch. Offset pass only.

## 5. Sequencing

Depends on [ORGANIC_MOTION.md](ORGANIC_MOTION.md) §4 step 1 (loop clock / `dtSec`). Noise time and physics time are the same clock.

1. **Shared world noise + loop-time `nt` in the swarm.** Stop `Date.now()`. Selfcheck: locked-dt hashes match today's implicit step when `nt` is pinned.
2. **Curl wind** as the flock/murmuration/mold default; `point` remains for scatter/HYPE.
3. **Live offset pass** for placement displacement (still `nt` stays seed-pinned).
4. **Domain-warped `layers` bands** on that offset pass.
5. **MOD on the live path.** KC-1 Phase 3a.
6. **FEED-from-curl** for sparse weather voices, with tape honesty.

First PR is 1 + 2. Trails change character without a new slider.

## 6. Acceptance

- [ ] Two swarm tracks with one project seed share weather; `seedOffsets.noise` offsets the domain, it does not mint a second universe.
- [ ] Flock / murmuration trails ribbon under ACCUM instead of collapsing into sinks (curl default).
- [ ] Scatter / HYPE can still pick `point` wind and look chaotic on purpose.
- [ ] Live displacement breathes; SNAP / RENDER FINAL / studio stills match the seed-pinned slice.
- [ ] Mode `layers` + displacement shows bands slipping at different rates.
- [ ] MOD patch blooms glow/fade/displace from a source track's agitation on stage.
- [ ] FEED weather tracks show up on the tape counter. Empty-looking ≠ free.
- [ ] No new panel, no fifth track, no Perlin rewrite. Bake hashes at pinned `nt` still match.

## 7. File map

| File | Role |
|------|------|
| `app/src/engine/noise.js` | Already the field. Use `curl2`. |
| `app/src/engine/placement.js` | Keep cached unwarped pos; live offset lives elsewhere. |
| `app/src/engine/kernel/sample/registry.js` | `layers` bands; `noise` stays grid; do not lie-rename `flow` without a sampler change. |
| `app/src/engine/particles.js` | Curl vs point wind; take injected noise + loop `nt`. |
| `app/src/gl/liveResolve.mjs` | Own the shared noise; apply live warp offset; call `applyMod`. |
| `app/src/gl/liveLoop.mjs` | Same clock as organic motion. |
| `app/src/engine/kernel/tracks/trackGraph.js` | FIELD / FEED / MOD — already the ABI. |
| `app/src/engine/kernel/tracks/feedOps.js` | Optional curl grid → feed texture. |
| `app/src/state/slices/layersSlice.js` | Caps and patch rows. No new type. |
| `app/src/data/layout-modes.js` | Help copy: Simplex/fBm; optional `wind` enum later. |
