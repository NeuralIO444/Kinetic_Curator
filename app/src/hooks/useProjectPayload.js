import { serializeProject } from '../state/projectDocument.js';

/**
 * exportProject and exportHits in OutputPanel each called serializeProject
 * with the same eleven fields, built independently. One call site now.
 */
export function buildProjectPayload({
  seed, paletteId, paletteOverrides, layoutParams, lockedParams, caGrid,
  enabledAssets, quality, assetWeightOverrides, customAssets, layers,
  activeLayerId, layerSnapshots,
}) {
  return serializeProject({
    seed, paletteId, paletteOverrides, layoutParams, lockedParams, caGrid,
    enabledAssets, quality, assetWeightOverrides, customAssets, layers,
    activeLayerId, layerSnapshots,
  });
}
