# Kinetic Curator Wiki (repo mirror)

GitHub Wiki can mirror these pages if enabled. Canonical docs live under `/docs`.

## Pages

| Page | Path |
|------|------|
| Home / overview | [README](../README.md) |
| Architecture | [architecture.md](architecture.md) |
| Changelog | [CHANGELOG](../CHANGELOG.md) |
| Known limits / bugs | [BUGLIST.md](BUGLIST.md) |
| Task board | [task.md](task.md) |
| Manifesto | [manifesto.md](manifesto.md) |
| Next-gen map (shipped) | [NEXT_ISSUES](../NEXT_ISSUES.md) |

## Quick start

```bash
cd app && npm install && npm run dev
```

## Current highlights

- WebGL2 finals engine: GPU FX library (10 effects), GPU accumulation + bloom, 4K/8K stills via GPU readback, pixel-parity harness in `npm run selfcheck`
- Showrunner governor retuned: resolution sheds before effects; shed states are reported, never silent
- Shipped presets: KILN COLUMNS, VORTEX RWB
- Render quality pillars: one kernel, one seed; finals off-store; sidecar honesty
- Organism contacts (bounce / swap / breed), moth-body ladders, overlay QA

## Earlier (0.8.0)

- Project JSON + RENDER FINAL / BATCH / ACCUM
- Setlist morph, weight mix, gloss LOD
- CI: `npm run selfcheck` + Playwright smoke

*Version: 0.8.0 · 2026-09-15*
