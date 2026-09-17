/**
 * GL candidate renderer — Phase 1 (#187).
 *
 * Interface contract (do not change without bumping GL_CONTRACT_VERSION):
 *   renderCandidate(scene, { width }) -> Promise<{ pixels, width, height }>
 * where `pixels` is RGBA row-major (Buffer) at the requested width,
 * preserving the 1000x700 contract aspect ratio — byte-identical in shape
 * to what reference.mjs returns (top-first rows).
 *
 * Path: corpus doc -> resolveLayers (same as the SVG reference) ->
 * buildSceneContract (v1) -> bake texture atlas + grain LUTs (Node/resvg)
 * -> render in headless Chromium (WebGL2, renderer.mjs) -> readPixels.
 */
import { buildSceneContract } from './sceneContract.js';
import { resolveLayers, whenSwarmWasmReady } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { renderViaGL, closeGlDriver } from './parity/glDriver.mjs';

export const CANDIDATE_READY = true;

export async function renderCandidate(scene, { width = 400 } = {}) {
  const doc = scene.doc;
  if (!doc) throw new Error('[parity] GL candidate: scene has no doc');
  // Same resolution path as the SVG reference (renderSvg with defaults).
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  await whenSwarmWasmReady(); // #175 — wasm fast path warmed up when available
  const resolvedLayers = resolveLayers(doc, { caps });
  const contract = buildSceneContract({ doc, resolvedLayers, caps });
  const height = Math.round((width * 700) / 1000);
  const bg = resolvedLayers[0]?.palette?.bg || '#000000';
  const { pixels } = await renderViaGL(contract, { width, height, bg });
  return { pixels, width, height };
}

/** Release the headless browser + atlas cache (lets the process exit). */
export async function closeCandidate() {
  await closeGlDriver();
}
