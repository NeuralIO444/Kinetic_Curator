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

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas
- Continuous high-res accumulation (memory cost)
- Offline pure-SVG densify without lifting live store state
- Regenerated `package-lock.json` including Playwright

See [docs/BUGLIST.md](docs/BUGLIST.md).
