// node src/gl/spinFollow.selfcheck.mjs
// ROTATE SPIN keeps time with the music: the pure follow (beat tempo x the Queen's mood lean, eased, clamped), the
// spin's own clock through the contract and the shader, and — on the real GPU — that only spin kinemes run on it and
// that a contract with no separate spin clock renders exactly as before. FOLLOW is off by default in this slice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  spinTarget, createSpinFollow, setSpinMood, getSpinMood, SPIN_FOLLOW_MODES, MOOD_LEAN, NOMINAL_BPM,
  SPIN_MUL_MIN, SPIN_MUL_MAX, SPIN_EASE_MS,
} from './spinFollow.mjs';
import { createKinemeClock } from '../data/kinemes.js';
import { buildSceneContract } from './sceneContract.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { emit, Events } from '../composition/eventBus.js';
import { startSpinMood } from '../curator/spinMoodLive.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { const r = fn(); n++; console.log(`  [ok] ${name}`); return r; };

ok('the target: off and no tempo are exactly 1; the beat scales it from 120; her mood leans it; clamped', () => {
  assert.deepEqual([...SPIN_FOLLOW_MODES], ['off', 'beat']);
  assert.equal(spinTarget({ follow: 'off', bpm: 180, mood: 'drive' }), 1, 'off: the dial is plain rev/s');
  assert.equal(spinTarget({}), 1);
  assert.equal(spinTarget({ follow: 'beat', bpm: NaN }), 1, 'no usable tempo: neutral');
  assert.equal(spinTarget({ follow: 'beat', bpm: NOMINAL_BPM }), 1, 'at 120 BPM the dial is exact');
  assert.equal(spinTarget({ follow: 'beat', bpm: 60 }), 0.5);
  assert.equal(spinTarget({ follow: 'beat', bpm: 180 }), 1.5);
  assert.equal(spinTarget({ follow: 'beat', bpm: 120, mood: 'drive' }), MOOD_LEAN.drive);
  assert.equal(spinTarget({ follow: 'beat', bpm: 120, mood: 'calm' }), MOOD_LEAN.calm);
  assert.equal(spinTarget({ follow: 'beat', bpm: 120, mood: 'not-a-mood' }), 1, 'an unknown mood is no lean');
  assert.equal(spinTarget({ follow: 'beat', bpm: 20 }), SPIN_MUL_MIN, 'a drone stays watchable');
  assert.equal(spinTarget({ follow: 'beat', bpm: 400, mood: 'drive' }), SPIN_MUL_MAX, 'and so does a burst');
  for (const m of Object.values(MOOD_LEAN)) assert.ok(m > 0.8 && m < 1.25, 'her lean is gentle');
});

ok('the glide: a change eases in over a few seconds, never jumps; a stalled frame cannot slam it', () => {
  const g = createSpinFollow();
  assert.equal(g.step(16, 1), 1);
  let v = g.step(16, 2);
  assert.ok(v > 1 && v < 1.01, 'one frame moves a hair');
  for (let t = 0; t < SPIN_EASE_MS; t += 16) v = g.step(16, 2);
  assert.ok(v > 1.55 && v < 1.75, `about 63% there after one time constant (${v.toFixed(2)})`);
  for (let t = 0; t < 12000; t += 16) v = g.step(16, 2);
  assert.ok(Math.abs(v - 2) < 0.01, 'and it arrives');
  const s = createSpinFollow();
  assert.ok(s.step(60000, 2) < 1.1, 'a 60 s stall counts as one clamped frame');
  assert.equal(createSpinFollow().step(NaN, NaN), 1, 'junk is neutral');
  g.reset(); assert.equal(g.step(0, 1), 1);
});

ok('the clock: a changing multiplier re-anchors, so the spin phase never jumps, and 1 is the kineme clock exactly', () => {
  const base = createKinemeClock(); const spin = createKinemeClock();
  for (let i = 0; i < 100; i++) assert.equal(spin.at(i / 10, 1.3 * 1), base.at(i / 10, 1.3), 'multiplier 1: identical');
  const c = createKinemeClock();
  const before = c.at(5, 1);
  const after = c.at(5, 2.5); // the rate changes at t=5: no jump at that instant
  assert.equal(before, after);
  assert.ok(c.at(6, 2.5) - after > 2.4, 'and from there it runs faster');
});

ok('the contract: spinTime rides only when it differs from kineme time, so every other contract and hash is unchanged', () => {
  const lp = { ...DEFAULT_LAYOUT_PARAMS, rotateSpin: 0.5 };
  const mark = { assetId: 'a', x: 500, y: 350, scale: 1, rotation: 0, color: '#e05030', accent: '#e05030', alpha: 100, key: 'm0' };
  const build = (extra) => buildSceneContract({
    doc: { seed: 1, quality: 'balanced', kinemeTime: 3, ...extra },
    resolvedLayers: [{ id: 'c', layer: { id: 'c', name: 'c' }, layoutParams: lp, palette: { swatches: ['#fff'], bg: '#fff' }, items: [mark], layerOpacity: 1, layerBlendMode: 'normal' }],
  });
  const same = build({}); const eq = build({ spinTime: 3 }); const diff = build({ spinTime: 7.5 });
  assert.ok(same.kinemes && same.kinemes.length, 'fixture: a spin kineme is in the table');
  assert.ok(!('spinTime' in same) && !('spinTime' in eq), 'absent when absent or equal');
  assert.equal(JSON.stringify(same), JSON.stringify(eq), 'byte-identical contract');
  assert.equal(diff.spinTime, 7.5);
  assert.equal(diff.kinemeTime, 3, 'kineme time itself is untouched');
});

