# ACCUM ceiling harness (#361)

Fast debug. No new panel.

## Numbers (no browser)

```bash
cd app
node scripts/accumRatchet.probe.mjs
node scripts/accumRatchet.probe.mjs --optics 1 --fade 0.94 --frames 300
```

Prints when a single pixel hits paper with the current bloom/halo add, and what `min(rgb,1)` would do.

## Eyes (current main)

1. `npm run dev`
2. ACCUM on, GLOW up, wait 10s. CLEAR ACCUM wipes.
3. X-RAY → `accum/glow` measured vs est.
4. GOV TUNE → histogram if FPS drops.

Do not merge parked voice/smoke PRs until the ceiling lands.
