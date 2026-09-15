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

## Open

Bugs and gaps found while building the above are filed as #89–#96. The
honest short list of what matters next:

1. **#91 — validate the taste model on real hits.** The machinery is
   proven (AUC 1.000 on a positive control) but has only ever seen
   synthetic labels. This is what makes the app deserve its name.
2. **#90 — render ACCUM trails offline** at true resolution rather than
   upscaling a 1000×700 snapshot.
3. The rest (#92 #94 #96) are real but can wait; #93 and #95 were closed
   as decisions and recorded in [docs/BUGLIST.md](docs/BUGLIST.md).

## Possible follow-ups (not filed)

- WEBM recorder sampling the ACCUM canvas (capture graph)
- Continuous high-res accumulation (memory cost)
- Expose `stratified` in Layout mode UI
- Asset SVG import + unknown-id hygiene
- Modulation matrix (audio/LFO → layout targets)

See [docs/BUGLIST.md](docs/BUGLIST.md).
