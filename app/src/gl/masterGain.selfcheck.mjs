// #1478 — the master gain ceiling: DEPTH / SCALE / ALPHA reach 2, the defaults do not move, FEEL's VIOLENT uses the
// headroom, AUTO sets the gain from how quiet the signal was, and nothing the artist set higher is lowered.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { FEEL_PRESETS, activeFeelId } from '../data/feels.js';
import {
  masterGainFor,
  loudestPeak,
  MASTER_DEFAULTS,
  MASTER_MAX,
  GAIN_MAX_FACTOR,
  GAIN_TARGET_PEAK,
  ENERGY_FLOOR,
} from './stimuliAuto.mjs';
import { audioRoutes, DEFAULT_ROUTES } from './audioRoutes.mjs';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const KEYS = ['audioModDepth', 'audioScaleMod', 'audioAlphaMod'];
const snap = (peak) => ({ beat: 0, level: peak, bass: 0, mid: 0, treble: 0, bands: {} });

ok('the three masters accept up to 2 and clamp there; below 0 clamps to 0', () => {
  for (const k of KEYS) {
    assert.equal(normalizeLayoutParams({ [k]: 1.7 })[k], 1.7, `${k} 1.7 survives (it used to clamp to 1)`);
    assert.equal(normalizeLayoutParams({ [k]: 2 })[k], 2);
    assert.equal(normalizeLayoutParams({ [k]: 9 })[k], 2, `${k} clamps at 2`);
    assert.equal(normalizeLayoutParams({ [k]: -1 })[k], 0);
  }
});

ok('the defaults did not move: an old session is exactly what it was', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.audioModDepth, 0.65);
  assert.equal(DEFAULT_LAYOUT_PARAMS.audioScaleMod, 0.45);
  assert.equal(DEFAULT_LAYOUT_PARAMS.audioAlphaMod, 0.25);
  assert.deepEqual(MASTER_DEFAULTS, { audioModDepth: 0.65, audioScaleMod: 0.45, audioAlphaMod: 0.25 });
  assert.equal(MASTER_MAX, 2);
  // a saved project at the old maximum loads unchanged
  const old = normalizeLayoutParams({ audioModDepth: 1, audioScaleMod: 1, audioAlphaMod: 1 });
  assert.deepEqual(
    KEYS.map((k) => old[k]),
    [1, 1, 1],
  );
});

ok('FEEL: GENTLE and PUNCHY are as they were; VIOLENT uses the new headroom and stays inside it', () => {
  const by = Object.fromEntries(FEEL_PRESETS.map((f) => [f.id, f.params]));
  assert.deepEqual([by.gentle.audioModDepth, by.gentle.audioScaleMod, by.gentle.audioAlphaMod], [0.35, 0.3, 0.12]);
  assert.deepEqual([by.punchy.audioModDepth, by.punchy.audioScaleMod, by.punchy.audioAlphaMod], [0.65, 0.45, 0.25]);
  const v = by.violent;
  assert.ok(v.audioModDepth > 1 && v.audioScaleMod > 0.95 && v.audioAlphaMod > 0.65, 'more than before');
  for (const k of KEYS) assert.ok(v[k] <= MASTER_MAX && v[k] >= by.punchy[k], `${k} in range and above PUNCHY`);
  // every feel survives normalisation byte for byte (it is a legal set of values)
  for (const f of FEEL_PRESETS) {
    const n2 = normalizeLayoutParams(f.params);
    for (const k of KEYS) assert.equal(n2[k], f.params[k], `${f.id}.${k}`);
    assert.equal(activeFeelId({ ...DEFAULT_LAYOUT_PARAMS, ...f.params }), f.id, `${f.id} is recognised`);
  }
});

ok('more master gain really is more animation: the same quiet signal moves further', () => {
  const quiet = { rms: 0.2, bass: 0.25, mid: 0.1, treble: 0.1, beatPulse: 0.3 };
  const at = (g) => audioRoutes(quiet, { depth: g, scaleMod: g, alphaMod: g }, null, null);
  const lo = at(0.65);
  const hi = at(1.3);
  assert.ok(hi.scaleMul > lo.scaleMul && hi.alphaBoost > lo.alphaBoost, 'twice the gain, more swing');
  assert.ok(hi.scaleMul <= 3 + 1e-9, 'the per-target output clamp still holds: no blow-out');
  assert.ok(DEFAULT_ROUTES.length > 0);
});

