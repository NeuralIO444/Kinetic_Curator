# 02 — Picture

*The frame never dies. Color moves. A chip is a dissolve, not an amputation.*

Issues: #388 B, #390 D, #391 E. Research: `liveLoop.mjs` buildFrame, `liveAtlas.mjs` comboKey, `paletteMix.mjs`, `voices.js` enum snap.

## What exists

- Atlas cell = `asset|ink|accent`. Missing cell **throws**. `aKey` change → `buildFrame` null → hold last pixels. #381 steps hex ~6/s so MIX is not a 15 fps freeze. Scar, not design.
- `QUAD_FS` multiplies opacity only. Color is pre-baked SVG.
- Palette MIX: hold FBO + `mixWithHold`. Voice MIX: lerp numbers, **snap mode/behave/assets at t=0.5**.
- Stub system chips still hard-write `mode`.
- Per-item non-normal blend goes through a scratch FBO (one item = one fullscreen pass).

## Research take

Resolume and HYPE never stop presenting. Color on GPU (tint / grade) is how VJ tools change a look without reprinting glyphs. KC-1 reprints glyphs. That is the 200ms hitch people will remember longer than any showcase name.

The t=0.5 enum snap is the anti-HYPE. A murmuration that becomes a grid mid-wing is a farm job. Hold A's pixels, run B live, wipe. One world.

## Plan

1. Skip missing cells. Keep presenting + simulating (#388).
2. Live mask atlas + instance ink/accent. Stills baker stays hex (#390).
3. Mode/voice/preset ride `createPaletteMix`. No second swarm. Sliders exp-damp. Stop midpoint snaps (#391).

## Sticky test

Palette slam stays ~60. Grid → swarm is a picture wipe. SNAP hashes unchanged across D.

## Do not

Rip #381 before B+D. Dual live particle systems. Fullscreen color FX as the tint.
