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
export const KERNEL_VERSION = 'kernel.v1';
