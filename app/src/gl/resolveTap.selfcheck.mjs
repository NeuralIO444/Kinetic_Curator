// node src/gl/resolveTap.selfcheck.mjs
// #1353 step 2 — the tap and the proof it exists for: inputs recorded at the tap, written to JSON text, read back
// and replayed through a FRESH resolver give the same frames as the live run. That is a performance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from './liveResolve.mjs';
import { setResolveTap, tapResolveInput, withResolveTap, requestResolverReset } from './resolveTap.mjs';
import { createInputLog, replayInputs } from '../engine/kernel/replay/inputLog.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';

// 1. the tap: silent with no listener, hands over the very object, and a throwing listener cannot break the frame
{
  assert.equal(setResolveTap(null), null);
  assert.doesNotThrow(() => tapResolveInput({ a: 1 }), 'no listener is a no-op');
  const seen = [];
  setResolveTap((i) => seen.push(i));
  const obj = { a: 1 };
  tapResolveInput(obj);
  assert.ok(seen.length === 1 && seen[0] === obj, 'the listener gets the same object the resolver gets');
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  setResolveTap(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => tapResolveInput({}), 'a throwing listener does not break the frame');
  assert.doesNotThrow(() => tapResolveInput({}));
  console.warn = warn;
  assert.equal(warned, 1, 'it is reported once and removed');
  assert.equal(setResolveTap(null), null, 'the broken listener was dropped');
}

// 2. the live loop is wired: its one resolver is built through the tap, which changes nothing but observability
{
  const src = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ withResolveTap \} from '\.\/resolveTap\.mjs';/);
  assert.match(src, /const resolver = withResolveTap\(createLiveResolver\);/, 'the loop\'s resolver is the tapped one');
  assert.equal((src.match(/createLiveResolver\b/g) || []).length, 2, 'one import, one use: one resolver, so one tap covers every frame');
  assert.equal((src.match(/resolver\.resolveLayers\(/g) || []).length, 1, 'one call site');
  assert.deepEqual((src.match(/resolver\.(\w+)/g) || []).sort(), ['resolver.dispose', 'resolver.resolveLayers'],
    'the loop uses exactly the two members the wrapper exposes');

  const calls = [];
  let built = 0;
  const make = () => { const id = ++built; return { resolveLayers: (i) => { calls.push([`resolve${id}`, i]); return `out${id}`; }, dispose: () => calls.push([`dispose${id}`]) }; };
  const tapped = withResolveTap(make);
  assert.equal(built, 1, 'the factory is called once up front');
  setResolveTap((i) => calls.push(['tap', i]));
  const input = { a: 1 };
  assert.equal(tapped.resolveLayers(input), 'out1', 'returns the resolver\'s result');
  assert.deepEqual(calls.map((c) => c[0]), ['tap', 'resolve1'], 'tap first, then the resolver');
  assert.ok(calls[0][1] === input && calls[1][1] === input, 'both get the same object');

  // a restart: the old resolver is disposed and a fresh one answers the NEXT frame, before the input is tapped
  calls.length = 0;
  requestResolverReset();
  assert.equal(built, 1, 'nothing happens until the next frame');
  assert.equal(tapped.resolveLayers(input), 'out2');
  assert.deepEqual(calls.map((c) => c[0]), ['dispose1', 'tap', 'resolve2'], 'dispose the old, then tap, then the fresh resolver');
  assert.equal(tapped.resolveLayers(input), 'out2', 'one request, one restart');
  assert.equal(built, 2);
  setResolveTap(null);
  calls.length = 0;
  tapped.dispose();
  assert.deepEqual(calls.map((c) => c[0]), ['dispose2'], 'dispose reaches the current resolver');
  assert.equal(withResolveTap(make).resolveLayers({}), 'out3', 'with no listener it is just the resolver');
  assert.throws(() => withResolveTap({ resolveLayers() {} }), /needs the resolver factory/);
}

