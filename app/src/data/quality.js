// Quality presets — soft ceilings for interactive performance.
// Showrunner budgets (§7): each tier carries per-subsystem ceilings so
// the governor can shed the right thing instead of only stepping density.
//
// #296 — the performer-facing name for each tier is its `budget`: a
// deliberate creative constraint (FULL / SHOW / LEAN), not a spec-sheet
// entry. `id` and `label` are unchanged — every caps lookup, project
// serialization, and governor comparison still keys on `id`; `budget` is
// presentation only, read by the PLAY ceiling knob and the Q meter.
//
// Phase 6 (#192): `maxFxLayers` is retired as a tier budget. FX compositing
// runs on the GPU (one extra FBO pair + one filter pass per wrap), so the
// per-tier FX-layer caps that culled stacked FX on the SVG path no longer
// buy anything — all live tiers allow unbounded FX wraps, like FINAL_CAPS.
// The tier budgets that remain are placement/particle counts (CPU-side
// kernel + atlas upload work), filter-primitive counts, and the per-layer
// asset budget. New keys: maxFilterPrimitives, maxAssetsPerLayer,
// turbulenceOctaves. FINAL_CAPS stays the ungoverned "cinematic" tier.
//
// Governor shed order (see hooks/governorCuts.js): dynamic resolution
// scale first, then quality tier step, then mirror/gloss/ACCUM (perfTier1),
// then asset thinning, then a render-only count clamp, then motion freeze,
// then the watchdog. FX layers are NEVER culled — that was the silent-cull
// trap (#103 P1, #192): an FX layer shown in the UI while its wrap was
// shed. buildSceneContract still *reports* any shed wraps (contract.shed)
// so a future cap can never go silent again.

export const QUALITY_PRESETS = {
  high: {
    id: 'high',
    label: 'HIGH',
    budget: 'FULL',
    maxCount: 800,
    maxCountMirrored: 650,
    maxParticles: 350,
    allowMirror: true,
    allowGloss: true,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 8,
    maxAssetsPerLayer: 96,
    turbulenceOctaves: 3,
    description: 'Full fidelity — best hardware',
  },
  balanced: {
    id: 'balanced',
    label: 'BALANCED',
    budget: 'SHOW',
    maxCount: 420,
    maxCountMirrored: 360,
    maxParticles: 200,
    allowMirror: true,
    allowGloss: true,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 6,
    maxAssetsPerLayer: 48,
    turbulenceOctaves: 2,
    description: 'Good density, stable frame rate',
  },
  performance: {
    id: 'performance',
    label: 'PERF',
    budget: 'LEAN',
    maxCount: 180,
    maxCountMirrored: 140,
    maxParticles: 100,
    allowMirror: false,
    allowGloss: false,
    maxFxLayers: Infinity, // #192: retired as a budget — GPU composites all FX wraps
    maxFilterPrimitives: 4,
    maxAssetsPerLayer: 24,
    turbulenceOctaves: 1,
    description: 'Protects interactivity on weaker machines',
  },
};

/**
 * #1433 (R2) — the region-animation device budgets: how many of a
 * mark's tagged regions (bake tags up to 12, identically on every
 * machine) the governor may animate individually per device class.
 * Desktop gets the full tag count; iPad-class GPUs get the tighter
 * budget. The governor tightens further under measured frame cost
 * (sceneContract.regionAnimBudget); this table is only the ceiling,
 * read where the other device budgets live — never hard-code the
 * numbers at a call site.
 */
export const REGION_BUDGETS = Object.freeze({ desktop: 12, ipad: 8 });

/** The region-animation budget for a device class (iPad-class = true). */
export function regionBudgetForDevice(ipadClass) {
  return ipadClass ? REGION_BUDGETS.ipad : REGION_BUDGETS.desktop;
}

/**
 * #1639 — the frame budgets: what one recipe's render is ALLOWED to cost, per device class, in the
 * cost harness's own terms (the label of costDataset.mjs: median of per-repetition p90 frame ms,
 * readback-forced renderScene through the real render path). Until now the harness measured and
 * nothing judged: "too heavy" was an opinion discovered live, on stage, on the weaker machine.
 *
 * Derivation. Both classes target 60 fps — a 16.7 ms frame. The label is an upper-bound measure
 * (a live frame never pays the full forced readback), so the cap is set against that conservative
 * number as the render's share of the frame: desktop 8.0 ms (≈half the frame; the rest is resolve
 * CPU, compositing, presentation, input, audio). iPad 5.0 ms (≈30%): the same show runs on a
 * passively cooled SoC that also carries touch and the whole UI, and the slices already ruled
 * inside that allowance (the creature system's 2.0 ms GPU slice) spend from it too. A recipe at
 * ≥80% of a cap is a NEAR-bust: it fits, with no headroom for the weather still to come.
 *
 * These caps judge datasets measured on device-class hardware. A software-GL (SwiftShader)
 * dataset's labels run orders of magnitude slower; classifying one still produces the ordering
 * and the spread, but its verdicts describe that environment, never the device — the budget
 * report (scripts/costBudgetReport.mjs) stamps the environment on its face for this reason.
 *
 * The governor cost head's remainder (#1578) consumes these same numbers. Read them here —
 * never hard-code them at a call site.
 */
export const FRAME_BUDGETS = Object.freeze({
  desktop: Object.freeze({ targetFps: 60, frameMs: 1000 / 60, renderCapMs: 8.0, nearBustRatio: 0.8 }),
  ipad: Object.freeze({ targetFps: 60, frameMs: 1000 / 60, renderCapMs: 5.0, nearBustRatio: 0.8 }),
});

