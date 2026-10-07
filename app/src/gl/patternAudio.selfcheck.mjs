// patternAudio.selfcheck.mjs — audio / MIDI-free MOD routing for PATTERN tracks (#1110).
//
// A route to pattern.* adds an offset to every pattern track's params, per frame, on the RESOLVED block.
// It must (1) move the pattern, (2) never reach the stored layer / a saved project, (3) leave the default
// table byte-for-byte as before, (4) run in the render WORKER, which used to ignore the route table.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { evaluateRoutes, audioRoutes, ROUTE_TARGETS, PATTERN_ROUTE_PARAMS } from './audioRoutes.mjs';
import { applyPatternAudio } from './patternAudio.mjs';
import { sanitizeAudioRoutes, NEW_ROUTE_DEPTH } from '../data/audioRoutes.js';
import { createLiveResolver } from './liveResolve.mjs';
import { buildSceneContract } from './sceneContract.js';
import { defaultPattern } from '../state/patternTrack.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const P = { depth: 1, scaleMod: 1, alphaMod: 1 };
const loud = { beatPulse: 1, bass: 1, rms: 1, mid: 1, treble: 1 };

ok('every pattern param is a route target with a start depth, a label and a clamp that fits its range', () => {
  const mm = readFileSync(new URL('../panels/stimulus/ModMatrix.jsx', import.meta.url), 'utf8');
  for (const k of PATTERN_ROUTE_PARAMS) {
    const t = `pattern.${k}`;
    assert.ok(ROUTE_TARGETS[t], `${t} is a target`);
    assert.ok(NEW_ROUTE_DEPTH[t] > 0 && NEW_ROUTE_DEPTH[t] <= ROUTE_TARGETS[t].clamp[1], `${t} starts inside its ceiling`);
    assert.ok(mm.includes(`'${t}': 'pattern ${k}'`), `${t} has a matrix label`);
  }
  assert.deepEqual([...PATTERN_ROUTE_PARAMS], ['drift', 'mix', 'hero', 'grout', 'density']);
  assert.ok(!('pattern.seed' in ROUTE_TARGETS) && !('pattern.drop' in ROUTE_TARGETS), 'the seed stays out; DROP is not routed');
});

ok('evaluateRoutes: a pattern route outputs an offset, silence is zero, loud is clamped, no route adds no key', () => {
  const t = [{ input: 'beat', target: 'pattern.drift', depth: 0.5 }, { input: 'bass', target: 'pattern.density', depth: 4 }];
  assert.deepEqual(evaluateRoutes({ beatPulse: 0, bass: 0 }, P, t).pattern, { drift: 0, density: 0 });
  const out = evaluateRoutes(loud, P, t).pattern;
  assert.ok(Math.abs(out.drift - 0.5) < 1e-9 && out.density === 4);
  assert.equal(evaluateRoutes({ beatPulse: 99 }, P, [{ input: 'beat', target: 'pattern.mix', depth: 1 }]).pattern.mix, 1, 'clamped to the target ceiling');
  assert.equal(evaluateRoutes({ beatPulse: 99 }, P, [{ input: 'beat', target: 'pattern.density', depth: 8 }]).pattern.density, 8);
  assert.equal('pattern' in evaluateRoutes(loud, P, [{ input: 'beat', target: 'render.hue', depth: 10 }]), false);
  assert.equal('pattern' in audioRoutes(loud, P, null), false, 'the default table has no pattern output');
  assert.equal(evaluateRoutes(loud, { depth: 0.5, scaleMod: 1, alphaMod: 1 }, [{ input: 'beat', target: 'pattern.drift', depth: 0.8 }]).pattern.drift, 0.4, 'master depth scales it');
});

ok('the route sanitizer keeps pattern routes and clamps their depth to the target ceiling', () => {
  const r = sanitizeAudioRoutes([{ input: 'beat', target: 'pattern.drift', depth: 5 }, { input: 'bass', target: 'pattern.density', depth: -50 }, { input: 'mid', target: 'pattern.seed', depth: 1 }]);
  assert.deepEqual(r, [{ input: 'beat', target: 'pattern.drift', depth: 1 }, { input: 'bass', target: 'pattern.density', depth: -8 }]);
});

const resolve = (pattern, over = {}) => {
  const rs = createLiveResolver();
  const out = rs.resolveLayers({
    layers: [{ id: 'kc', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: 1, pattern }],
    activeLayerId: 'kc', layerSnapshots: {}, seed: 1, paletteId: 'v01d', paletteOverrides: null, userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'scatter', count: 5 }, caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [],
    quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, loopTimeMs: 4000, perfClampOverride: null, perfTier1: false, assetThin: false,
    slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, ...over,
  });
  rs.dispose();
  return out;
};

