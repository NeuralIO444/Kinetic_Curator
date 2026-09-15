# Next-generation feature issues

Drafted from the realtime-core / pause-and-render-high-res direction.
See `NEXTGEN_SPEC.md` for the full reasoning.

## Status (0.9.0)

**Kernel v1 MVP shipped** (#58–#61). See [docs/KERNEL_V1_PLAN.md](docs/KERNEL_V1_PLAN.md).

| # | Title | Outcome |
|---|--------|---------|
| #58 K0 | Channel RNG + index-stable density/attrs | **Shipped** |
| #59 K1 | Instanced noise | **Shipped** |
| #60 K2 | Sampler protocol + stratified | **Shipped** |
| #61 | Golden + CHANGELOG 0.9 | **Shipped** |
| #62–#64 | Fields / bake / color channel | Open (post-MVP) |

0.8 next-gen table also shipped (render, weights, project, batch, accum, setlist, CI).

## Open tracks

### Color authoring
Epic [#50](https://github.com/NeuralIO444/Kinetic_Curator/issues/50) — P0–P5 [#51](https://github.com/NeuralIO444/Kinetic_Curator/issues/51)–[#56](https://github.com/NeuralIO444/Kinetic_Curator/issues/56).

### Kernel post-MVP
[#62](https://github.com/NeuralIO444/Kinetic_Curator/issues/62) fields · [#63](https://github.com/NeuralIO444/Kinetic_Curator/issues/63) bake particles · [#64](https://github.com/NeuralIO444/Kinetic_Curator/issues/64) color channel.

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas (capture graph)
- Continuous high-res accumulation (memory cost)
- Expose `stratified` in Layout mode UI
- Asset SVG import + unknown-id hygiene
- Modulation matrix (audio/LFO → layout targets)

See [docs/BUGLIST.md](docs/BUGLIST.md).
