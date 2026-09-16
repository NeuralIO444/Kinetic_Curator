// EvalContext ABI adapter (#108 item 5).
//
// buildPlacements() is already the pure-buffers-in/pure-buffers-out kernel
// entry point (steps 1-4 landed that — see its own top-of-file comment).
// This gives it one stable, worker-portable argument shape —
// {seed, layout, palette, assets, t, caps, buffers} — so a caller (main
// thread today, a future Worker boundary if one is ever built) can target
// one ABI without knowing buildPlacements' flat, historically-grown field
// names. Thin adapter only: no geometry/attribute/bind logic lives here.
//
// Field mapping:
//   ctx.seed    -> seed
//   ctx.layout  -> layoutParams, canvasW, canvasH, caGrid (layout.caGrid may
//                  be null/undefined for non-`ca` modes, same as today)
//   ctx.palette -> palette
//   ctx.assets  -> activeAssets
//   ctx.caps    -> caps
//   ctx.buffers -> cache (the staged-eval / item-pool object a caller keeps
//                  across calls so buildPlacements can skip stages and reuse
//                  SoA + pooled-item allocations — see buildPlacements.js)
//   ctx.t       -> NOT threaded through, deliberately. buildPlacements' SVG
//                  placement path has no clock input of its own: per-point
//                  time comes out of geometry (soa.t), and live per-frame
//                  motion arrives pre-baked into layout.layoutParams'
//                  scale/alpha ranges by the caller (useCanvasLife's
//                  effectiveScale/effectiveAlpha), not as a raw t. The
//                  particle swarm (particles.js) is a separate stateful
//                  stepper this pure-eval ABI doesn't drive. Accepting `t` in
//                  the ctx shape now (rather than omitting it) keeps the ABI
//                  future-proof for whichever eval path ends up needing it,
//                  without threading an unused value through buildPlacements
//                  today.
import { buildPlacements } from '../buildPlacements.js';

export function evaluate(ctx) {
  const { seed, layout, palette, assets, caps, buffers } = ctx;
  const { layoutParams, canvasW, canvasH, caGrid } = layout;
  return buildPlacements({
    layoutParams,
    seed,
    activeAssets: assets,
    palette,
    caGrid,
    caps,
    canvasW,
    canvasH,
    cache: buffers,
  });
}
