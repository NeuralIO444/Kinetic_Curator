// davisSigil.selfcheck.mjs — Davis's face: a mandala from the seed, eight-fold, turning at his state's tempo (#1126).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { sigilGeometry, drawSigil, sigilTempo, SIGIL_FOLDS, SIGIL_TEMPO_S, SIGIL_RINGS } from './davisSigil.js';
import { DAVIS_STATES } from './davisState.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// a recording 2D context: no canvas needed to prove the structure
const rec = () => {
  const calls = []; const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 0 };
  for (const m of ['clearRect', 'save', 'restore', 'translate', 'rotate', 'beginPath', 'arc', 'fill', 'stroke']) ctx[m] = (...a) => calls.push([m, ...a]);
  return { ctx, calls };
};
const draw = (seed) => { const r = rec(); drawSigil(r.ctx, sigilGeometry(seed)); return r.calls; };

ok('a NEW SEED is a NEW FACE; the same seed is the same face', () => {
  assert.deepEqual(sigilGeometry(0x8bea), sigilGeometry(0x8bea));
  assert.notDeepEqual(sigilGeometry(1), sigilGeometry(2));
  assert.notDeepEqual(draw(7), draw(8));
  assert.deepEqual(draw(7), draw(7));
  for (const bad of [0, -1, 2 ** 40, NaN, undefined]) assert.ok(sigilGeometry(bad).els.length >= 24, `seed ${bad} still draws a face`);
});

ok('eight-fold: one wedge of 24..41 ornaments, stamped eight times with its mirror half', () => {
  assert.equal(SIGIL_FOLDS, 8);
  for (const seed of [1, 42, 31337, 0xdeadbeef]) {
    const g = sigilGeometry(seed);
    assert.ok(g.els.length >= 24 && g.els.length <= 41, `${g.els.length} ornaments`);
    for (const e of g.els) { assert.ok(e.a >= 0 && e.a < g.wedge, 'every ornament sits inside its wedge'); assert.ok(e.r >= 8 && e.r <= 40 && e.s >= 1 && e.o >= 0.25 && e.o <= 0.9); }
    const calls = draw(seed);
    const rotations = calls.filter((c) => c[0] === 'rotate'); assert.equal(rotations.length, SIGIL_FOLDS);
    rotations.forEach((c, k) => assert.ok(Math.abs(c[1] - (k * Math.PI * 2) / SIGIL_FOLDS) < 1e-12, `fold ${k} is ${k}/8 of a turn`));
    const rings = g.els.filter((e) => e.ring).length;
    const arcs = calls.filter((c) => c[0] === 'arc').length;
    assert.equal(arcs, SIGIL_RINGS.length + SIGIL_FOLDS * (g.els.length * 2 + rings) + 1, 'rings + 8 x (dot + mirror dot + any halo) + the centre');
  }
});

ok('drawn only from the seed: no Math.random, no clock, in the module or its component', () => {
  for (const f of ['./davisSigil.js', '../components/DavisSigil.jsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src), f);
  }
});

ok('tempo per state, from the mockup; no state means he is not turning', () => {
  assert.deepEqual({ ...SIGIL_TEMPO_S }, { FLOW: 14, SEEDLING: 6, UGLY: 4, STUCK: 40, BLOOM: 9 });
  assert.deepEqual(Object.keys(SIGIL_TEMPO_S).sort(), Object.keys(DAVIS_STATES).sort(), 'every Davis state has a tempo and nothing else does');
  assert.ok(SIGIL_TEMPO_S.UGLY < SIGIL_TEMPO_S.SEEDLING && SIGIL_TEMPO_S.SEEDLING < SIGIL_TEMPO_S.BLOOM && SIGIL_TEMPO_S.BLOOM < SIGIL_TEMPO_S.FLOW && SIGIL_TEMPO_S.FLOW < SIGIL_TEMPO_S.STUCK, 'agitated in UGLY, barely turning in STUCK');
  assert.equal(sigilTempo(null), null); assert.equal(sigilTempo(undefined), null); assert.equal(sigilTempo('NOPE'), null);
});

ok('wiring: a readout only, in his colour, still with less motion', () => {
  const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const duel = r('../panels/directors/DirectorsDuel.jsx');
  assert.match(duel, /resolveLoisFace\(feed\)/); assert.match(duel, /resolveDavisState\(feed\)/);
  assert.ok(!/emit\(|dispatch|useStore\.getState\(\)\.\w+\(|onClick/.test(duel.replace(/\/\/.*$/gm, '')), 'READOUT ONLY: nothing in the duel acts');
  assert.match(r('../panels/DavisPanel.jsx'), /<DirectorsDuel \/>/);
  const css = r('../styles/panels.css'); assert.match(css, /prefers-reduced-motion: reduce\) \{ \.davis-sigil\.turning \{ animation: none; \} \}/);
  assert.match(r('../styles/tokens.css'), /--kc-davis: #ffcd82;/);
});

console.log(`davisSigil.selfcheck: ${n} checks passed`);
