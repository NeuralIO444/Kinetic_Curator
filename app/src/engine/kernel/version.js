/**
 * Kernel version — single source of truth.
 *
 * Bump when the placement/weight/colour pipeline changes in a way that moves
 * the golden fixture. It appears in three places that must agree:
 *
 *   - the app footer (App.jsx), so an artist can say what built a piece
 *   - goldenPlacement.selfcheck.mjs, which pins the placement hash
 *   - studio repro sidecars (#106), so an edition records the engine that
 *     produced it
 *
 * It lived as a bare string in the first two of those, which meant the footer
 * could drift from the fixture and nobody would notice.
 */
export const KERNEL_VERSION = 'kernel.v2';
// kernel.v2 — #1237: bake accents derive from the palette slot instead of
// swatches.indexOf(color). Stills baked on palettes with duplicate hexes
// move (duplicates previously got the first match's accent — a bugfix).
// (#1247 will add the fixture-manifest check that fails when fixtures move
// without a version bump.)
