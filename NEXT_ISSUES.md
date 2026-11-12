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
[docs/archive/BACKEND_V2_PLAN.md](docs/archive/BACKEND_V2_PLAN.md).

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
**[docs/archive/NEXT_PHASE.md](docs/archive/NEXT_PHASE.md)** (kernel v2 remainder, studio harden, live survivability).

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
Phase 4), #176 (into Phase 5).

## Status 2026-09-23 — this queue is history, not orders

Everything above shipped. Current sequencing lives in [`docs/ROADMAP_V1.md`](docs/ROADMAP_V1.md); current work lives in open GitHub issues. Notes on the old tail this replaces: #177 closed, #103/#104/#158 states changed since, and the modulation matrix exists as the PATCH system (MOD/FIELD/FEED + matrix overview) — do not re-file from this file.

## Status 2026-11-11 — the live queue, grouped

This file remains history. The ledger is GitHub's open-issue list — **36 open** at this sync. In groups:

- **Motion Core (#2109, epic)** — P0, P1 and P3 shipped 2026-11-11. Remaining: P2a/P2b adapters (#2113, #2114), P4 break-up (#2116), P5 stacking (#2117), P6 phrases (#2118), P7 figures (#2119).
- **MegaMind tail** — #1525–#1527 stay open for Matt's on-device acceptance session only (all code merged). In the publish line behind them: the footer backend indicator (#2078) and the panelGraph stripper fix (#2083), both built and QA-passed. The embeddings cache policy (#2086) waits on Matt's ruling.
- **Mind** — #2069 held on Matt's verdict; its reach diagnosis is #2075. Trio follow-through: #2092 (PR 1 of 3 merged), #2094 (diagnosis delivered), #2095 (rulings recorded, build to come).
- **Canon follow-ups** — #2104 (a world record, spec only), #2105 (asset-family mapping), #2106 (more baselines), #2107 (three styles with no chapter — needs Matt's ruling), #2108 (constructs, spec only). Directed work only; nothing here starts itself.
- **FIELD neighbour** — #2100: kc-neighbor is built and tested but FIELD still runs the JS loop; Matt ruled 2026-11-11 — wire it only if `applyField` measures ≥1 ms/frame in a two-swarm scene.
- **Standing / deferred / hardware** — #608 (Syphon, deferred by Matt), #617 (MIDI hardware acceptance), #1183 (one petri dish — FX-as-weather slices stacked locally), #1298 (WebGPU path, deferred by design), #1312 (iPad WebView worker verification), #1479 (loot folder pipeline tail), #1598 (dish shapes), #1710 / #1711 (projects as folders), #1719 (real-hardware performance numbers), #1796 (pattern × dish), #1863 (Strandbeest epic — open thread: mass-based push between beasts).

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas (capture graph)
- Continuous high-res accumulation (memory cost)
- Expose `stratified` in Layout mode UI

See [docs/BUGLIST.md](docs/BUGLIST.md) and [docs/archive/NEXT_PHASE.md](docs/archive/NEXT_PHASE.md).
