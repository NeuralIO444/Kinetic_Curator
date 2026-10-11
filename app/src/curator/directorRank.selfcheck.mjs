// directorRank.selfcheck.mjs — M1 (the rank bias) wired through rankLois's optional chooser (#1139 wiring, PR 4).
// Without a chooser rankLois is today's argmax, bit for bit. The sway gate opened on 2026-10-08, so the live Director now
// hands out a chooser when the room allows one and 8 keeps count; the closed case stays proven with `open: false`.
// No live override exists.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { rankLois } from './loisRank.js';
import { makeRankChooser, createDirector } from './director.js';
import { rankBiases, keptCentroid, M1_BIAS, M1_PROXIMITY, MIN_KEEPS } from './queenLean.mjs';
import { extractFeatures } from './taste.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// a seeded rng: the same pools every run
let seed = 20261008;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cand = () => ({
  count: 30 + Math.floor(rnd() * 570), scale: [0.1 + rnd(), 1.2 + rnd() * 1.5], rotate: [-rnd() * 180, rnd() * 180], alpha: [10 + rnd() * 40, 50 + rnd() * 50],
  jitter: rnd() * 150, displacement: rnd() * 150, density: 20 + rnd() * 100, zTiers: 1 + Math.floor(rnd() * 9), noiseSpeed: 0.1 + rnd() * 1.9,
  noiseFreq: 0.002 + rnd() * 0.013, swarmCohesion: 0.2 + rnd() * 3.8, gravityWells: 0.1 + rnd() * 2.9, particleCount: 50 + rnd() * 250, damping: 0.9 + rnd() * 0.08,
  wind: rnd() * 3, breath: rnd(), lifeDrift: rnd(), flap: rnd(),
});
const pool = (k) => Array.from({ length: k }, cand);
const keep = (layout, i) => ({ id: `k${i}`, seed: i, config: { layout, palette: { id: 'praystation' } } });
const keepsLike = (layout, k) => Array.from({ length: k }, (_, i) => keep({ ...layout, count: layout.count + i }, i));
const withPattern = (k, i) => ({ ...k, id: `p${i}`, stack: { l: [{ id: 'kc1', type: 'content' }, { id: 'pt', type: 'pattern' }], a: 'kc1' } });
// the argmax rankLois has always done: the first of equals wins
const firstMax = (scores) => scores.reduce((best, s, i) => (s > scores[best] ? i : best), 0);

ok('no chooser: rankLois is the argmax it always was, over 300 seeded pools, ties included (first of equals wins)', () => {
  for (let t = 0; t < 300; t++) {
    const c = pool(2 + (t % 9));
    if (t % 5 === 0) c.push({ ...c[0] }, { ...c[1] }); // exact ties
    let seen = null;
    const probe = rankLois(c, (scores) => { seen = scores; return -1; }); // a bad answer: falls back to the argmax
    const plain = rankLois(c); const nul = rankLois(c, null);
    assert.equal(plain.index, firstMax(seen), `pool ${t}`);
    assert.deepEqual(nul, plain); assert.deepEqual(probe, plain);
  }
  assert.deepEqual(rankLois([]), { index: -1, verdict: '', parts: null });
});

ok('a chooser picks the index it is given, and the verdict and parts describe THAT candidate, not the argmax', () => {
  for (let t = 0; t < 60; t++) {
    const c = pool(6); let seen = null;
    rankLois(c, (s) => { seen = s; return 0; });
    const r = rankLois(c, () => 3);
    assert.equal(r.index, 3); assert.equal(r.parts.score, seen[3]);
  }
});

ok('a chooser that throws, or answers junk, is no chooser: the argmax stands', () => {
  const c = pool(7); const base = rankLois(c);
  for (const bad of [() => { throw new Error('x'); }, () => NaN, () => 99, () => -2, () => 1.5, () => 'a', () => null, () => undefined]) assert.deepEqual(rankLois(c, bad), base);
});

