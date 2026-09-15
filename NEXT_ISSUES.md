# Next-generation feature issues

Drafted from the realtime-core / pause-and-render-high-res direction.
See `NEXTGEN_SPEC.md` for the full reasoning.

## Status (0.8.0)

All of the original next-gen table below **shipped** (or a pragmatic subset for accumulation):

| # | Title | Outcome |
|---|--------|---------|
| n01 / #24 | Render pipeline: lift quality caps at render time | **Shipped** — RENDER FINAL + UNCAPPED |
| n02 | Blend modes per shape | **Shipped** earlier (layout blendMode) |
| n03 | Weighted asset selection | **Shipped** — SELECTION_WEIGHT + UI overrides (#34) |
| n04 | Gradient shading — GLOSS vs FLAT | **Shipped** + gloss LOD (#36) |
| n05 / #28 | Accumulation buffer | **Shipped** — live 1000×700 buffer; not continuous 8K accumulate |
| n06 / #29 | Batch edition render | **Shipped** — PNG + JSON sidecar |
| n07 | Global hue-rotate | **Shipped** earlier |

Related engineering also closed: pure `buildPlacements` (#32), project JSON (#33), setlist/morph (#35), CI golden + smoke (#37), hygiene (#38).

## Open tracks (post-0.8)

### Color authoring
Epic [#50](https://github.com/NeuralIO444/Kinetic_Curator/issues/50) — P0–P5 [#51](https://github.com/NeuralIO444/Kinetic_Curator/issues/51)–[#56](https://github.com/NeuralIO444/Kinetic_Curator/issues/56).

### Kernel v1 (sleeper math backend)
Plan: [`docs/KERNEL_V1_PLAN.md`](docs/KERNEL_V1_PLAN.md)  
Epic [#57](https://github.com/NeuralIO444/Kinetic_Curator/issues/57) — K0–K5 + chore [#58](https://github.com/NeuralIO444/Kinetic_Curator/issues/58)–[#64](https://github.com/NeuralIO444/Kinetic_Curator/issues/64).  
**MVP = K0+K1+K2 → 0.9.0** (intentional seed break).

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas (capture graph)
- Continuous high-res accumulation (memory cost)
- Offline pure-SVG densify without lifting live store state
- Regenerated `package-lock.json` including Playwright
- Asset SVG import + unknown-id hygiene
- Modulation matrix (audio/LFO → layout targets)

See [docs/BUGLIST.md](docs/BUGLIST.md).
