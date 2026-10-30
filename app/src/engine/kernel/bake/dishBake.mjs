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
//
// #1841 (slice B of #1809): when the caller supplies a wet-frame
// service (the `wetFrame` option), the bake's dish reads the shared
// wet field through it, stepped per bake step (below) — the same
// service contract the live loop serves, so "how wet is it here"
// has one answer in the bake too. The service is the CALLER's: the
// kernel imports nothing from gl/ (the #1239 boundary, the #1310
// worker purity), so the driver takes the instance by injection
// and never creates or disposes it. Without one, the bake reads
// the enrolled knob scalars — the pre-#1841 bake, bit for bit.

import { ParticleSystem } from '../../particles.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './index.js';
import { createDishSession, enrolDishBody, armDish, dishEnrolRadius } from '../../dishContacts.mjs';
import { tickDishTrails } from '../../dishTrails.mjs'; // #1415 — the trail substrate ticks once per bake step (the law lives in the module)
import { clampWetness } from '../../dishMedium.mjs'; // #1841 — the bake field's wetness input, read honestly
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
 * @param {object} [opts.wetFrame=null] — #1841: a caller-owned
 *   wet-frame service (gl/wetFrame.mjs's createWetFrameService),
 *   injected: with it, the bake's dish reads the shared field and
 *   this driver serves it once per step; the caller disposes it.
 *   Absent: the knob bookkeeping, bit-identical to the pre-#1841 bake.
 * @returns {Map<string, Array>} layer key → baked items (getItems shape).
 */
export function bakeDishParticles({
  layers,
  canvasW,
  canvasH,
  steps = 180,
  dt = BAKE_DT_MS,
  attractor = null,
  wetFrame = null,
}) {
  const session = createDishSession();
  const keys = [];
  const units = layers.map((layer) => {
    const sys = new ParticleSystem();
    sys.init(layer.count, canvasW, canvasH, layer.activeAssets, layer.palette, layer.seed, layer.seedOffsets ?? null, {
      graze: layer.layoutParams.graze || 0,
    });
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
      // #1415 — the stratum's ACCUMULATION switch, enrolled exactly as
      // the live resolver enrols it: an accumulating stratum deposits
      // trails in the bake on the same terms as live.
      accum: !!layer.layoutParams.accumulation,
      // #1416 — the stratum's ecology MODE and its cap, enrolled
      // exactly as the live resolver enrols them (the same threaded
      // maxParticles the params below carry): an ecology bake breeds,
      // is gated, and thins on the same terms as the live dish.
      ecology: !!layer.layoutParams.ecology,
      cap: layer.maxParticles ?? layer.count,
    });
    keys.push(layer.key);
    return { layer, sys, params, steps: layer.steps ?? steps };
  });

  // #1841 (slice B of #1809) — with a caller-supplied service, the
  // bake's dish reads the shared wet field like the live dish does:
  // the injected service steps once per bake step, after every
  // unit's update, with the bodies as the stamp instances and the
  // contact presses the passes recorded. The sampler is attached
  // before the first update; it reads the standing field (dry until
  // the first served step), exactly the live interleave. Two honest
  // limits, named: the field's wetness input is the wettest enrolled
  // layer's knob (one field, one input — the live loop's store knob
  // is the same shape of answer), and its seed is the first layer's;
  // and the bake's stamps are the bodies only — the live field also
  // takes the non-dish marks' stamps, so a bake's field is the
  // dish's own weather, not a replay of a performance's. The dish's
  // wet LAW is one in both drivers; the fields are each run's own.
  if (wetFrame) session.wetSampler = (x, y) => wetFrame.sampleWet(x, y);
  const dishPresent = session.entries.some((e) => e.radius > 0);
  const bakeWetness = layers.reduce((m, l) => Math.max(m, clampWetness(l.layoutParams.accumulationWetness)), 0);
  const bakeSeed = layers.length ? layers[0].seed : 0;

  const maxSteps = Math.max(0, ...units.map((u) => u.steps));
  for (let s = 0; s < maxSteps; s++) {
    armDish(session, keys);
    for (const u of units) {
      if (s >= u.steps) continue;
      u.sys.update(
        u.params,
        u.layer.activeAssets,
        u.layer.palette,
        u.layer.seed,
        BAKE_TIME_ORIGIN + s * dt,
        attractor,
        u.layer.seedOffsets ?? null,
      );
    }
    // #1415 — the trail substrate ticks once per step, after every
    // unit's update, exactly as the live resolver ticks once per frame
    // after its layer loop: deposits read post-integration positions,
    // and a finished unit (skipped above) lays no phantom trail — the
    // tick's step-counter guard sees its frozen _step.
    tickDishTrails(session);
    // #1841 — serve the field for the next step's reads: the bodies
    // stamp it (post-integration positions, the live contract's
    // shape) and the step's contact presses land with them. No
    // service injected, or no dish enrolled: no request, no field
    // (and at wetness 0 the service answers 'off' and the field is
    // never born, so a dry bake reads dry throughout).
    if (wetFrame && dishPresent) {
      const instances = [];
      for (const u of units) {
        const sys = u.sys;
        for (let i = 0; i < sys.n; i++) {
          if (!sys.alive[i]) continue;
          instances.push({
            x: sys.x[i],
            y: sys.y[i],
            vx: sys.vx[i],
            vy: sys.vy[i],
            scale: sys.scale[i],
            layer: u.layer.key,
            key: i,
          });
        }
      }
      wetFrame.frame({
        consumers: { dish: true },
        shed: null,
        degradedOk: true,
        wetness: bakeWetness,
        freeze: false,
        seed: bakeSeed,
        width: canvasW,
        height: canvasH,
        instances,
        stamps: session.wetStamps.splice(0, session.wetStamps.length),
      });
    }
  }
  const out = new Map();
  for (const u of units) out.set(u.layer.key, u.sys.getItems(u.layer.activeAssets));
  return out;
}
