import { serializeProject } from '../state/projectDocument.js';

/**
 * exportProject and exportHits in DataExportRow each called serializeProject
 * with the same thirteen fields, built independently. One call site now.
 */
export function buildProjectPayload({
  seed, seedOffsets, paletteId, paletteOverrides, layoutParams, lockedParams, caGrid,
  enabledAssets, quality, autoQuality, assetWeightOverrides, customAssets, layers,
  activeLayerId, layerSnapshots,
}) {
  return serializeProject({
    seed, seedOffsets, paletteId, paletteOverrides, layoutParams, lockedParams, caGrid,
    enabledAssets, quality, autoQuality, assetWeightOverrides, customAssets, layers,
    activeLayerId, layerSnapshots,
  });
}
