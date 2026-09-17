/**
 * SVG reference renderer — Phase 0 (#186).
 *
 * Renders a corpus scene through the existing studio SVG path
 * (studio/render.mjs, the same emitter the export pipeline uses) and
 * rasterizes it with resvg to RGBA pixels. This is the "reference" side
 * of the parity harness; the GL candidate side plugs in during Phase 1.
 *
 * Render width is scaled down (default 400px) for harness speed; the
 * aspect ratio is always the contract canvas (1000x700).
 */
import { Resvg } from '@resvg/resvg-js';
import { renderSvg } from '../../../../studio/render.mjs';

/** The SVG string for a scene (no rasterization — fast determinism check). */
export function renderReferenceSvg(scene) {
  return renderSvg(scene.doc);
}

/**
 * @returns {Promise<{pixels: Buffer, width: number, height: number, svgBytes: number}>}
 */
export async function renderReference(scene, { width = 400 } = {}) {
  const svg = renderReferenceSvg(scene);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    // No system fonts: the corpus excludes text-bearing assets, so
    // reference pixels never depend on font resolution.
  });
  const img = resvg.render();
  return {
    pixels: Buffer.from(img.pixels),
    width: img.width,
    height: img.height,
    svgBytes: svg.length,
  };
}