ok('applyPatternAudio: adds the offsets to the resolved block, clamps to each range, never touches the stored block', () => {
  const stored = { ...defaultPattern('QUILT', 7), drift: 0.8, mix: 0.2, density: 11 };
  const frozen = JSON.stringify(stored);
  const out = resolve(stored);
  applyPatternAudio(out, { drift: 0.5, mix: -0.5, density: 3.4, hero: 0.1 });
  const pt = out.find((l) => l.id === 'pt');
  assert.equal(pt.pattern.drift, 1, 'clamped at 1'); assert.equal(pt.pattern.mix, 0, 'clamped at 0');
  assert.equal(pt.pattern.density, 12, 'clamped at the density ceiling'); assert.ok(Math.abs(pt.pattern.hero - (stored.hero + 0.1)) < 1e-9);
  assert.equal(pt.pattern.seed, 7, 'seed, mode and drop are not routed'); assert.equal(pt.pattern.mode, 'QUILT'); assert.equal(pt.pattern.drop, false);
  assert.equal(JSON.stringify(stored), frozen, 'the stored pattern is unchanged');
  assert.equal(JSON.stringify(pt.layer.pattern), frozen, 'and so is the layer the resolver points at');
  assert.ok(out.find((l) => l.id === 'kc').items.length > 0 && !out.find((l) => l.id === 'kc').pattern, 'KC tracks are untouched');
});

ok('applyPatternAudio: no output, zero, junk and a non-array change nothing; density rounds', () => {
  const stored = defaultPattern('GLYPH', 3);
  for (const off of [undefined, null, {}, { drift: 0 }, { drift: NaN }, { mix: Infinity }, { density: 'x' }]) {
    const out = resolve(stored); const before = JSON.stringify(out.find((l) => l.id === 'pt').pattern);
    const same = applyPatternAudio(out, off);
    assert.equal(same, out, 'the same array comes back'); assert.equal(JSON.stringify(out.find((l) => l.id === 'pt').pattern), before, JSON.stringify(off));
  }
  assert.equal(applyPatternAudio(null, { drift: 1 }), null);
  const out = resolve({ ...stored, density: 5 }); applyPatternAudio(out, { density: 2.6 });
  assert.equal(out.find((l) => l.id === 'pt').pattern.density, 8, '5 + 2.6 → 8 (an integer tile count)');
});

ok('a drift route wakes a STILL pattern: the contract gains t, so the picture moves; no route, no t', () => {
  const stored = defaultPattern('QUILT', 9); // drift 0
  const doc = (layers) => ({ seed: 1, quality: 'balanced', layers });
  const rawLayers = [{ id: 'kc', name: 'KC-1', type: 'content', visible: true }, { id: 'pt', name: 'PT-1', type: 'pattern', visible: true, pattern: stored }];
  const still = resolve(stored);
  const moving = resolve(stored); applyPatternAudio(moving, evaluateRoutes(loud, P, [{ input: 'beat', target: 'pattern.drift', depth: 0.6 }]).pattern);
  const cs = buildSceneContract({ doc: doc(rawLayers), resolvedLayers: still }).layers.find((l) => l.id === 'pt').pattern;
  const cm = buildSceneContract({ doc: doc(rawLayers), resolvedLayers: moving }).layers.find((l) => l.id === 'pt').pattern;
  assert.equal(cs.drift, 0); assert.ok(!('t' in cs), 'a still pattern keeps its still contract');
  assert.ok(Math.abs(cm.drift - 0.6) < 1e-9 && cm.t === 4, 'a routed one drifts, on the loop clock');
});

ok('both loops evaluate the route table: the render worker no longer ignores it', () => {
  const w = readFileSync(new URL('./renderWorker.js', import.meta.url), 'utf8');
  const m = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
  assert.match(w, /audioRoutes\(routeAudio, \{[^}]*\}, s\.audioRoutes, null\)/, 'worker evaluates the route table');
  assert.match(w, /applyPatternAudio\(resolved, routes\.pattern\);\s*\n\s*\n\s*\/\/ Scene contract/, 'worker: applied before the contract is built');
  assert.match(w, /applyHueAudio\(contract\.layers, routes\.hue \?\? 0\)/); assert.match(w, /applyLightAudio\(contract, routes\.sun \?\? 0\)/);
  assert.match(m, /applyPatternAudio\(resolved, routes\.pattern\)/, 'main loop applies it too');
  assert.ok(m.indexOf('applyPatternAudio(resolved') < m.indexOf('const contract = buildSceneContract'), 'main loop: before the contract');
  assert.match(w, /audioOn \? \(s\.audioBands\?\.rms/, 'audio off gates the inputs, as in liveLoop');
});

console.log(`patternAudio.selfcheck: ${n} checks passed`);
