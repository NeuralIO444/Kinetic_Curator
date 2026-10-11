// node src/gl/liveResolve.determinism.selfcheck.mjs
// #1353 step 1 — the determinism harness. The Phase 1 plan (docs/design/dish-spine-plan.md) rests on one claim:
// the live frame-builder, createLiveResolver().resolveLayers(input), is a pure function of its input SEQUENCE. Same
// inputs in, same frame out, on any fresh resolver, in any process. If that holds, a performance is just the recorded
// inputs. This selfcheck is that claim, pinned: every scenario is run on two fresh resolvers and in a second process,
// and every frame's full output must be identical.
//
// It is not vacuous: each scenario must MOVE (the frames differ from each other), and a one-field change in the
// input must change the output. What is covered: every placement family, multi-layer scenes with snapshots, the
// FIELD / FEED / MOD patches between layers, the shared scent (mold), the living-motion floor (kineme), FX and
// PATTERN layers, an attractor that comes and goes, mid-run seed / count / mode changes, uneven frame times, and
// the governor's inputs (quality, perf tier, slow render, asset thinning).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';

const FRAMES = 90;
/** Uneven frame times, like a real loop under load (the live loop clamps to 8..50 ms). */
const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 48, particleCount: 48, ...over });
const snap = (seed, over = {}) => ({ seed, paletteId: 'bone', paletteOverrides: null, layoutParams: lp(over), caGrid: null, enabledAssets: null });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], layoutParams: lp({ mode: 'random' }), caGrid: null,
  enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {},
  batchPaused: false, focusSwap: false, loopTimeMs: 0, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false,
  assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100],
  phraseWrapGen: 0, attractor: null, ...over,
});

