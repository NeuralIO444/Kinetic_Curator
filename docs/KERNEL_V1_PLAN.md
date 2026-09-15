# Kernel v1 — Hardcore math backend (sleeper)

**Status:** Planned  
**Target release:** 0.9.0 (engine break)  
**Epic:** [#57](https://github.com/NeuralIO444/Kinetic_Curator/issues/57)  
**Date:** 2026-09-15

---

## 1. Intent

| Principle | Meaning |
|-----------|---------|
| **Sleeper UI** | No “Math Lab” chrome. Power shows up as better seeds, cleaner quality changes, denser modes, honest export. |
| **Pure core** | `engine/kernel/*` has no React/Zustand. Callable from Node selfcheck, Workers, future WASM. |
| **Index-stable identity** | Placement *i* keeps geometry/attributes when *N* or caps change, unless a channel is explicitly global. |
| **One pipeline** | Live, RENDER, BATCH, tests all call the same graph with different `EvalContext`. |
| **Power without noise** | Few new public params; many internal degrees of freedom driven by seed + existing knobs. |

**One-sentence vision:**  
A seeded evaluation kernel that turns `(seed, layout, palette, assets, t) → placements[]` with isolated RNG channels, instance noise, and pluggable samplers — looking like today’s engine, behaving like a small generative language runtime.

There is **no server backend**. “Math backend” means pure client-side numerical core under `app/src/engine/`.

---

## 2. Directory shape

```
app/src/engine/kernel/
  rng/          # streams, hash-to-unit, channel IDs
  noise/        # instanced simplex/fBm/curl (replace global seedNoise)
  sample/       # point processes: mode adapters + Poisson, stratify, …
  field/        # scalar/vector fields over canvas (K3+)
  color/        # strategies; hooks to palette epic (#50+)
  eval/         # EvalContext + compile layout → Placement[]
  bake/         # fixed-step dynamics → positions (K4)
```

Public façade stays thin:

```js
import { evaluatePlacements } from './kernel/eval'
// buildPlacements becomes a compatibility wrapper
```

Artists never say “kernel.” Devs open it when extending modes or fixtures.

---

## 3. Current engine baseline

| Module | Role | Gap |
|--------|------|-----|
| `prng.js` | xorshift32 | Single stream; order-coupled |
| `placement.js` + `modes.js` | Positions, jitter, density skip | Modes uneven; density consumes shared RNG |
| `noise.js` | Simplex 3D + fBm | **Global** mutable perm table |
| `buildPlacements.js` | Caps → place → weight → color → mirror | Clean; should wrap kernel |
| `color.js` | band / zone / split | Simple; not channel-isolated |
| `ca-engine.js` | Grid life | Weak mapping to positions |
| `particles.js` | Swarm | Live-only; not bakeable stills |

---

## 4. Phases

### K0 — Channel RNG + index-stable attributes + density
**Issue:** [#58](https://github.com/NeuralIO444/Kinetic_Curator/issues/58)  
**Looks like:** nothing in UI.  
**Is:** laws of physics for the rest.

| Deliverable | Detail |
|-------------|--------|
| `EvalContext` | `{ seed, canvasW/H, time=0, caps, channels }` |
| Channel RNG | `geo`, `attr`, `asset`, `color`, `noise`, `dyn` |
| Index-stable attrs | scale/rot/alpha/asset from `hash(seed, channel, index)` |
| Density | index-stable keep/skip |
| Selfcheck | shared indices match across two counts; version `kernel.v1` |

**Exit:** Changing quality/count no longer randomly reassigns “who is who.”  
**Est.:** 2–4 days · **Breaks seeds:** yes

---

### K1 — Instanced noise purity
**Issue:** [#59](https://github.com/NeuralIO444/Kinetic_Curator/issues/59)  
**Looks like:** same displacement slider.  
**Is:** reproducible fields.

| Deliverable | Detail |
|-------------|--------|
| `createNoise(seed)` | Private perm table; no module-global `p` |
| Wire displacement | Context noise from layout/noise subseed |
| Optional curl | `curl2(x,y,t)` for flow/swarm later |
| Worker-safe | No shared mutable noise across evals |

**Exit:** Parallel evals don’t crosstalk; displacement matches across runs.  
**Est.:** 1–2 days · **Breaks seeds:** mild (displacement)

---

### K2 — Sampler protocol + migrate modes + power sampler
**Issue:** [#60](https://github.com/NeuralIO444/Kinetic_Curator/issues/60)  
**Looks like:** same mode dropdown (optional one new mode name).  
**Is:** real extension surface.

```js
// Sampler: (ctx, i, count) → { x, y, t?, meta? }
```

| Deliverable | Detail |
|-------------|--------|
| `Sampler` interface | Pure; jitter/bleed in one post-pass |
| Migrate modes | grid, fib, radial, swarm, flow, layers, rails, ca, orbit, abacus, noise, hype |
| Power sampler | Jittered stratum **or** Poisson-disk (Bridson) |

**Exit:** New mode = one file + registry; no React required.  
**Est.:** 3–5 days · **Breaks seeds:** per remapped mode

---

### K3 — Scalar fields (post-MVP)
**Issue:** [#62](https://github.com/NeuralIO444/Kinetic_Curator/issues/62)

- Field API: `sample(x,y) → value`
- Sources: soft CA mask, fBm density
- Consumers: proportional sample / reject; fix `i % aliveCells`
- **No field editor UI**

**Est.:** 3–5 days

---

### K4 — Bake particle dynamics (post-MVP)
**Issue:** [#63](https://github.com/NeuralIO444/Kinetic_Curator/issues/63)

- `bakeParticles({ seed, steps, dt, forces }) → positions[]`
- Forces: curl, damping, layout physics knobs
- RENDER/BATCH swarm stills become seed-stable

**Est.:** 3–6 days

---

### K5 — Color assignment channel
**Issue:** [#64](https://github.com/NeuralIO444/Kinetic_Curator/issues/64)  
Coordinate with palette epic [#50](https://github.com/NeuralIO444/Kinetic_Curator/issues/50).

- `assignColor(ctx, placement, palette, strategy)` uses channel `color` only
- Palette overrides stay outside kernel (resolved palette in)

**Est.:** 1–2 days

---

### K6 — WASM / Worker (optional)
Only if profiling demands after K0–K2. Same API; noise + Poisson in WASM/Worker.

---

### Chore — Golden fixtures + CHANGELOG
**Issue:** [#61](https://github.com/NeuralIO444/Kinetic_Curator/issues/61)

- Retarget `goldenPlacement.selfcheck.mjs` for `kernel.v1`
- CHANGELOG: seed looks change; project JSON still valid
- No silent dual-path without removal date

**Est.:** 0.5–1 day

---

## 5. MVP definition

**Ship Kernel v1 MVP = K0 + K1 + K2 + chore (#58, #59, #60, #61).**

Suggest version **0.9.0**. K3–K5 follow in 0.9.x / 0.10.

---

## 6. Explicit non-goals

- Graph editor / node spaghetti UI
- Server, GPU compute service, “math microservice”
- Replacing SVG renderer in the same epic
- Exposing dozens of new public math sliders
- Folding WEBM/ACCUM capture-graph fixes into kernel (separate track)
- Long-lived dual RNG paths without a kill date

---

## 7. Blast radius — near systems

### Critical path (must touch)

| System | Impact | Risk |
|--------|--------|------|
| `buildPlacements` | Wrapper → `evaluatePlacements` | **High** — golden hash changes |
| `computePlacements` / `modes.js` | Sampler migration | **High** — visual drift |
| `noise.js` | Instance API | **Med** — displacement shift |
| Golden selfcheck (#37) | New `kernel.v1` expectations | **Med** |
| Quality caps / density | Fairer, index-stable skips | **Med** |

### Adjacent (coordinate)

| System | Impact | Risk |
|--------|--------|------|
| `useCanvasItems` | Same inputs; optional `time` later | Low |
| Swarm / `particles.js` | K4 bake | Med if dual path |
| CA engine | K3 field sampling | Med |
| Color / #50–#54 | K5 `assignColor` | Low if boundary clear |
| Project JSON | Prefer no schema change K0–K2 | Low |
| RENDER / BATCH / ACCUM | Same kernel entry; ACCUM still pixels | Low K0–K2 |
| Evolve / morph | Param lerp unchanged | Low |
| Weights / assets | `asset` channel only | Low |
| CI / Playwright | Expanded selfcheck | Low |
| MasterBar / panels | **No required UI** for MVP | None |

### Far (blast ≈ 0)

Favorites/setlist, first-run, audio UI, Pages deploy, marketing docs.

---

## 8. Compatibility strategy

**Recommendation:** Skip long dual-stack. Ship K0+K1+K2 as one **breaking engine release (0.9.0)**, bump golden hash, CHANGELOG:

> Seed-driven looks change under Kernel v1 (index-stable RNG + instanced noise). Project JSON still loads; re-favorite hits if needed.

Optional short `legacyRng` only if a release blocker appears — timeboxed.

---

## 9. Testing doctrine

| Layer | What |
|-------|------|
| Unit | Channel independence: mutate `count`, fixed `i` attrs invariant |
| Golden | Pipeline hash `kernel.v1`; optional per-mode shorts |
| Property | In-bounds, finite numbers, swatch index in range |
| Perf | Record ms for N=400/800 on CI |
| Non-goal | Pixel screenshots as primary gate |

---

## 10. Effort summary

| Phase | Eng time | UI | Breaks seeds? | Issue |
|-------|----------|-----|---------------|-------|
| K0 | 2–4 d | 0 | **Yes** | #58 |
| K1 | 1–2 d | 0 | Mild | #59 |
| K2 | 3–5 d | 0–0.5 d | Per mode | #60 |
| Chore | 0.5–1 d | 0 | Docs/hash | #61 |
| K3 | 3–5 d | 0 | CA | #62 |
| K4 | 3–6 d | 0–1 d | Swarm stills | #63 |
| K5 | 1–2 d | 0 | Color | #64 |
| K6 | 1–2 wk | 0 | No | — |

**MVP total:** ~7–12 eng days.

---

## 11. Parallel tracks

| Track | Relation |
|-------|----------|
| Color #50–#56 | Orthogonal UI/state; K5 hooks strategy/channel |
| Capture graph (SVG vs ACCUM video) | **Separate** — not kernel |
| Asset import | Kernel only sees `activeAssets[]` |
| Modulation matrix | Later: modulates `EvalContext` params |

Color P0–P2 and Kernel K0 harness can proceed in parallel; one owner owns golden updates.

---

## 12. Risk register

| Risk | Mitigation |
|------|------------|
| “Everything looks different” | Honest CHANGELOG; re-export/favorites note |
| Dual path forever | Timebox or don’t ship legacy |
| Over-abstract samplers | One interface; no DI framework |
| Perf regression | Benchmark N=400/800 |
| Scope creep WebGL | Hard no inside this epic |
| Field editor demand | Refuse; fields from seed + existing knobs |

---

## 13. Success metrics

1. Quality switch doesn’t reshuffle which glyph is “the big one” at index 17.  
2. Golden tests fail only on intentional kernel version bumps.  
3. New mode = one sampler file + registry.  
4. Post-K4, batch swarm matches across machines for same project JSON.  
5. Users say seeds feel more solid — not “where is the math panel?”

---

## 14. Issue index

| # | Title |
|---|--------|
| [#57](https://github.com/NeuralIO444/Kinetic_Curator/issues/57) | Epic: Kernel v1 sleeper math backend |
| [#58](https://github.com/NeuralIO444/Kinetic_Curator/issues/58) | K0 channel RNG + index-stable density |
| [#59](https://github.com/NeuralIO444/Kinetic_Curator/issues/59) | K1 instanced noise |
| [#60](https://github.com/NeuralIO444/Kinetic_Curator/issues/60) | K2 sampler protocol + power sampler |
| [#61](https://github.com/NeuralIO444/Kinetic_Curator/issues/61) | Chore: golden + CHANGELOG 0.9 |
| [#62](https://github.com/NeuralIO444/Kinetic_Curator/issues/62) | K3 scalar fields |
| [#63](https://github.com/NeuralIO444/Kinetic_Curator/issues/63) | K4 bake particles |
| [#64](https://github.com/NeuralIO444/Kinetic_Curator/issues/64) | K5 color channel |

Related: color epic [#50](https://github.com/NeuralIO444/Kinetic_Curator/issues/50).

---

## 15. Decision log

| Decision | Choice |
|----------|--------|
| Ship shape | MVP = K0+K1+K2 + chore |
| UI | Zero required for MVP |
| Version | 0.9.0 engine break |
| Dual RNG path | Prefer no; timebox if needed |
| Poisson vs stratum | Implementer picks one power sampler in K2 |
| Server backend | Out of scope |
