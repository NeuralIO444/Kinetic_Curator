// Layout mode position generators — thin re-exports + legacy signatures.
// Canonical samplers live in kernel/sample/registry.js (K2 #60).

import { getSampler, SAMPLERS } from '../kernel/sample/registry.js';

/** @deprecated Prefer getSampler(mode)(ctx) */
export function randomPos(w, h, rng) {
  return getSampler('random')({ i: 0, count: 1, w, h, rng, jitter: 0, seed: 1 });
}

function legacyWrap(id) {
  return (i, count, w, h, rng, jitterOrSeed, maybeGrid) => {
    const jitter = typeof jitterOrSeed === 'number' && id !== 'orbit' && id !== 'abacus'
      ? jitterOrSeed
      : 0;
    const seed = (id === 'orbit' || id === 'abacus') ? (jitterOrSeed || 0) : 0;
    return getSampler(id)({
      i,
      count,
      w,
      h,
      rng,
      jitter: id === 'orbit' || id === 'abacus' ? 0 : jitter,
      seed,
      caGrid: id === 'ca' ? maybeGrid : undefined,
    });
  };
}

export const gridPos = legacyWrap('grid');
export const fibPos = legacyWrap('fibonacci');
export const radialPos = legacyWrap('radial');
export const swarmPos = legacyWrap('swarm');
export const flowPos = legacyWrap('flow');
export const layerPos = legacyWrap('layers');
export const railsPos = legacyWrap('rails');
export const caPos = legacyWrap('ca');
export const orbitPos = legacyWrap('orbit');
export const abacusPos = legacyWrap('abacus');

/** Dispatch table — includes stratified power sampler */
export const MODE_FNS = {
  grid: gridPos,
  fibonacci: fibPos,
  radial: radialPos,
  swarm: swarmPos,
  flow: flowPos,
  layers: layerPos,
  rails: railsPos,
  ca: caPos,
  orbit: orbitPos,
  abacus: abacusPos,
  noise: gridPos,
  hype: swarmPos,
  stratified: legacyWrap('stratified'),
};

export { getSampler, SAMPLERS };