/** Canonical encoding of anything the resolver returns: sorted keys, typed arrays as lists, no functions. */
function canon(v, depth = 0) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '-0' : String(v)) : `#${String(v)}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'function') return 'fn';
  if (depth > 12) return '…';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v).map((x) => canon(x, depth + 1)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, depth + 1)).join(',')}]`;
  if (v instanceof Map) return canon([...v.entries()], depth + 1);
  if (v instanceof Set) return canon([...v.values()], depth + 1);
  return `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k], depth + 1)}`).join(',')}}`;
}
const frameHash = (out) => createHash('sha256').update(canon(out)).digest('hex').slice(0, 20);

/** Run one scenario on a fresh resolver; returns the per-frame hashes. */
function run(scenario) {
  const r = createLiveResolver();
  const hashes = [];
  let t = 0;
  for (let f = 0; f < FRAMES; f++) {
    const dt = DT_MS[f % DT_MS.length];
    t += dt;
    hashes.push(frameHash(r.resolveLayers(baseInput({ ...scenario.at(f), loopTimeMs: t, dtSec: dt / 1000 }))));
  }
  if (typeof r.dispose === 'function') r.dispose();
  return hashes;
}

const breathe = (f) => ({ effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)], effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100] });
const single = (mode, over = {}) => ({
  name: `single:${mode}`,
  at: (f) => ({
    layoutParams: lp({ mode, ...over, count: 48 + (f > 40 ? 12 : 0) }),
    seed: f > 65 ? 99 : 1234,
    attractor: f % 20 < 10 ? { x: 400, y: 300, strength: 1 } : null,
    ...breathe(f),
  }),
});
const twoLayer = (name, patch, aOver = {}, bOver = {}) => ({
  name,
  at: (f) => ({
    layers: [L('lyr-a'), L('lyr-b', patch ? { patch } : {})],
    activeLayerId: 'lyr-a',
    layoutParams: lp({ mode: 'swarm', behave: 'scatter', ...aOver }),
    layerSnapshots: { 'lyr-b': snap(999, { mode: 'random', count: 30, ...bOver }) },
    ...breathe(f),
  }),
});

const SCENARIOS = [
  ...['random', 'grid', 'fibonacci', 'phyllotaxis', 'truchet', 'radial', 'swarm', 'flow', 'layers', 'rails',
    'voronoi', 'lsystem', 'dla', 'eden', 'orbit', 'abacus', 'noise', 'hype', 'murmuration', 'brush', 'stratified',
    'poisson', 'gaussian', 'circlepack'].map((m) => single(m)),
  twoLayer('patch:none', null),
  twoLayer('patch:field', { mode: 'field', to: 'lyr-a', strength: 1.5 }),
  twoLayer('patch:feed', { mode: 'feed', to: 'lyr-a', strength: 1 }),
  twoLayer('patch:mod', { mode: 'mod', to: 'lyr-a', strength: 1 }),
  {
    name: 'shared-scent:mold',
    at: (f) => ({
      layers: [L('lyr-m1'), L('lyr-m2')], activeLayerId: 'lyr-m1',
      layoutParams: lp({ mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }),
      layerSnapshots: { 'lyr-m1': snap(101, { mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }), 'lyr-m2': snap(202, { mode: 'hype', behave: 'mold', count: 16, particleCount: 16 }) },
      ...breathe(f),
    }),
  },
  {
    name: 'fx+pattern',
    at: (f) => ({
      layers: [L('lyr-a'), L('lyr-fx', { type: 'fx' }), L('lyr-p', { type: 'pattern', pattern: defaultPattern('QUILT', 7) })],
      layoutParams: lp({ mode: 'grid', kinemeBreath: 0.6, kinemeDrift: 0.8 }),
      ...breathe(f),
    }),
  },
  {
    // #1183 — a layer leaning on a DRIFTING pattern below it: the colour follows the ground, deterministically
    name: 'ground-lean',
    at: (f) => ({
      layers: [L('lyr-p', { type: 'pattern', pattern: { ...defaultPattern('FIELD', 9), drift: 1 } }), L('lyr-a')],
      layoutParams: lp({ mode: 'grid', groundLean: f < 20 ? 0 : 0.7 }),
      ...breathe(f),
    }),
  },
  {
    name: 'mode-change',
    at: (f) => ({ layoutParams: lp({ mode: f < 30 ? 'grid' : f < 60 ? 'swarm' : 'poisson' }), ...breathe(f) }),
  },
  {
    name: 'governor-inputs',
    at: (f) => ({
      // 300 nodes is over the 'performance' tier's cap (180), so the tier change really sheds
      layoutParams: lp({ mode: 'flow', count: 300 }),
      quality: f < 30 ? 'balanced' : 'performance', perfTier1: f > 45, slowRender: f > 70 && f < 80, assetThin: f > 60,
      ...breathe(f),
    }),
  },
  {
    name: 'sub-seeds+reduced-motion',
    at: (f) => ({
      layoutParams: lp({ mode: 'gaussian' }), reducedMotion: f > 50,
      seedOffsets: { spatial: f > 30 ? 4 : 0, color: f > 60 ? 2 : 0, asset: 0, noise: 1 },
      ...breathe(f),
    }),
  },
];

function digests() {
  const out = {};
  for (const s of SCENARIOS) out[s.name] = createHash('sha256').update(run(s).join('')).digest('hex').slice(0, 16);
  return out;
}

// child mode: print the digests and stop (the parent compares across processes)
if (process.env.KC_DET_CHILD === '1') {
  process.stdout.write(`KCDET${JSON.stringify(digests())}\n`);
  process.exit(0);
}

let checked = 0;
const mine = {};
for (const s of SCENARIOS) {
  const a = run(s);
  const b = run(s);
  const first = a.findIndex((h, i) => h !== b[i]);
  assert.equal(first, -1, `${s.name}: two fresh resolvers diverge at frame ${first}`);
  // not vacuous: the scenario has to actually move
  assert.ok(new Set(a).size > FRAMES / 3, `${s.name}: only ${new Set(a).size} distinct frames of ${FRAMES} — the scenario is not exercising motion`);
  mine[s.name] = createHash('sha256').update(a.join('')).digest('hex').slice(0, 16);
  checked += 1;
}
console.log(`liveResolve.determinism: ${checked} scenarios x ${FRAMES} frames identical on two fresh resolvers`);

// the governor scenario really sheds: the same scene held at one tier is a different run
{
  const held = run({ name: 'governor-held', at: (f) => ({ layoutParams: lp({ mode: 'flow', count: 300 }), ...breathe(f) }) });
  assert.notEqual(createHash('sha256').update(held.join('')).digest('hex').slice(0, 16), mine['governor-inputs'],
    'changing the quality tier changes the frames (a tier name that does not exist would silently do nothing)');
}

// the patch scenarios really exercise the patches: each one differs from the unpatched pair
for (const p of ['patch:field', 'patch:feed', 'patch:mod']) {
  assert.notEqual(mine[p], mine['patch:none'], `${p} changes the frames (the patch path is exercised)`);
}

// sensitivity: one changed input changes the output (so a constant hash cannot pass)
{
  const base = single('grid');
  const a = run(base);
  for (const [label, mut] of [
    ['seed', (f) => ({ ...base.at(f), seed: 4321 })],
    ['count', (f) => ({ ...base.at(f), layoutParams: lp({ mode: 'grid', count: 49 }) })],
    ['palette', (f) => ({ ...base.at(f), paletteId: 'hydra' })],
    ['scale range', (f) => ({ ...base.at(f), effectiveScale: [0.5, 1.6] })],
  ]) {
    const b = run({ name: 'mut', at: mut });
    assert.ok(a.some((h, i) => h !== b[i]), `changing the ${label} changes the frame`);
  }
  // and frame TIME is an input: the same scene on a different clock is a different performance
  const r = createLiveResolver();
  const slow = [];
  let t = 0;
  for (let f = 0; f < FRAMES; f++) { t += 33.3; slow.push(frameHash(r.resolveLayers(baseInput({ ...single('swarm').at(f), loopTimeMs: t, dtSec: 0.0333 })))); }
  assert.ok(run(single('swarm')).some((h, i) => h !== slow[i]), 'frame time is part of the input (recorded per frame, decision 1)');
  console.log('liveResolve.determinism: sensitive to seed, count, palette, scale range and frame time');
}

// across processes: a second and third process must produce the same digests as this one
{
  const self = fileURLToPath(import.meta.url);
  const child = () => {
    const txt = execFileSync(process.execPath, [self], { env: { ...process.env, KC_DET_CHILD: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = txt.split('\n').find((l) => l.startsWith('KCDET'));
    assert.ok(line, 'child printed its digests');
    return JSON.parse(line.slice(5));
  };
  assert.deepEqual(child(), mine, 'a second process reproduces every scenario');
  assert.deepEqual(child(), mine, 'and a third');
  console.log(`liveResolve.determinism: ${Object.keys(mine).length} scenarios reproduce across processes`);
}

console.log('liveResolve.determinism.selfcheck: ok (#1353 step 1)');