ok('AUTO: a quiet signal gets more gain, a hot one leaves the defaults, silence changes nothing', () => {
  const cur = { audioModDepth: 0.65, audioScaleMod: 0.45, audioAlphaMod: 0.25 };
  assert.equal(masterGainFor(snap(0), cur), null, 'silence');
  assert.equal(masterGainFor(snap(ENERGY_FLOOR / 2), cur), null, 'under the floor');
  const hot = masterGainFor(snap(0.9), cur);
  assert.deepEqual(hot.patch, {}, 'a hot signal: the defaults already fill the range');
  assert.equal(hot.factor, 1);
  const quiet = masterGainFor(snap(0.2), cur);
  assert.equal(quiet.factor, GAIN_MAX_FACTOR, 'a very quiet one: the most');
  for (const k of KEYS) assert.equal(quiet.patch[k], Math.round(MASTER_DEFAULTS[k] * GAIN_MAX_FACTOR * 100) / 100, k);
  const mid = masterGainFor(snap(0.4), cur);
  assert.ok(mid.factor > 1 && mid.factor < GAIN_MAX_FACTOR);
  assert.ok(Math.abs(mid.factor - GAIN_TARGET_PEAK / 0.4) < 0.01);
});

ok('AUTO is monotone in how quiet it was, bounded, and never lowers what the artist set', () => {
  let prev = 0;
  for (const p of [0.9, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15, 0.08, ENERGY_FLOOR]) {
    const g = masterGainFor(snap(p), {});
    assert.ok(g.factor >= prev, `factor rises as the input gets quieter (${p})`);
    assert.ok(g.factor >= 1 && g.factor <= GAIN_MAX_FACTOR);
    for (const v of Object.values(g.patch)) assert.ok(v <= MASTER_MAX && v > 0);
    prev = g.factor;
  }
  const high = masterGainFor(snap(0.2), { audioModDepth: 1.8, audioScaleMod: 0.45, audioAlphaMod: 0.25 });
  assert.ok(!('audioModDepth' in high.patch), 'a DEPTH the artist set to 1.8 is left alone');
  assert.ok('audioScaleMod' in high.patch);
  const buried = masterGainFor(snap(0.7), { audioModDepth: 0.1, audioScaleMod: 0.45, audioAlphaMod: 0.25 });
  assert.deepEqual(
    buried.patch,
    { audioModDepth: 0.65 },
    'the old rule: a buried master returns to its default, nothing more',
  );
  const gentle = masterGainFor(snap(0.7), { audioModDepth: 0.35, audioScaleMod: 0.3, audioAlphaMod: 0.12 });
  assert.deepEqual(gentle.patch, {}, 'a GENTLE feel is not overridden by a hot signal');
});

ok('loudestPeak reads every route input, and the sliders and AUTO are wired to the new ceiling', () => {
  assert.equal(loudestPeak({ beat: 0.2, level: 0.1, bass: 0, mid: 0, treble: 0, bands: { sub: 0.55 } }), 0.55);
  const rc = src('../panels/stimulus/ReactivityControls.jsx');
  for (const l of ['DEPTH', 'SCALE', 'ALPHA'])
    assert.match(flat(rc), fre(new RegExp(`label="${l}" value=\\{\\w+\\} min=\\{0\\} max=\\{2\\} step=\\{0\\.05\\}`)));
  const mm = src('../panels/stimulus/ModMatrix.jsx');
  assert.match(flat(mm), fre(/masterGainFor\(peaks, \{ audioModDepth: lp\.audioModDepth/));
  assert.match(flat(mm), fre(/armMasters\(peaks\);/));
  assert.match(flat(src('../data/layout-modes.js')), fre(/audioModDepth: \{ min: 0, max: 2 \}/));
});

console.log(`masterGain.selfcheck: ${n} checks passed`);
