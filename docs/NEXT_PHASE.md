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
| 5 | **Swarm SoA** + spatial-hash inner loop; bake writes same buffers | **Outstanding** — bake budget still ~2× over |
| 6 | **`EvalContext` ABI** — main thread, Worker (`Transferable` SoA), long-lived Node studio | **Outstanding** |

### Budgets (local `perf.selfcheck`; enforce when step 5 lands)

| Target | Budget | Notes |
|--------|--------|--------|
| 20k pts, sample + attrs, no fBm | < 2 ms | Met post-SoA |
| 8k pts + fBm displacement | < 3 ms | Met; field texture not required |
| Bake 400 × 120 swarm steps | < 30 ms | **Miss** — driver for step 5 |
| Incremental dirty-C vs full | ≤ 10% of full | Met at high N after staged eval |

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
project.json → node (app kernel) → SVG → resvg → PNG → ffmpeg
```

Do **not** add a second kernel. Do **not** reopen Track E.

### Work items

1. **Shared project sanitize** — `normalizeLayoutParams` / `normalizeProject` used by live `applyProject` and `studio/render.mjs`. Clamp count / layers / modes; finite ranges; allow-listed mode. Bad edition → sidecar `{ ok: false, … }`, continue batch.
2. **Subprocess timeouts + resource caps** — wall timeouts; clamp resolution and `--jobs` vs unified memory.
3. **Output jail** — `-o` stays under the requested tree.
4. **Repro report sidecar** — kernel version, caps, bake steps, blend fallback (`plus-lighter` → `screen`), seed, status.
5. **Batch resume** — manifest `{ seed, hash, status, path }`; skip existing PNGs by default.
6. **Tier-2 sidecar (later)** — FastAPI on `127.0.0.1` + one-shot token.

Related QA gaps: **#137** (video/batch + ACCUM), **#135** / **#134** (ingest / overlay coverage).

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
1. Kernel v2 step 5 — Swarm SoA + bake under budget
      └─ Unblocks #108 acceptance; enables ENFORCE_BUDGET in perf.selfcheck

2. Shared normalize + studio harden (#106 items 1–5)
      └─ 4K / long batch / video become trustworthy

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

*Last updated: 2026-09-16*
