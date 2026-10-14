// Kernel bake — multi-strata dish bake (#1407).
//
// bakeParticles steps ONE system; a petri-dish still needs several strata
// stepped in lockstep under one shared grid, or the cross-strata contacts
// the live loop computes could never appear in a bake. This driver is the
// multi-system sibling: it assembles each layer's params exactly as
// bakeParticles does (particleCount + maxParticles threaded in), enrols
// every layer into one dish session, and steps the layers in stratum
// order from the same fixed origin at the same fixed dt — so the result
// is the same pure function of (seeds, params, steps) the live protocol
// computes at locked dt (the #813 parity class, extended across strata).
//
// JS only, by construction: the wasm module has no contact solver, and a
// dish scene is contact-active by definition (see contactsBakePolicy in
// ./index.js — the policy's answer for contacts is the JS integrator).

import { ParticleSystem } from '../../particles.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './index.js';
import { createDishSession, enrolDishBody, armDish, dishEnrolRadius } from '../../dishContacts.mjs';
import { isOrganismMode } from '../../../data/layout-modes.js';

/**
 * Bake several swarm strata together, with cross-strata contacts.
 *
 * @param {object} opts
 * @param {Array<{key:string, seed:number, seedOffsets?:object, count:number,
 *   layoutParams:object, activeAssets:Array, palette:object,
 *   steps?:number, maxParticles?:number}>} opts.layers — stratum order.
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @param {number} [opts.steps=180] — default step count per layer; a
 *   layer's own `steps` overrides it (layers finish independently, the
 *   dish pass simply stops involving them once done).
 * @param {number} [opts.dt=BAKE_DT_MS]
 * @param {{x:number,y:number}|null} [opts.attractor=null]
 * @returns {Map<string, Array>} layer key → baked items (getItems shape).
 */
export function bakeDishParticles({ layers, canvasW, canvasH, steps = 180, dt = BAKE_DT_MS, attractor = null }) {
  const session = createDishSession();
  const keys = [];
  const units = layers.map((layer) => {
    const sys = new ParticleSystem();
    sys.init(layer.count, canvasW, canvasH, layer.activeAssets, layer.palette,
      layer.seed, layer.seedOffsets ?? null, { graze: layer.layoutParams.graze || 0 });
    const params = {
      ...layer.layoutParams,
      particleCount: layer.count,
      maxParticles: layer.maxParticles ?? layer.count,
      dishSession: session,
    };
    enrolDishBody(session, {
      key: layer.key,
      sys,
      // #1409 — the per-Look DISH switch gates enrolment here exactly as
      // it does in the live resolver (dishEnrolRadius): OFF bakes the
      // ghost stack, bit-identical to stepping the strata alone.
      radius: dishEnrolRadius(layer.layoutParams),
      restitution: layer.layoutParams.contactRestitution ?? 0.5,
      contactMode: layer.layoutParams.contactMode || 'none',
      umask: layer.layoutParams.collideMask ?? 0xffffffff,
      organism: isOrganismMode(layer.layoutParams.mode),
      // #1413 — the stratum's medium, enrolled exactly as the live
      // resolver enrols it (see liveResolve.mjs): a wet bake settles
      // like the wet live dish, never a drier fiction.
      wetness: layer.layoutParams.accumulationWetness,
    });
    keys.push(layer.key);
    return { layer, sys, params, steps: layer.steps ?? steps };
  });

  const maxSteps = Math.max(0, ...units.map((u) => u.steps));
  for (let s = 0; s < maxSteps; s++) {
    armDish(session, keys);
    for (const u of units) {
      if (s >= u.steps) continue;
      u.sys.update(u.params, u.layer.activeAssets, u.layer.palette,
        u.layer.seed, BAKE_TIME_ORIGIN + s * dt, attractor, u.layer.seedOffsets ?? null);
    }
  }

  const out = new Map();
  for (const u of units) out.set(u.layer.key, u.sys.getItems(u.layer.activeAssets));
  return out;
}
