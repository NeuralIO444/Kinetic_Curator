# Next-generation feature issues

Drafted from the realtime-core / pause-and-render-high-res direction.
See `NEXTGEN_SPEC.md` for the full reasoning.

| # | Title | Labels |
|---|---|---|
| n01 | Render pipeline: lift quality caps at render time, not just pixels | enhancement, render |
| n02 | Blend modes per shape (screen / multiply / overlay / plus-lighter) | enhancement, render |
| n03 | Weighted asset selection — replace round-robin `i % length` | enhancement, engine |
| n04 | Gradient shading pass — GLOSS vs FLAT | enhancement, render |
| n05 | Accumulation buffer (HYPE BitmapCanvas-style trails) | enhancement, research |
| n06 | Batch edition render — N seeds to disk | enhancement, render |
| n07 | Global hue-rotate control | enhancement, good first issue |

## Build order

1. **Render pipeline** — unblocks everything; has a blocking artistic decision
2. **Blend modes** — cheapest large visual gain
3. **Weighted assets** — smallest change, disproportionate effect
4. **Gradient shading** — depends on blend modes
5. **Batch render** — trivial once render pipeline exists
6. **Accumulation** — own project, conflicts with render pipeline

Hue-rotate can land any time.
