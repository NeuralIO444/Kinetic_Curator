# Next phase — kernel & backend engineering

**Date:** 2026-09-16  
**Scope:** What comes after Kernel v1, colour authoring, and Backend v2 MVP.  
**Companion docs:** [KERNEL_V1_PLAN.md](KERNEL_V1_PLAN.md) §16, [BACKEND_V2_PLAN.md](BACKEND_V2_PLAN.md), [BUGLIST.md](BUGLIST.md), [NEXT_ISSUES.md](../NEXT_ISSUES.md).

---

## 1. Shipped (do not rebuild)

| Epic | Outcome |
|------|---------|
| **Kernel v1** (#57, K0–K5) | Index-stable RNG, instanced noise, samplers, scalar fields, particle bake, colour channel |
| **Colour authoring** (#50, P0–P5) | Palette UI, library, harmony, project round-trip |
| **Backend v2** (#73, tracks A–D) | Studio render farm, CLIP Curator, geometry blend, gated genassets |
| **Track E** (live WebGL/WASM as product track) | **Declined** — speed work lives under Kernel v2 (#108) |

Also closed in practice (verify acceptance if needed):

- **#90** — offline ACCUM at true resolution (`studio.py render --accum`)
- **#91** — Curator taste model pipeline; real-hits validation may still need ops data

The “build new engines” era is over. Next work is **finish Kernel v2 remaining steps**, **harden the farm and the live shell**, then product surfaces (moth bodies, Asset Studio).

---

## 2. Kernel — close #108 (Kernel v2)

Pillar: denser modes that do not drop frames. Sleeper UI — artists never see “SoA.”

| Step | Work | Status |
|------|------|--------|
| 1 | Perf baseline + `perf.selfcheck.mjs` | **Done** (#129) |
| 2 | SoA + in-place placement fill (`PlacementSoA`) | **Done** (#139) |
| 3 | Displacement field texture | **Rejected** — measured slower and inaccurate at shipped N (#140) |
| 4 | Staged eval + dirty flags (`computeGeometrySoA` / `applyAttributes` + caller cache) | **Done** (#140) |
| 5 | **Swarm SoA** + spatial-hash inner loop | **Done** (#141) — bake 67→41 ms, live `update()` 1.8–1.9× faster. Budget still missed; see below |
| 6 | **`EvalContext` ABI** — main thread, Worker (`Transferable` SoA), long-lived Node studio | **Outstanding** |

### Budgets (local `perf.selfcheck`; enforce when step 5 lands)

| Target | Budget | Notes |
|--------|--------|--------|
| 20k pts, sample + attrs, no fBm | < 2 ms | Met post-SoA |
| 8k pts + fBm displacement | < 3 ms | Met; field texture not required |
| Bake 400 × 120 swarm steps | < 30 ms | **Miss at 41 ms** after step 5 — see note |
| Incremental dirty-C vs full | ≤ 10% of full | Met at high N after staged eval |

**On the bake budget after step 5.** 67.4 → 41.0 ms, and the remainder is real
work rather than overhead: boids cohesion clumps the swarm, so a settled
400-particle run scans ~40 candidates per particle against the ~13 a uniform
density predicts. Closing the last 11 ms needs either smaller grid cells —
which reorders neighbour visits and therefore changes every existing seed's
output, a product decision — or WASM. Note also that `bakeParticles` runs only
in `studio/render.mjs`; nothing interactive waits on it. The live swarm
(`ParticleSystem.update`, once per frame) got 1.8–1.9× faster at every shipped
particle cap, which is the path with a 16.7 ms deadline.

So `ENFORCE_BUDGET` stays down: it is gated on an open decision, not on undone
work. Flipping it would just fail CI on that decision.

**Also found in step 5:** the swarm is not reproducible across CPU
architectures. `Math.sin`/`cos`/`atan2` are not required to be correctly
rounded and V8 evaluates them differently on x64 vs arm64; 120 chaotic steps
amplify the last-bit difference. Pre-existing, not introduced by the SoA work.
A bake is a pure function of its inputs *on a given machine*. Relevant if the
farm is ever distributed over mixed hardware.

### Language policy

- Stay on **JS** until budgets miss after steps 5–6.
- Only then Rust → WASM with the **same golden vectors**.
- One production math path. Python never computes placements ([BACKEND_V2_PLAN §2.1](BACKEND_V2_PLAN.md)).

### Sibling consumer

- **#109 Moth Bodies** — remaining: second blend ladder in the live sheet; paint / gradient driven by the same scalar `u`. No live path lerp. No Python import from `app/src`.

---

## 3. Backend — harden the farm (#106)

MVP tracks A–D shipped. Architecture stays:

```text
project.json → node (GL pipeline, app/src/gl/exportStill.mjs) → readPixels → PNG → ffmpeg
```

(#191: the render.mjs + resvg stills path is retired for final output.)

Do **not** add a second kernel. Do **not** reopen Track E.

### Work items

1. ~~**Shared project sanitize**~~ — **Done** (#143). `normalizeLayoutParams` gained `PARAM_SPEC`/`RANGE_SPEC` (bounds mirroring the sliders), enum allow-lists for every string field, boolean coercion and prototype-key stripping; `getSampler` no longer bare-indexes `SAMPLERS`. Batch writes `{ ok: false, error, stderr }` sidecars and continues instead of `sys.exit`-ing from a worker thread. Sidecars now also carry `_render.normalized` — what the kernel actually ran, which differs from the authored JSON exactly when the project was out of bounds.
2. ~~**Subprocess timeouts + resource caps**~~ — **Done** (#145). Wall timeouts on node/resvg/ffmpeg, surfacing as `RenderError` so a hang fails one edition instead of stalling the batch forever. `--res` validated and capped at 16384px/side and 64MP (4K unaffected); `--jobs` clamped against cores *and* against half of physical RAM using an estimated in-flight bytes-per-pixel.
3. ~~**Output jail**~~ — **Done** (#145). `under(base, …)` resolves and asserts containment at the point of write, for batch stems and video frames.
4. ~~**Repro report sidecar**~~ — **Done** (#145). `render.mjs --emit-normalized` now reports kernel version, resolved caps, per-layer mode/safeCount/bakeSteps/blend modes, and — the useful part — a `substitutions` list naming every value the renderer silently swapped (`plus-lighter` → `screen`). `KERNEL_VERSION` is a real constant now instead of a string duplicated between `App.jsx` and the golden fixture.
5. ~~**Batch resume**~~ — **Done** (#145). `manifest.json` carries `{ seed, hash, status, path }`; a rerun skips editions whose PNG exists and whose input hash matches, `--force` overrides. The hash covers the *normalized* project, so reformatting the JSON does not invalidate a finished batch but a real change does.
6. **Tier-2 sidecar (later)** — FastAPI on `127.0.0.1` + one-shot token.

Related QA gaps: **#137** (video/batch + ACCUM), **#135** / **#134** (ingest / overlay coverage).

Still open here: item 6, the tier-2 FastAPI sidecar, which was always marked *later*.

---

## 4. Live instrument — survivability (#107)

Not pure kernel; blocks confidence in the next phase.

| Threat | Direction |
|--------|-----------|
| Poisoned project / autosave | State firewall: normalize on every write; reject bad actions |
| Life drift in document state | Modulate ref / overlay — do not write sine into `layoutParams` |
| UNCAPPED export leaves FINAL density | Snapshot path must not stick live caps |
| One layer throw takes down Shell | Nested fail-soft; MasterBar stays up |
| Governor only steps quality | Consider pause evolve / life / ACCUM / swarm at ≈0 FPS |

Share the same **normalize** helper with #106.

---

## 5. Suggested sequencing

```text
1. ~~Kernel v2 step 5 — Swarm SoA~~  DONE (#141)
      └─ Bake still 41 ms vs 30 ms budget; closing it is a product decision
         (swarm output changes) or WASM, so ENFORCE_BUDGET stays down

2. ~~Studio harden (#106) items 1–5~~  DONE (#143, #145)
      └─ Item 6 (FastAPI tier-2 sidecar) still deferred as 'later'

3. Live harden (#107) in parallel where normalize overlaps

4. EvalContext / Worker ABI (#108 step 6)
      └─ After swarm bake is clean; studio long-lived process benefits most

5. Moth Bodies remainder (#109) — second ladder + paint u

6. Asset Studio (#114 / #138) and ingest harden (#136)
      └─ Separate product track; not on the critical path for kernel/backend math
```

### Defer / decline (already decided)

- Live WebGL/WASM as a **product** track (Backend E)
- Displacement field texture (#108 step 3)
- Dual kernel implementations
- Rust unless a measured budget fails after steps 5–6

---

## 6. Bottom line

| Layer | Next phase in one line |
|-------|-------------------------|
| **Kernel** | Close **#108**: swarm SoA + bake budget, then EvalContext / Worker ABI; Rust only if JS still misses |
| **Backend** | **#106**: sanitize, timeouts, resume, repro sidecars — production-viable 4K / batch / video |
| **Cross-cutting** | One **normalize** path for live + studio; **#107** so the instrument survives bad projects and export edge cases |
| **Bodies / product** | **#109** remainder + Asset Studio (#114) after the math path is stable |

---

## 7. Open issues (engineering-facing)

| # | Title | Role |
|---|--------|------|
| [#108](https://github.com/NeuralIO444/Kinetic_Curator/issues/108) | Kernel v2: SoA, staged eval, Worker ABI | Primary kernel epic |
| [#106](https://github.com/NeuralIO444/Kinetic_Curator/issues/106) | Studio harden + 4K / batch / video | Primary backend epic |
| [#107](https://github.com/NeuralIO444/Kinetic_Curator/issues/107) | Live instrument harden | Survivability |
| [#109](https://github.com/NeuralIO444/Kinetic_Curator/issues/109) | Moth Bodies remainder | Product on stable columns |
| [#114](https://github.com/NeuralIO444/Kinetic_Curator/issues/114) | Asset Studio popup | Product (later) |
| [#137](https://github.com/NeuralIO444/Kinetic_Curator/issues/137) | QA: studio video/batch + ACCUM | Coverage |
| [#136](https://github.com/NeuralIO444/Kinetic_Curator/issues/136) | Harden SVG ingest further | Security / hygiene |

*Last updated: 2026-09-16 (post #141 swarm SoA, #143 sanitize, #145 studio harden)*