ok('gate open (live): the Director hands out a chooser only when the room allows one and 8 keeps count; `open: false` is always null', () => {
  const layout = cand();
  const d = createDirector({ now: () => 1000 });
  assert.equal(d.rankChooser(), null, 'before any tick the allowance is 0');
  d.setPullInputs({ keeps: keepsLike(layout, 20), bands: { bass: 1, mid: 0, treble: 0.2, rms: 1 }, enabled: true, sourceType: 'device' });
  d.tick({ feed: { burning: true, rollsLastMinute: 5, keepsLast5m: 3 }, audio: 1, nowTs: 1000 });
  assert.equal(typeof d.rankChooser(), 'function', 'a room with an allowance, 20 keeps');
  const few = createDirector({ now: () => 1000 });
  few.setPullInputs({ keeps: keepsLike(layout, MIN_KEEPS - 1) });
  few.tick({ feed: { burning: true, rollsLastMinute: 5, keepsLast5m: 3 }, audio: 1, nowTs: 1000 });
  assert.equal(few.rankChooser(), null, '7 keeps: none');
  assert.equal(makeRankChooser({ keeps: keepsLike(layout, 20), allowance: 0.9, open: false }), null, 'a closed gate is always null');
  assert.equal(typeof makeRankChooser({ keeps: keepsLike(layout, 20), allowance: 0.9 }), 'function', 'the builder defaults to the live gate: open');
});

ok('no chooser under MIN_KEEPS (7 keeps), at zero allowance, or without a centroid; pattern keeps do not count', () => {
  const layout = cand();
  assert.equal(makeRankChooser({ keeps: keepsLike(layout, MIN_KEEPS - 1), allowance: 0.9, open: true }), null);
  assert.equal(makeRankChooser({ keeps: keepsLike(layout, 12), allowance: 0, open: true }), null);
  assert.equal(makeRankChooser({ keeps: [], allowance: 0.9, open: true }), null);
  assert.equal(makeRankChooser({ keeps: 'junk', allowance: 0.9, open: true }), null);
  assert.equal(makeRankChooser({ keeps: [...keepsLike(layout, 7), ...keepsLike(layout, 9).map(withPattern)], allowance: 0.9, open: true }), null, '16 keeps, 7 count');
  assert.equal(typeof makeRankChooser({ keeps: [...keepsLike(layout, 11), ...keepsLike(layout, 9).map(withPattern)], allowance: 0.9, open: true }), 'function', '11 count');
});

ok('open path, harness only: it only ever promotes by ONE adjacent swap inside the top 3, only toward a candidate near the keeps, and never demotes', () => {
  const layout = cand(); const keeps = keepsLike(layout, 12);
  const centroid = keptCentroid(keeps);
  let moved = 0;
  for (let t = 0; t < 400; t++) {
    const c = pool(3 + (t % 6)); const chooser = makeRankChooser({ keeps, allowance: 1, open: true });
    let seen = null;
    const r = rankLois(c, (s, cs) => { seen = s; return chooser(s, cs); });
    const order = seen.map((_, i) => i).sort((a, b) => (seen[b] - seen[a]) || (a - b));
    assert.ok(r.index === order[0] || r.index === order[1], `pool ${t}: chosen ${r.index} is the argmax or the runner-up`);
    if (r.index !== order[0]) {
      moved += 1;
      const bias = rankBiases(c, centroid);
      assert.ok(bias[r.index] > 0, 'the promoted candidate is one near the keeps (proximity >= ' + M1_PROXIMITY + ')');
      assert.ok(seen[order[0]] - seen[r.index] < M1_BIAS + 1e-12, 'and it was within the bias of the top: nothing outrageous is promoted');
    }
  }
  assert.ok(moved > 0, 'the open path does something (it is not a no-op)');
});

ok('the allowance scales the bias: a quarter allowance promotes no more often than full, and zero never does', () => {
  const layout = cand(); const keeps = keepsLike(layout, 12); let full = 0; let quarter = 0;
  for (let t = 0; t < 400; t++) {
    const c = pool(5); const base = rankLois(c).index;
    if (rankLois(c, makeRankChooser({ keeps, allowance: 1, open: true })).index !== base) full += 1;
    if (rankLois(c, makeRankChooser({ keeps, allowance: 0.25, open: true })).index !== base) quarter += 1;
  }
  assert.ok(quarter <= full, `quarter ${quarter} <= full ${full}`);
});

ok('both pick sites pass the Director\'s chooser, and the picker names nothing of the pull', () => {
  const taste = readFileSync(new URL('./taste.js', import.meta.url), 'utf8');
  assert.equal((taste.match(/rankLois\(candidates, getDirector\(\)\.rankChooser\(\)\)/g) || []).length, 2, 'LOIS persona pick and the blend');
  assert.ok(!/rankLois\(candidates\)/.test(taste), 'no pick site bypasses the Director');
  for (const id of ['queenLean', 'queenChannel', 'swayBiases', 'rankBiases', 'applyRankBias']) assert.ok(!taste.includes(id), `taste.js must not name ${id}`);
});