/** The frame budget for a device class (iPad-class = true). */
export function frameBudgetForDevice(ipadClass) {
  return ipadClass ? FRAME_BUDGETS.ipad : FRAME_BUDGETS.desktop;
}

/**
 * The creature system's allowance inside the frame budgets above: 2.0 ms of the frame at the
 * population cap (the skeleton-creature ruling, 2026-10-16; it spends from the iPad class's
 * 5.0 ms render cap). Until #1694 slice 2 this number lived only in this file's prose and the
 * design record; the citizen's cost declarations (engine/kernel/costRegistry.mjs, ids
 * creature/moth and creature/dish) are judged against it by scripts/costBudgetReport.mjs —
 * a family at ≥80% of it (FRAME_BUDGETS' nearBustRatio) is a near-bust. Read it here, never
 * hard-code it at a call site.
 */
export const CREATURE_FRAME_ALLOWANCE_MS = 2.0;

/**
 * #1574 Q2 (ruled by Matt, 2026-10-20) — the traveler budget: how many of a
 * FLOW scene's placed marks the governor may let travel, per device class.
 * The author sets the ceiling, not the amount: a FLOW scene requests travel
 * for every placed mark (the P1 behaviour), and the governor's selection
 * (engine/kineme.js selectTravelers) is the effective amount — at or below
 * that request, and at or below what the class cap affords in cost terms.
 * Governor-selected, never a panel control: no surface edits these numbers.
 *
 * Derivation — the cap is a cost budget in traveler units. Desktop: 800,
 * exactly the placement count cap at which FLOW travel was measured
 * (0.387 ms in the P1 sandbox bench; declared travel/flow timeMs 0.39 in
 * the kernel cost registry), so a desktop scene at its maximum authored
 * count costs exactly the declared travel cost and desktop behaviour is
 * bit-identical to P1. Each entry's timeMs is the desktop-measured cost
 * equivalence of its traveler count (the declared 0.39 at 800 marks,
 * linear in marks: per-mark = 0.39 / 800).
 *
 * iPad: 500 — BUILDER CALL, flagged as such: no iPad-class travel
 * measurement exists yet (the Q2 ruling itself records the iPad cap as
 * pending the device bench). The tightness ratio is FRAME_BUDGETS'
 * iPad/desktop render-cap ratio, 5.0 / 8.0 — the frame-cost budget, the
 * nearest budget in kind to travel's per-frame CPU cost — so the iPad
 * class affords 800 × 5/8 = 500 travelers, 0.24375 ms of desktop-equivalent
 * travel cost. Re-derive from a measured iPad number when the bench lands;
 * do not tune this by eye.
 */
export const TRAVEL_BUDGETS = Object.freeze({
  desktop: Object.freeze({ maxTravelers: 800, timeMs: 0.39 }),
  ipad: Object.freeze({ maxTravelers: 500, timeMs: 0.24375 }),
});

/** The traveler budget for a device class (iPad-class = true). */
export function travelBudgetForDevice(ipadClass) {
  return ipadClass ? TRAVEL_BUDGETS.ipad : TRAVEL_BUDGETS.desktop;
}

/** Caps used when RENDER · UNCAPPED is on — no interactivity to protect. */
export const FINAL_CAPS = {
  id: 'final',
  label: 'FINAL',
  maxCount: 800,
  maxCountMirrored: 800,
  maxParticles: 400,
  allowMirror: true,
  allowGloss: true,
  maxFxLayers: Infinity,
  maxFilterPrimitives: Infinity,
  maxAssetsPerLayer: Infinity,
  turbulenceOctaves: 4,
  description: 'Render-time density (not for live play)',
};

/** Skip second gloss <use> when node count exceeds this under BALANCED/HIGH. */
export const GLOSS_NODE_THRESHOLD = 280;

/**
 * SVG filter regions are clamped to this fraction of the viewport.
 * Unbounded filter regions are a silent frame-rate killer (the browser
 * rasterizes the whole region per filter pass), so this is a clamp, not a
 * tier — it applies at every quality level including final renders.
 */
export const MAX_FILTER_REGION = 1.0;

/** Was a local const in PipelinePanel.jsx; needed by every file the PIPELINE
 *  panel split into, so it lives here instead of being recomputed per file. */
export function resolutionLabel(exportResolution) {
  return `1000×700@${exportResolution}x`;
}

export function getQualityCaps(qualityId) {
  return QUALITY_PRESETS[qualityId] || QUALITY_PRESETS.balanced;
}

/** #296 — the performer-facing budget name for a tier id (FULL / SHOW /
 *  LEAN). Falls back to the tier's spec label, never to undefined — a
 *  dangling quality key must still read as something honest. */
export function getBudgetName(qualityId) {
  const preset = QUALITY_PRESETS[qualityId];
  return (preset && preset.budget) || (preset && preset.label) || 'SHOW';
}

/** Live quality caps, or FINAL_CAPS when uncapped final render is requested. */
export function getRenderCaps(qualityId, uncapped = false) {
  if (uncapped) return FINAL_CAPS;
  return getQualityCaps(qualityId);
}

/** Whether the live path should draw the gloss overlay pass. */
export function shouldRenderGloss(qualityId, shading, nodeCount) {
  if (shading !== 'gloss') return false;
  const caps = getQualityCaps(qualityId);
  if (caps.allowGloss === false) return false;
  if (nodeCount > GLOSS_NODE_THRESHOLD) return false;
  return true;
}
