> **Historical plan — the studio render farm shipped (2026-09-15) and its stills path moved to WebGL2 GPU readback (#191, 2026-09-17).** Planning record kept for reference; current behavior is in `studio/README.md`.

# Backend v2 — Local compute tier (macOS / Apple Silicon)

**Status:** Proposed
**Target:** 0.10+ (additive; no break to 0.9 browser app)
**Depends on:** Kernel v1 ([#57](https://github.com/NeuralIO444/Kinetic_Curator/issues/57)) staying the single source of geometry truth
**Date:** 2026-09-15

---

## 1. Why this exists

`KERNEL_V1_PLAN.md` states the current position plainly: *"There is no server backend."* That was the right call for 0.8–0.9 and it stays right for the **live instrument**. This document covers the other half — the work that should never have been in a browser tab in the first place.

The limits below are all recorded in `BUGLIST.md` as intentional. They are intentional *because the browser is the only runtime*, not because they are desirable:

| Current limit | Root cause |
|---|---|
| ACCUM buffer fixed at 1000×700; high-res export upscales it | No offscreen surface larger than the live canvas |
| Batch capped at 48 editions | Browser multi-download prompts |
| WEBM recorder is 15fps screen capture, not a master | `MediaRecorder` on a live canvas |
| Audio / LFO / Evolve absent from deterministic stills | Live-only state, never re-derivable offline |
| 800-shape ceiling | Single-threaded JS on the main thread |
| Seed ≠ bit-identical still | Caps change PRNG consumption |

**Target hardware baseline:** Apple Silicon **M2 or newer**, macOS 26+. Reference machine: M2 Max, 64 GB unified memory, 38-core GPU, Metal 4. A browser tab uses a rounding error of that.

---

## 2. Three tiers, not a rewrite

The project already has the correct seam: **project JSON is already "the reproducible unit"** (#33). Build on it rather than re-plumbing the app.

| Tier | Runtime | Distribution | Role |
|---|---|---|---|
| **0 — Instrument** | Browser (today's app) | GitHub Pages, works anywhere | Live performance. Unchanged. Stays the public demo. |
| **1 — Studio CLI** | Python + Node, local | `git clone` + `uv sync` | Headless render, scoring, batch. Reads/writes project JSON. **Zero app changes.** |
| **2 — Sidecar** | FastAPI on localhost | Local only | The live UI calls Tier 1 when it's running; features hide when it isn't. |

Start at **Tier 1**. It requires no coordination with in-flight epic work and no changes to any existing file.

### 2.1 The rule that protects determinism

> **Do not reimplement the kernel in Python.**

Two implementations of the same math will drift, and the golden-hash fixture (`goldenPlacement.selfcheck.mjs`) stops meaning anything the moment they do. Kernel v1 already requires the core be *"callable from Node selfcheck, Workers, future WASM"* — that requirement is what makes this tier cheap.

```
project.json → Node (existing JS kernel) → SVG → Python (pixels + ML) → PNG / MP4 / scores
```

Python never computes a placement. It rasterizes, measures, and ranks.

---

## 3. Tracks

### A. Headless render farm — *build first*

Node evaluates the kernel and emits SVG; **resvg** rasterizes it. resvg is bit-identical across platforms and architectures, which matters more here than in most projects given the determinism obsession — it is a stronger guarantee than the browser canvas can ever give.

Unlocks, in order of value:
- Any resolution, no canvas-area ceiling (Safari's is lower than Chrome's; neither applies offscreen)
- Thousands of editions to disk, no download prompts, no 48 cap
- ACCUM composited at true target resolution instead of upscaled from 1000×700
- **Deterministic video**: render a frame sequence at a fixed timestep and encode with ffmpeg. This resurrects the motion pipeline `NEXTGEN_SPEC.md` deliberately dropped — but offline, where it always belonged, and without the time-refactor prerequisite applying to the live path
- CI can diff rendered PNGs, not just placement hashes

### B. The Curator — *highest product value*

The app is named **Curator**, and curation is currently 100% manual: favourites, hits, setlist (#35).

- Embed every rendered still with CLIP ViT-L/14 (MLX or Core ML, on GPU/ANE)
- Train a small head on **the operator's own hits vs. passes** — a *personal* taste model, not a generic aesthetic score. A linear probe over CLIP embeddings needs only dozens-to-hundreds of examples, and the favourites data already exists
- Then: render 10,000 seeds headlessly → score → surface the top 20, cluster-diversified so the shortlist isn't twenty near-identical frames
- "More like this" becomes nearest-neighbour in embedding space over seed space

This converts hit-hunting from manual scrubbing into **search over the generative space**. It is the single most on-brand capability available, and it is only possible once Track A can render at volume.

### C. Geometry intelligence

`shapely` + `svgpathtools` outclass anything available in-browser:
- The Illustrator-style **blend / steps** tool (interpolate N intermediate shapes between two assets) — previously scoped and parked for exactly this reason
- Boolean ops, offsetting, path simplification
- Asset hygiene: validate the 137 authored SVGs, auto-classify single-path vs. compound — the precise limitation that blocked the blend tool
- True vector output at any scale, not only raster

### D. Generative asset expansion — *experimental, rank last*

Local diffusion via MLX (the `mlx-community` org publishes ~4,800 quantized models) → `vtracer`/`potrace` → SVG → asset pool. Free, local, no per-image cost.

**Caveat worth stating plainly:** the 137 hand-authored assets are the project's identity. Without Track B acting as a curation gate, this dilutes it. Treat as an experiment with a quality bar, not a content firehose.

### E. Live compute acceleration — *recommend skipping*

Making the browser faster fights the premise. The proxy/final split already says finals leave the browser; Track A is where that happens. Spending here buys a higher live ceiling that the architecture says you shouldn't need.

---

## 4. Tech shortlist (all free)

Present on the reference machine: numpy 2.5, OpenCV 5.0, Pillow 12.2, uv 0.12, Node 22, Homebrew 6.

| Tool | Role | Why this one |
|---|---|---|
| **MLX** | Array framework / model runtime | Built for Apple Silicon unified memory; weights, cache and activations share one pool — ideal at 64 GB |
| **Core ML + coremltools** | On-device inference | ANE access, lowest power; good for always-on scoring |
| **resvg** (`resvg-py`) | SVG → raster | Deterministic and identical across platforms; no system library deps |
| **shapely**, **svgpathtools** | Geometry | Boolean ops, interpolation, simplification |
| **ffmpeg** | Video mastering | Real encode, any fps/codec/resolution |
| **Vision.framework** (pyobjc) | Saliency, classification | Free, built into macOS, zero download |
| **Accelerate / Numba** | CPU math | SIMD without leaving Python |
| PyTorch (MPS) | Fallback | Only where the MLX ecosystem has a gap |

---

## 5. Sequencing

| Phase | Work | Rough size |
|---|---|---|
| **0** | Green CI + regenerate lockfile | done — `78bf50f` |
| **1** | Tier-1 CLI: Node kernel harness + resvg render + ffmpeg video | 3–5 d |
| **2** | CLIP embeddings + personal taste model over existing hits | 3–5 d |
| **3** | Sidecar (FastAPI) so the live UI can call render/score in place | 2–3 d |
| **4** | Geometry track: blend/steps, booleans, vector export | 3–5 d |
| **5** | Generative assets, gated by phase 2 | open-ended |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **Dual math implementations** destroy determinism | Python never computes placements; Node runs the one kernel (§2.1) |
| **macOS-only kills Pages as distribution** | Tier 0 stays the public browser demo; Tier 1+ is a local install |
| **Collision with in-flight epics** (#50 color, #57 kernel) | Tracks A–C touch no file those epics own |
| **Asset dilution** from track D | Gate on track B; keep authored assets primary |
| **Scope drift into a "Math Lab" UI** | Same sleeper principle as Kernel v1: power shows up as better output, not more chrome |

---

## 7. Issue map

| Track | Issue |
|---|---|
| Epic | [#73](https://github.com/NeuralIO444/Kinetic_Curator/issues/73) |
| A — Headless render farm | [#74](https://github.com/NeuralIO444/Kinetic_Curator/issues/74) |
| B — The Curator (taste model) | [#75](https://github.com/NeuralIO444/Kinetic_Curator/issues/75) |
| C — Geometry intelligence | [#76](https://github.com/NeuralIO444/Kinetic_Curator/issues/76) |
| D — Generative assets | [#77](https://github.com/NeuralIO444/Kinetic_Curator/issues/77) |
| E — Live acceleration | *declined, §3.E* |

> #73's description still contains `#PLACEHOLDER_A`–`_D`: the token that filed it can create issues but not edit their bodies. This table is authoritative until that's corrected by hand.

## 8. Open decisions

1. **Does Tier 0 stay a first-class target**, or become a demo of a macOS product? Affects how much the browser path is maintained.
2. **Where do rendered editions live** — flat output dir, or a local library with the embedding index (needed anyway for track B)?
3. **Is generated-asset expansion (D) wanted at all**, given the authored-asset identity?