// ── the equivalence proof ───────────────────────────────────────────────────────────────────────────────────────
function canon(v, d = 0) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '-0' : String(v)) : `#${String(v)}`;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'function') return 'fn';
  if (d > 12) return '…';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v).map((x) => canon(x, d + 1)).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x, d + 1)).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k], d + 1)}`).join(',')}}`;
}
const frameHash = (out) => createHash('sha256').update(canon(out)).digest('hex').slice(0, 20);

const FRAMES = 80;
const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 40, particleCount: 40, ...over });
const snap = (seed, over = {}) => ({ seed, paletteId: 'bone', paletteOverrides: null, layoutParams: lp(over), caGrid: null, enabledAssets: null });
const base = (over = {}) => ({
  layers: [L('lyr-a')], activeLayerId: 'lyr-a', layerSnapshots: {}, seed: 1234, seedOffsets: null, paletteId: 'bone',
  paletteOverrides: null, userPalettes: [], layoutParams: lp({ mode: 'random' }), caGrid: null, enabledAssets: null,
  assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false,
  perfClampOverride: null, perfTier1: false, assetThin: false, slowRender: false, scaleMul: 1, alphaBoost: 0,
  effectiveScale: [0.5, 1.5], effectiveScaleY: undefined, effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null, ...over,
});
const breathe = (f) => ({ effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)], effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100] });

/** Scenes as (frame) => partial input. `stable` scenes reuse the SAME objects between changes, like the real store. */
const SCENES = {
  'grid, fresh objects every frame': (f) => ({ layoutParams: lp({ mode: 'grid', count: 40 + (f > 40 ? 8 : 0) }), seed: f > 60 ? 9 : 1234, ...breathe(f) }),
  'swarm + attractor': (f) => ({ layoutParams: lp({ mode: 'swarm' }), attractor: f % 20 < 10 ? { x: 400, y: 300, strength: 1 } : null, ...breathe(f) }),
  'field patch': (f) => ({ layers: [L('lyr-a'), L('lyr-b', { patch: { mode: 'field', to: 'lyr-a', strength: 1.5 } })], layoutParams: lp({ mode: 'swarm', behave: 'scatter' }), layerSnapshots: { 'lyr-b': snap(999, { mode: 'random', count: 24 }) }, ...breathe(f) }),
  'feed patch': (f) => ({ layers: [L('lyr-a'), L('lyr-b', { patch: { mode: 'feed', to: 'lyr-a', strength: 1 } })], layoutParams: lp({ mode: 'swarm', behave: 'scatter' }), layerSnapshots: { 'lyr-b': snap(999, { mode: 'random', count: 24 }) }, ...breathe(f) }),
  'mod patch': (f) => ({ layers: [L('lyr-a'), L('lyr-b', { patch: { mode: 'mod', to: 'lyr-a', strength: 1 } })], layoutParams: lp({ mode: 'swarm', behave: 'scatter' }), layerSnapshots: { 'lyr-b': snap(999, { mode: 'random', count: 24 }) }, ...breathe(f) }),
  'mold, shared scent': (f) => ({ layers: [L('m1'), L('m2')], activeLayerId: 'm1', layoutParams: lp({ mode: 'hype', behave: 'mold', count: 14, particleCount: 14 }), layerSnapshots: { m1: snap(101, { mode: 'hype', behave: 'mold', count: 14, particleCount: 14 }), m2: snap(202, { mode: 'hype', behave: 'mold', count: 14, particleCount: 14 }) }, ...breathe(f) }),
  'fx + pattern': (f) => ({ layers: [L('lyr-a'), L('fx', { type: 'fx' }), L('p', { type: 'pattern', pattern: defaultPattern('QUILT', 7) })], layoutParams: lp({ mode: 'gaussian' }), ...breathe(f) }),
  'governor + mode change': (f) => ({ layoutParams: lp({ mode: f < 30 ? 'flow' : 'circlepack', count: 300 }), quality: f < 30 ? 'balanced' : 'performance', perfTier1: f > 45, slowRender: f > 65 && f < 72, assetThin: f > 55, ...breathe(f) }),
};
// the real store keeps objects stable between edits: build such a stream too
function stableScene() {
  const layers = [L('lyr-a'), L('lyr-b', { patch: { mode: 'field', to: 'lyr-a', strength: 1 } })];
  let params = lp({ mode: 'swarm', behave: 'scatter' });
  const snaps = { 'lyr-b': snap(999, { mode: 'poisson', count: 24 }) };
  const scale = [0.5, 1.5];
  return (f) => {
    if (f === 25) params = { ...params, count: 52 }; // one edit: a new object, once
    if (f === 50) params = { ...params }; // a new object with the same value (identity-only change)
    return { layers, layoutParams: params, layerSnapshots: snaps, effectiveScale: f < 40 ? scale : [0.5, 1.5 + 0.1 * Math.sin(f / 7)] };
  };
}

