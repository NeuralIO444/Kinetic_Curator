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

---

## 16. Kernel v2 addendum — SoA, staged eval, Worker ABI (#108)

**Status:** steps 1 (measurement harness), 2 (SoA + in-place fill) and 4
(staged eval + dirty flags) landed. Step 3 (displacement field texture) was
measured and rejected — it is slower than what it replaces at every count
this app ships. `engine/perf.selfcheck.mjs` went first, per the issue's own rule —
*"measure first... rewrite is a response to a missed budget, not a vibe."*
The swarm SoA and the Worker ABI are still outstanding; this is not a claim
that the rewrite is done.

### Baseline (M2 Max, local — CI hardware will read slower)

| Target | Budget | Measured | Verdict |
|---|---|---|---|
| 20k pts, sample+attrs, no fBm | < 2ms | **0.95–0.99ms** | already under budget |
| 8k pts + displacement (fBm) | < 3ms | **2.95–3.26ms** | right on the line, noisy |
| Bake 400×120 swarm steps | < 30ms | **66.9–67.6ms** | ~2.2× over |
| Incremental dirty-C vs full | ≤10% | — | N/A, staged eval doesn't exist yet |

Reading this straight: pure position sampling is already fine at this N.
Displacement is marginal — it's a coin flip whether a given run passes,
which itself is a signal that the fBm-per-point approach has no headroom
and needs the field-texture replacement (item 3) rather than micro-tuning.
Swarm bake is the real offender, worse in absolute terms than pure sampling
would suggest, consistent with the issue's diagnosis: `Particle` class
instances + `applyForce` method dispatch + a spatial hash rebuilt every
step, none of which SoA + dropping the class removes for free elsewhere.

### Step 2 result — SoA + in-place fill (measured, including the bad news)

`computePlacementsSoA` fills eight pre-allocated columns; `computePlacements`
is now a thin shim that materializes the old array-of-objects for callers
that still want it, and `buildPlacements` reads the columns directly.
Golden hash `e892d112…` is unchanged **bit-for-bit** — that was the gate.

Columns are `Float64Array`, not the `Float32Array` this plan originally
specified. The golden fixture fingerprints coordinates to 4 decimals on
values up to ~1000, which sits right at float32's ~7-significant-digit
resolution; narrowing would perturb the hash and leave us unable to tell a
rounding artifact from a real kernel regression. 20k points is 960KB of f64.
Not worth the ambiguity.

Kernel-only timings (`perf.selfcheck.mjs`, which now times the columns, not
the shim):

| | Before (AoS) | After (SoA) |
|---|---|---|
| 20k fill, fresh buffers | 0.95–0.99ms | **0.73–0.83ms** |
| 20k fill, buffers reused | — | **0.49–0.58ms** |
| 8k + fBm displacement | 2.95–3.26ms | **2.83–3.03ms** |

End-to-end `buildPlacements` at 20k, interleaved head-to-head against `main`
in one process (40 trials each, medians):

| Shape | main | branch | Δ |
|---|---|---|---|
| plain | 2.35–2.73ms | 2.59–2.75ms | **−9% to −1% (wash to slight loss)** |
| mirror | 6.18–6.31ms | 4.31–4.69ms | **+26% to +31%** |
| sorted (overlap off) | 9.70–10.83ms | 8.31–8.62ms | **+13% to +20%** |

**The plain path did not get faster, and that is the most useful number
here.** The fill is ~20% faster, but the bind loop that follows it reads all
eight columns for every point — eight concurrent cache streams over ~1.1MB,
against AoS's one object per point whose fields share a cache line. SoA pays
off when a pass touches one or two columns, not all of them. That is
precisely what staged eval (step 4) makes true, and it means **step 2's
speedup is largely still unrealized until step 4 lands.** Nothing here
justifies claiming a win on the headline case.

The mirror and sorted gains are a separate, real effect and not about
columns at all: `buildPlacements` used to build items via `{...p, …}`, a
spread of an object that was itself freshly built, and the resulting hidden
class made the *second* spread (mirror) and the `.scale` reads (sort) slower.
Building one explicit 12-property literal fixes that.

At the shipped quality cap (`maxCount` 420) every one of these paths is under
0.05ms and the differences are unmeasurable. This is headroom work for the
20k target in the issue, not a fix for anything a user feels today.

### Step 3 rejected — the displacement field texture does not pay

This plan specified a 128²×2 `Float32Array` of precomputed fBm, bilinearly
sampled per point. Measured before building it, it fails on both axes.

**It costs more than it saves.** Building a 128² two-channel texture is
32,768 fBm evaluations at **4.78ms**. Evaluating all 8,000 points directly —
the entire thing it was meant to replace — is 16,000 evaluations at
**2.54ms**. Bilinear sampling 8k points is 0.17ms. Break-even in a single
call needs **~16,100 points**; the shipped cap is **420** (800 on HIGH).
Amortised across frames it needs ~38 consecutive frames at an unchanged
`(seed, noiseFreq, noiseSpeed)` to repay a 128² build, ~130 frames at 256²,
~467 at 512² — and the cache-invalidating event is *dragging the noise
slider*, which is exactly when displacement cost is most visible. Each drag
frame would pay a full rebuild: a 4.8–58ms hitch per frame against 0.13ms
today.

**And it isn't accurate enough.** `noiseFreq` reaches 0.03 and
`displacement` reaches 250 on the sliders. Error against exact fBm, in
pixels of displacement:

| noiseFreq | 128² | 256² | 512² |
|---|---|---|---|
| 0.005 (default) | 1.7 RMS / 5.4 max | 0.4 / 1.4 | 0.1 / 0.5 |
| 0.015 | 12.6 / 41.4 | 3.7 / 12.9 | 1.0 / 2.9 |
| 0.030 (slider max) | **31.2 / 108.5** | 12.2 / 40.2 | 3.7 / 12.2 |

A 108px maximum error is a shape in visibly the wrong place. The resolution
needed scales with `noiseFreq`, and the build cost scales with resolution
squared — so the configurations that most need the speedup are precisely the
ones where the texture is most expensive and least accurate.

The generalisable point: a lookup table only wins when lookups vastly
outnumber table entries. Here the table is larger than the workload.
Budget 2 (8k + fBm, <3ms) is met anyway at 2.83–3.03ms post-SoA.

### Step 4 result — staged eval + dirty flags

Split the kernel into `computeGeometrySoA` (stage A+B: sampling,
displacement, `t`/`index`/`zTier`/`depth`, and the *unit* attribute draws)
and `applyAttributes` (stage C: the scale/rotate/alpha arithmetic over those
units). `buildPlacements` takes an optional caller-owned `cache` and skips
stages A/B and D/E (asset bind, colour) whenever their inputs are unchanged.
`useCanvasItems` holds one cache per `<Layer />`.

Why this turned out to be the important step: `useCanvasLife` calls
`setLifeT` on **every rAF frame**, so `effectiveScale`/`effectiveAlpha` are
fresh arrays 60× a second while every geometry input sits still. The full
pipeline was re-running the sampler, the fBm displacement, the weighted asset
pick and `assignColor` every frame to reproduce bit-identical values, purely
so a different scale range could be applied at the end.

Per modulation frame, against `main`:

| Shape | main | staged | |
|---|---|---|---|
| 420 (BALANCED cap) | 0.095ms | 0.046ms | **2.1×** |
| 800 (HIGH cap) | 0.175ms | 0.079ms | **2.2×** |
| 420 + displacement | 0.145ms | 0.042ms | **3.4×** |
| 8000 + displacement | 2.80ms | 0.078ms | **35.9×** |

Budget 4 (incremental dirty-C ≤10% of full eval) is now measurable and
**met at 8k + displacement: 2.4%**. At 420 it reads **20%** and misses. That
floor is the per-frame rebuild of 420 item objects, which no cache stage
skips — once geometry is cached it is nearly all that is left. Closing it
means mutating cached item objects in place, which aliases the previous
frame's items for anyone holding them. Not worth 0.04ms/frame; recorded
rather than hidden.

Correctness is gated by `stagedEval.selfcheck.mjs`: a cached and an uncached
instance are driven in lockstep through 27 scripted parameter transitions and
4,000 seeded-random ones, comparing all 12 fields of every item with
`Object.is`. It also asserts the cache *hits* — 60 modulation frames must
re-run geometry exactly once — because a correct cache that never hits is a
slow no-op nothing else would notice. `e2e/cache-verify.spec.js` covers the
React wiring, where a stale cache would swallow geometry edits while the
canvas kept animating convincingly.

### Proposed sequence for the remaining work items

Ordered so each step is independently measurable against the same harness
before the next begins — no big-bang rewrite, no step that can't be
reverted on its own.

1. ~~**SoA + in-place fill** (item 1)~~ — **DONE**, see "Step 2 result" above.
   Columns landed as `Float64Array` (not `Float32Array` — golden-hash
   precision), `computePlacements` survives as a shim, `buildPlacements`
   reads columns. Golden hash bit-for-bit identical. The measured outcome
   moved the argument for step 4: staged eval is now the step that *pays
   for* the columns, not merely a step that benefits from them.
2. **Swarm SoA** (item 4) — highest measured gain per the baseline above.
   Replace `Particle` instances with parallel typed arrays; keep the
   existing spatial-hash *algorithm* but drop the per-step rebuild if the
   profile shows it dominating (measure before assuming). `bakeParticles`
   keeps its current signature; only its internals change.
3. ~~**Displacement field texture** (item 3)~~ — **REJECTED on measurement.**
   See "Step 3 rejected" below. It is a pessimization at every count this app
   ships, and inaccurate at the top of the `noiseFreq` range.
4. ~~**Staged eval + dirty flags** (item 2)~~ — **DONE**, see "Step 4 result"
   below. Done *before* the swarm SoA and instead of the field texture,
   because the measurement said it was the only remaining change that helps
   the frame the user actually sees.
5. **`EvalContext` ABI + Worker path** (item 5) — once the function is
   pure-buffers-in/pure-buffers-out (a consequence of 1–4), a
   `Transferable`-based Worker call is a thin wrapper, not new engine work.
6. **Rust/WASM** — only if 1–5 still miss budget on real hardware (not just
   this M2 Max), per the issue's explicit rule. Nothing above requires it;
   the numbers so far don't show a JS ceiling, they show unoptimized JS.

### What this addendum is not

Not a claim that #108 is done. `ENFORCE_BUDGET` in `perf.selfcheck.mjs`
stays `false` until the swarm SoA lands — the bake budget is still ~2x over,
so flipping it now would fail every CI run on work that hasn't happened yet.