ok('the param: spinFollow is off by default, an enum, and junk is the plain dial', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.spinFollow, 'off');
  assert.equal(normalizeLayoutParams({ spinFollow: 'beat' }).spinFollow, 'beat');
  assert.equal(normalizeLayoutParams({ spinFollow: 'wild' }).spinFollow, 'off');
  assert.equal(normalizeLayoutParams({}).spinFollow, 'off');
});

ok('the mood: her decisions set it (live or replayed), it clears on stop, and only the third\'s moods count', () => {
  const stop = startSpinMood();
  assert.equal(getSpinMood(), null);
  emit(Events.MIND_DECISION, { persona: 'queen', bar: 1, backend: 'rules', reply: { mood: 'drive', lean: {} } }, { cause: 'mind' });
  assert.equal(getSpinMood(), 'drive');
  emit(Events.MIND_DECISION, { persona: 'davis', bar: 2, backend: 'rules', reply: { propose: null, mood: 'calm' } });
  assert.equal(getSpinMood(), 'drive', 'another persona does not set it');
  emit(Events.MIND_DECISION, { persona: 'queen', bar: 3, backend: 'rules', reply: { mood: 'calm', lean: {} } }, { cause: 'replay' });
  assert.equal(getSpinMood(), 'calm', 'a replayed decision does');
  stop();
  assert.equal(getSpinMood(), null);
  setSpinMood(5); assert.equal(getSpinMood(), null, 'junk is no mood');
});

ok('wired: the shader runs only kind 1 on the spin clock; the renderer defaults it to the kineme clock; the loop feeds it', () => {
  const vs = src('./shaders.mjs');
  assert.match(vs, /uniform float u_spinTime;/);
  assert.match(vs, /fract\(\(kind == 1 \? u_spinTime : u_kinemeTime\) \/ per \+ a_inst4\.w\)/);
  const r = src('./renderer.mjs');
  assert.match(r, /spinTime = Number\.isFinite\(contract\.spinTime\) \? contract\.spinTime : kinemeTime;/, 'no separate clock: the kineme clock');
  assert.match(r, /gl\.uniform1f\(U\(quadProg, 'u_spinTime'\), spinTime\)/);
  const ll = src('./liveLoop.mjs');
  assert.match(ll, /spinTime: spinClock\.at\(loopTimeMs \/ 1000, kinemeRateNow \* spinMul\)/);
  assert.match(ll, /spinTarget\(\{ follow: layoutParams\.spinFollow, bpm: s\.beatBpm, mood: getSpinMood\(\) \}\)/);
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(src('./spinFollow.mjs').replace(/\/\/.*$/gm, '')), 'pure: loop dt only');
});

console.log('spinFollow node: ok');

// ── GPU: the real renderer ───────────────────────────────────────────────────────────────────────────────────────
// Two marks: one with a SPIN kineme (the layer's ROTATE SPIN) and one with a PULSE kineme. Moving only the spin clock
// must turn the first and leave the second byte-identical; a contract with spinTime equal to kinemeTime is the contract
// without one.
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { ASSETS } = await import('../data/assets/index.js');
  const W = 400; const H = 280;
  const pal = { swatches: ['#f2e6d0', '#d8c8a8', '#1b2a4a'], bg: '#f2e6d0' };
  const withSvg = ASSETS.filter((a) => a.id && a.svg);
  const spinAsset = withSvg[0]; const pulseAsset = withSvg[1];
  const mk = (asset, id, x) => ({ assetId: asset.id, x, y: 350, scale: 1.2, rotation: 0, color: '#e05030', accent: '#2030e0', alpha: 100, key: id });
  // left: no kineme of its own, so it takes the layer's ROTATE SPIN. right: its asset carries its own PULSE kineme.
  const scene = (extra) => buildSceneContract({
    doc: { seed: 1, quality: 'balanced', kinemeTime: 0.9, assetKineme: { [pulseAsset.id]: 'pulse' }, ...extra },
    resolvedLayers: [
      { id: 's', layer: { id: 's', name: 's' }, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, rotateSpin: 0.4 }, palette: pal, items: [mk(spinAsset, 'm0', 250)], layerOpacity: 1, layerBlendMode: 'normal' },
      { id: 'p', layer: { id: 'p', name: 'p' }, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, rotateSpin: 0 }, palette: pal, items: [mk(pulseAsset, 'm1', 750)], layerOpacity: 1, layerBlendMode: 'normal' },
    ],
  });
  const render = async (c) => (await renderViaGL(c, { width: W, height: H, bg: '#f2e6d0' })).pixels;
  const region = (buf, x0, x1) => { const out = []; for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; out.push(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]); } return Buffer.from(out); };
  try {
    const a = await render(scene({}));
    const b = await render(scene({ spinTime: 0.9 }));
    assert.equal(Buffer.compare(a, b), 0, 'spinTime equal to kineme time: byte-identical to no spin clock');
    const c = await render(scene({ spinTime: 2.1 }));
    assert.notEqual(Buffer.compare(region(a, 0, 200), region(c, 0, 200)), 0, 'the spinning mark turns when only the spin clock moves');
    assert.equal(Buffer.compare(region(a, 200, 400), region(c, 200, 400)), 0, 'a PULSE kineme stays on the kineme clock: untouched by the spin clock');
    const d = await render(scene({ kinemeTime: 1.3 }));
    assert.notEqual(Buffer.compare(region(a, 200, 400), region(d, 200, 400)), 0, 'control: the PULSE mark does change when the kineme clock moves');
    console.log('spinFollow GPU: ok — the spin clock turns spin kinemes only; equal clocks are byte-identical');
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) console.log('  [skip] browser spin tests: Playwright browser not installed');
  else throw e;
}
console.log(`spinFollow.selfcheck: ${n} checks passed`);
