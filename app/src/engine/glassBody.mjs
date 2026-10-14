/**
 * glassBody.mjs — #1547 (Materials M1): the `material: 'glass'` body.
 *
 * The material param's history: plate / wash / stipple were gradient
 * fills of the retired SVG layer (engine/materials.js, #122; the layer
 * retired around #268) and have no GL meaning yet — M2/M3 restore them.
 * 'glass' is the GL-era material: #1129 built its machinery keyed to the
 * `glass` BOOL param — back-to-front z-tier sort (glassSort.mjs) plus
 * the soft-bevel / caustic / striation lighting the quad shader selects
 * per-instance via v_glass (glassBevel.mjs et al.). M1 makes the
 * material value the second switch into that same machinery, and gives
 * the body its alpha here, at placement time, so every consumer of
 * placed items — the census, the SVG reference stills, the scene
 * contract's alpha→opacity — sees the same translucent body; the
 * shader's glass lighting rides the item flag through the contract
 * (sceneContract toInstance carries `glass` when set).
 *
 * The alpha is keyed to the MATERIAL only. The bool path's
 * translucency is authored by the voice's own alpha range (the
 * dark-glass voice rolls alpha [70, 100]) and stays exactly as shipped.
 *
 * GLASS_BODY_ALPHA — the fraction of its rolled alpha an instance
 * keeps when its stratum's material is glass. 0.78 centres the band the
 * dark-glass voice authors by hand (70–100%): a flat material constant,
 * not a per-instance roll, so a glass stratum's depth ordering stays
 * the author's own. Material judgement — Matt's eye at review can move
 * this one number.
 *
 * GPU cost tier: 0 — one multiply per placed instance at build time;
 * the sort and shader terms it engages are the existing #1129 tiers
 * (engine/glass-sort, light/glass-soft-bevel, the caustic/striation
 * declarations), declared at their own sites.
 */
import { registerCostTier } from '../gl/costTiers.mjs';

export const GLASS_MATERIAL = 'glass';

/** Fraction of rolled alpha a glass-material body keeps. */
export const GLASS_BODY_ALPHA = 0.78;

/** The material-param switch: is this layoutParams.material the glass material? */
export function isGlassMaterial(material) {
  return material === GLASS_MATERIAL;
}

registerCostTier('engine/glass-body', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: '#1547: material glass body — one alpha multiply per placed instance at build time; engages the existing #1129 sort + shader glass terms, no new pass or texture',
});
