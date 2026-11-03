import { serializeProject } from '../state/projectDocument.js';

/**
 * The one-file envelope (buildExportBundle) and the hits feed each serialize
 * the project from the same fields, built independently. One call site now.
 */
export function buildProjectPayload({
  seed,
  seedOffsets,
  paletteId,
  paletteOverrides,
  paletteLocks,
  layoutParams,
  lockedParams,
  caGrid,
  enabledAssets,
  quality,
  autoQuality,
  assetWeightOverrides,
  assetKineme,
  regionKinemes,
  audioRoutes,
  midiMap,
  midiBanks,
  midiActiveBank,
  customAssets,
  creatureRecords, // #1850 — a bundle carries each creature with its pool tile, never the tile alone
  layers,
  activeLayerId,
  layerSnapshots,
  projectTitle,
}) {
  return serializeProject({
    seed,
    seedOffsets,
    paletteId,
    paletteOverrides,
    paletteLocks,
    layoutParams,
    lockedParams,
    caGrid,
    enabledAssets,
    quality,
    autoQuality,
    assetWeightOverrides,
    assetKineme,
    regionKinemes,
    audioRoutes,
    midiMap,
    midiBanks,
    midiActiveBank,
    customAssets,
    creatureRecords, // #1850 — a bundle carries each creature with its pool tile, never the tile alone
    layers,
    activeLayerId,
    layerSnapshots,
    projectTitle,
  });
}
