// panels/beastReadoutLogic.mjs — #1868 S5: the family-resemblance readout, as data for the wet lab.
//
// The readout lives on the inspection surface only (acceptance 3) — the stage is never annotated. Each banked beast is a
// row: its own signature curve drawn to the SHARED frame of itself and its nearest relative, so a mutation's kink is
// visible against the relative's ovoid, plus the relative's id and the measured distance. Pure.

import { sanitizeRig } from '../engine/creatureRig.js';
import { footSignature, signatureDistance, signaturePath, kinship } from '../engine/beastTrails.js';

const CACHE = new Map(); // measures JSON -> signature (or null)
const sigOf = (measures) => {
  const key = JSON.stringify(measures);
  if (!CACHE.has(key)) {
    if (CACHE.size >= 96) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, footSignature(measures));
  }
  return CACHE.get(key);
};

/**
 * The beast rows of a pool: [{ id, legs, scale, path, kin: null | { id, distance, label, path } }]. A beast with no
 * signature (a stillbirth that somehow reached the pool) is left out; the nearest relative is the least-distant other beast.
 */
export function beastRows(customAssets, box = { w: 132, h: 72 }) {
  const beasts = [];
  for (const a of customAssets || []) {
    if (!a || a.category !== 'creature' || a.source !== 'wetlab') continue;
    const rig = sanitizeRig(a.rig); // a beast is a wet-lab creature tile whose rig carries a linkage
    const sig = rig && rig.linkage ? sigOf(rig.linkage.measures) : null;
    if (sig) beasts.push({ id: a.id, m: rig.linkage.measures, sig });
  }
  return beasts.map((b) => {
    let near = null;
    for (const o of beasts) {
      if (o === b) continue;
      const d = signatureDistance(b.sig, o.sig);
      if (!near || d < near.distance) near = { o, distance: d };
    }
    const frame = near ? [...b.sig, ...near.o.sig] : null;
    return {
      id: b.id,
      legs: b.m.legCount,
      scale: Math.round(b.m.scale * 100) / 100,
      path: signaturePath(b.sig, { ...box, frame }),
      kin: near
        ? {
            id: near.o.id,
            distance: Math.round(near.distance * 1000) / 1000,
            label: kinship(near.distance),
            path: signaturePath(near.o.sig, { ...box, frame }),
          }
        : null,
    };
  });
}
