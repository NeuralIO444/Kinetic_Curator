/**
 * atlasKeyGuard.selfcheck.mjs — the Hold rule, made structural (#764). Node-only.
 *
 * The live atlas is keyed by the placed asset ids (+ FX layers), so anything
 * that changes WHICH assets appear mid-MIX rebakes it. Params that can do
 * that are registered in ATLAS_AFFECTING_PARAMS (data/layout-modes.js).
 *
 *  A. the registry only names real params.
 *  B. every ordered pair of flagship voices, swept through a MIX with the
 *     per-frame lerp the live loop uses (resolveLiveRenderState → mixVoiceState):
 *     the placed-asset set changes AT MOST once (the target-asset snap at
 *     t>0) — never during the blend. A lerped registered key that pulls a new
 *     asset id into the scene fails this loudly, naming the pair and t.
 *  C. negative test: a synthetic mix whose count lerps from 1 to 400 over an
 *     asset pool with a rare id IS caught, so the guard cannot go blind.
 */
import assert from 'node:assert';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, ATLAS_AFFECTING_PARAMS } from '../data/layout-modes.js';
import { FLAGSHIP_VOICES, resolveVoiceState, mixVoiceState } from '../data/voices.js';

// A
for (const k of ATLAS_AFFECTING_PARAMS) assert.ok(PARAM_SPEC[k], `registry key "${k}" is not a param`);

function input(params, assets) {
  return {
    layers: [{ id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, paletteId: 'bone', paletteOverrides: null,
    userPalettes: [], layoutParams: { ...DEFAULT_LAYOUT_PARAMS, ...params }, caGrid: null,
    enabledAssets: assets === 'all' ? null : assets, assetWeightOverrides: {}, customAssets: [],
    quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, loopTimeMs: 0,
    perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1,
    alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
  };
}
/** The atlas key's asset half: sorted distinct placed asset ids. */
function assetSet(resolver, params, assets) {
  const out = resolver.resolveLayers(input(params, assets)).find((l) => l.id === 'lyr-a');
  return [...new Set(out.items.map((it) => it.assetId))].sort().join(',');
}
/** How many times the asset set changes across t = 0..1, and the first t after the t=0 snap where it does. */
function sweep(from, to, steps = 40) {
  const resolver = createLiveResolver();
  const sets = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = mixVoiceState(from, to, t);
    sets.push([t, assetSet(resolver, m.params, m.assets)]);
  }
  // t=0 renders `from`; the target-asset snap lands on the first t>0 frame.
  const blend = sets.slice(1);
  const bad = blend.find(([, k]) => k !== blend[0][1]);
  return { sets, bad };
}

// B
const states = FLAGSHIP_VOICES.map((d) => [d.id, resolveVoiceState(d)]);
let pairs = 0;
for (const [ia, a] of states) {
  for (const [ib, b] of states) {
    if (ia === ib) continue;
    const { bad } = sweep(a, b);
    assert.ok(!bad, `MIX ${ia} → ${ib}: atlas asset set changed mid-blend at t=${bad?.[0]} (a lerped atlas-affecting param — step it or hold-then-bake, docs/PLENUM.md Hold)`);
    pairs++;
  }
}

// C: the guard can fail
const lo = { ...states[0][1], params: { ...states[0][1].params, mode: 'scatter', count: 1 }, assets: 'all' };
const hi = { ...lo, params: { ...lo.params, count: 400 } };
assert.ok(sweep(lo, hi).bad, 'guard must catch a count lerp that pulls new assets in mid-blend');

console.log(`atlasKeyGuard selfcheck: OK — ${pairs} flagship MIX pairs hold one atlas through the blend; negative test caught`);