// ── tilt (#1144): explore runs the same instrument in reverse. The gate is shut: these prove the mechanic, not the feel ──
ok('tilt 0 is exactly M1: the same choices over 300 seeded pools', () => {
  const layout = cand(); const keeps = keepsLike(layout, 12);
  for (let t = 0; t < 300; t++) {
    const c = pool(3 + (t % 6)); let seen = null;
    const m1 = makeRankChooser({ keeps, allowance: 0.7, open: true });
    const withZero = makeRankChooser({ keeps, allowance: 0.7, tilt: 0, open: true });
    const a = rankLois(c, (s, cs) => { seen = s; return m1(s, cs); }); const b = rankLois(c, withZero);
    assert.equal(b.index, a.index, `pool ${t}`); assert.ok(seen);
  }
});

ok('tilt open (harness only): promotes ONLY candidates that are not near the keeps, by one adjacent swap inside the top 3, within its margin, never at random', () => {
  const layout = cand(); const keeps = keepsLike(layout, 12); const centroid = keptCentroid(keeps);
  let moved = 0;
  for (let t = 0; t < 400; t++) {
    const c = pool(3 + (t % 6)); const chooser = makeRankChooser({ keeps, allowance: 1, tilt: 0.04, open: true });
    let seen = null;
    const r = rankLois(c, (s, cs) => { seen = s; return chooser(s, cs); });
    const again = rankLois(c, makeRankChooser({ keeps, allowance: 1, tilt: 0.04, open: true }));
    assert.equal(again.index, r.index, 'no randomness: the same pool, the same answer');
    const order = seen.map((_, i) => i).sort((a, b) => (seen[b] - seen[a]) || (a - b));
    assert.ok(r.index === order[0] || r.index === order[1], `pool ${t}: the argmax or the runner-up`);
    if (r.index !== order[0]) {
      moved += 1;
      assert.equal(rankBiases(c, centroid)[r.index], 0, 'the promoted candidate is NOT near the keeps');
      assert.ok(seen[order[0]] - seen[r.index] < 0.04 + 1e-12, 'and it was within the tilt of the top');
    }
  }
  assert.ok(moved > 0, 'it does something');
});

ok('tilt is clamped to 0.05, junk is no tilt, it needs 8 counting keeps and an open pull, and a zero allowance can still tilt', () => {
  const layout = cand(); const keeps = keepsLike(layout, 12);
  assert.equal(makeRankChooser({ keeps: keepsLike(layout, MIN_KEEPS - 1), tilt: 0.04, open: true }), null);
  assert.equal(makeRankChooser({ keeps, tilt: 0.04, open: false }), null);
  assert.equal(makeRankChooser({ keeps, allowance: 0, tilt: 0, open: true }), null, 'nothing asked for: none');
  assert.equal(typeof makeRankChooser({ keeps, allowance: 0, tilt: 0.03, open: true }), 'function');
  for (const bad of [NaN, -1, 'x', null, undefined]) assert.equal(makeRankChooser({ keeps, allowance: 0, tilt: bad, open: true }), null, `${bad}`);
  let wild = 0; const huge = makeRankChooser({ keeps, allowance: 0, tilt: 99, open: true }); const capped = makeRankChooser({ keeps, allowance: 0, tilt: 0.05, open: true });
  for (let t = 0; t < 200; t++) { const c = pool(5); const sc = c.map((_, i) => i); if (huge(sc, c) !== capped(sc, c)) wild += 1; }
  assert.equal(wild, 0, 'a huge tilt behaves as 0.05');
});

ok('live: the tilt gate is an open constant, the Director feeds the room\'s tilt (and nothing else) into the chooser, and a Director that has never ticked tilts nothing', () => {
  const src = readFileSync(new URL('./director.js', import.meta.url), 'utf8');
  assert.match(src, /export const TILT_GATE_OPEN = true;/);
  assert.match(src, /lastTilt = base\.tiltLimit;/);
  assert.match(src, /tilt: lastTilt/);
  assert.equal(createDirector({ now: () => 1000 }).rankChooser(), null);
});

console.log(`directorRank.selfcheck: ${n} checks passed`);
