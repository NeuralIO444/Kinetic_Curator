# Next-generation feature issues

Drafted from the realtime-core / pause-and-render-high-res direction.
See `NEXTGEN_SPEC.md` for the full reasoning.

## Status

**Kernel v1 complete.** K0–K5 all shipped; epic #57 closed.

| # | Title | Outcome |
|---|--------|---------|
| #58 K0 | Channel RNG + index-stable density/attrs | **Shipped** |
| #59 K1 | Instanced noise | **Shipped** |
| #60 K2 | Sampler protocol + stratified | **Shipped** |
| #61 | Golden + CHANGELOG 0.9 | **Shipped** |
| #62 K3 | Scalar fields — CA density sampling | **Shipped** |
| #63 K4 | Particle bake — deterministic swarm stills | **Shipped** |
| #64 K5 | Colour assignment channel | **Shipped** |

**Colour authoring complete.** P0–P5 all shipped; epic #50 closed.

| # | Title | Outcome |
|---|--------|---------|
| #51 P0 | Reveal full active palette | **Shipped** |
| #52 P1 | Palette overrides + slot edit | **Shipped** |
| #53 P2 | Project JSON round-trip | **Shipped** |
| #54 P3 | paletteShift in the UI | **Shipped** |
| #55 P4 | User palette library | **Shipped** |
| #56 P5 | Harmony tools | **Shipped** |

**Backend v2 (`studio/`) complete.** Epic #73 closed. See
[docs/BACKEND_V2_PLAN.md](docs/BACKEND_V2_PLAN.md).

| # | Title | Outcome |
|---|--------|---------|
| #74 A | Headless render farm (Node kernel → resvg → ffmpeg) | **Shipped** |
| #75 B | The Curator — CLIP taste model | **Shipped** |
| #76 C | Geometry — blend + asset audit | **Shipped** |
| #77 D | Generative assets, behind a mandatory gate | **Shipped** |

Track E (live compute acceleration) was **declined**, not deferred — see
BACKEND_V2_PLAN §3.E.

0.8 next-gen table also shipped (render, weights, project, batch, accum,
setlist, CI).

## Open — what matters next

Authoritative sequencing and issue map:
**[docs/NEXT_PHASE.md](docs/NEXT_PHASE.md)** (kernel v2 remainder, studio harden, live survivability).

Primary tracks:

1. **#108 Kernel v2** — swarm SoA + bake under budget, then EvalContext / Worker ABI (steps 5–6; 1–4 done, step 3 rejected).
2. **#106 Studio harden** — sanitize, timeouts, batch resume, repro sidecars; viable 4K / batch / video.
3. **#107 Live harden** — state firewall, life drift out of document state, fail-soft canvas (share normalize with #106).
4. **#109 Moth Bodies** — second ladder + paint `u` (after columns are stable).

## WebGL export spine — shipped 2026-09-17

The WebGL work order (labels `order:01`–`order:19`) replaced the SVG/resvg
finals path with a WebGL2 GPU pipeline. All phases merged to main; the SVG
emitter is now a dev-only parity reference.

| # | Phase | Outcome |
|---|--------|---------|
| #186 | Phase 0 — contracts + parity harness | **Shipped** (`docs/GL_CONTRACT.md`, `app/src/gl/parity/`) |
| #187 | Phase 1 — texture-atlas asset rendering | **Shipped** |
| #193 | Shader debug harness | **Shipped** (`docs/SHADER_DEBUG.md`, dev-only) |
| #194 | JS↔GL bridge | **Shipped** |
| #195 | Effect-authoring template | **Shipped** |
| #196 | Shared GLSL chunk library | **Shipped** |
| #188 | Phase 2 — GPU FX library (10 effects) | **Shipped** |
| #189 | Phase 3 — layer compositing + mattes | **Shipped** (#154 absorbed — do not build separately) |
| #190 | Phase 4 — GPU accumulation + bloom | **Shipped** (#169 absorbed — do not build separately) |
| #191 | Phase 5 — finals via GPU readback (1×–8K) | **Shipped** (#176 absorbed — do not build separately) |
| #192 | Phase 6 — SVG retirement + governor retune | **Shipped** |

Absorbed (closed, do-not-build-separately): #154 (into Phase 3), #169 (into
Phase 4), #176 (into Phase 5). Remaining live issues: #175 (swarm bake 30ms
budget), #177 (UX polish), #172 (print desk), #114 (Asset Studio),
#103/#104/#158 (independent backlog).

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas (capture graph)
- Continuous high-res accumulation (memory cost)
- Expose `stratified` in Layout mode UI
- Modulation matrix (audio/LFO → layout targets)

See [docs/BUGLIST.md](docs/BUGLIST.md) and [docs/NEXT_PHASE.md](docs/NEXT_PHASE.md).