const STABLE_BASE = base();
let proven = 0;
const sizes = {}; // scene -> bytes per frame
for (const [name, at] of [...Object.entries(SCENES), ['stable identities, like the store', stableScene()]]) {
  // LIVE: a resolver driven through the tap, with a recorder listening (exactly what liveLoop does)
  const live = createLiveResolver();
  const log = createInputLog();
  setResolveTap((input) => log.record(input));
  const liveHashes = [];
  let t = 0;
  for (let f = 0; f < FRAMES; f++) {
    const dt = DT_MS[f % DT_MS.length];
    t += dt;
    // the store-like scene keeps EVERY untouched object stable, as the real store does
    const input = { ...(name.startsWith('stable') ? STABLE_BASE : base()), ...at(f), loopTimeMs: t, dtSec: dt / 1000 };
    tapResolveInput(input);
    liveHashes.push(frameHash(live.resolveLayers(input)));
  }
  setResolveTap(null);
  if (typeof live.dispose === 'function') live.dispose();

  // THE FILE: text only. Nothing but this string crosses to the replay side.
  const text = JSON.stringify(log.finish());
  sizes[name] = text.length / FRAMES;

  // REPLAY: a fresh resolver, fed only what the text says
  const fresh = createLiveResolver();
  let f = 0;
  for (const input of replayInputs(JSON.parse(text))) {
    assert.equal(frameHash(fresh.resolveLayers(input)), liveHashes[f], `${name}: replay differs from the live run at frame ${f}`);
    f += 1;
  }
  assert.equal(f, FRAMES, `${name}: every frame replayed`);
  if (typeof fresh.dispose === 'function') fresh.dispose();
  assert.ok(new Set(liveHashes).size > FRAMES / 3, `${name}: the scene moves`);
  proven += 1;
}
console.log(`resolveTap: ${proven} scenes x ${FRAMES} frames replay from text to the same frames as the live run`);

// 3. honest size, reported not hidden (step 3 sets the file format and the ceiling). The "fresh objects every frame"
//    scenes are the worst case: every key changes identity each frame. The real store keeps objects stable between
//    edits, which is the "stable identities" scene.
{
  const stable = sizes['stable identities, like the store'];
  const worst = Math.max(...Object.values(sizes));
  const kibPerMin = (b) => ((b * 3600) / 1024).toFixed(0);
  console.log(`  [info] recorded size, uncompressed: store-like stream ${stable.toFixed(0)} bytes/frame (~${kibPerMin(stable)} KiB/min at 60 fps); worst case ${worst.toFixed(0)} bytes/frame (~${kibPerMin(worst)} KiB/min)`);
  assert.ok(stable < worst, 'stable identities cost less than rebuilding every object');
  assert.ok(worst < 2000, 'even the worst case is deltas, not a full copy of the input every frame');
}

console.log('resolveTap.selfcheck: ok (#1353 step 2)');
