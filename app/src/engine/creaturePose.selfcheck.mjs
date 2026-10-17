// node src/engine/creaturePose.selfcheck.mjs
// Phase 2 S5 — band poses, hysteresis consumed (not re-implemented), and the wither-and-recover clip.
// The pose is a pure function of the band reader's filtered outputs; the reader (curator/stress.js) is
// driven directly wherever a band sequence matters, so these cases prove the CONSUMER honours the one
// place hysteresis lives (#1636) instead of growing a second one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createStressTracker, BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN,
} from '../curator/stress.js';
import {
  creaturePose, POSE_PARAMS, FLOURISH_FLAP_DEG, FLOURISH_PERIOD_FRAMES,
} from './creaturePose.js';
import { createCreatureBuilder, MOTH } from './creature.js';
import { fnv1a } from './skeleton.js';
import { ASSETS } from '../data/assets/index.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1. Endpoints are EXACT: deep in a band, one weight is 1 and the parameters are that pose's own numbers.
{
  const w = creaturePose({ band: BAND_TIGHTEN, stress: 1, frame: 0 });
  assert.deepEqual(w.weights, { open: 0, neutral: 0, withered: 1, flourish: 0 });
  assert.equal(w.name, 'withered');
  assert.equal(w.foreDirDeg, POSE_PARAMS.withered.foreDirDeg);
  assert.equal(w.hindDirDeg, POSE_PARAMS.withered.hindDirDeg);
  assert.equal(w.bodyScale, 0.93);
  assert.equal(w.wingScale, 0.88);
  assert.equal(w.chainCurlDeg, 10);
  assert.equal(w.dim, 0.5, 'the wither leads with the material: the dim is its deepest cut');

  const n = creaturePose({ band: BAND_NORMAL, stress: 0.5, frame: 0 });
  assert.deepEqual(n.weights, { open: 0, neutral: 1, withered: 0, flourish: 0 });
  assert.equal(n.name, 'neutral');
  assert.deepEqual(
    [n.foreDirDeg, n.hindDirDeg, n.bodyScale, n.wingScale, n.chainCurlDeg, n.dim],
    [0, 0, 1, 1, 0, 1],
    'neutral is the identity pose, exactly — a band at rest changes nothing',
  );

  const o = creaturePose({ band: BAND_RELAX, stress: 0.2, frame: 0 });
  assert.deepEqual(o.weights, { open: 1, neutral: 0, withered: 0, flourish: 0 });
  assert.equal(o.name, 'open');
  assert.equal(o.foreDirDeg, POSE_PARAMS.open.foreDirDeg);
  assert.equal(o.dim, 1);

  const f = creaturePose({ band: BAND_RELAX, stress: 0, frame: 0 });
  assert.deepEqual(f.weights, { open: 0, neutral: 0, withered: 0, flourish: 1 });
  assert.equal(f.name, 'flourish');
  assert.equal(f.foreDirDeg, POSE_PARAMS.flourish.foreDirDeg, 'frame 0: the sway starts at centre');
  assert.equal(f.chainCurlDeg, -4);

  // mid-blends land where the easing says: half open at the Relax edge, half withered at the Tighten edge
  const halfOpen = creaturePose({ band: BAND_NORMAL, stress: 0.28, frame: 0 });
  assert.ok(near(halfOpen.weights.open, 0.5, 1e-9), `half open at the edge (got ${halfOpen.weights.open})`);
  assert.ok(near(halfOpen.foreDirDeg, 5, 1e-9));
  const halfWither = creaturePose({ band: BAND_NORMAL, stress: 0.72, frame: 0 });
  assert.ok(near(halfWither.weights.withered, 0.5, 1e-9));
  assert.ok(near(halfWither.dim, 0.75, 1e-9), 'the material is already dimming halfway across the edge');
  const halfFlourish = creaturePose({ band: BAND_RELAX, stress: 0.11, frame: 0 });
  assert.ok(near(halfFlourish.weights.flourish, 0.5, 1e-9) && near(halfFlourish.weights.open, 0.5, 1e-9));
  assert.ok(near(halfFlourish.foreDirDeg, 15, 1e-9), 'half open, half flourish');
}

// 2. Blending is sane everywhere: weights are a partition, transitions are monotone, nothing jumps.
{
  for (const band of [BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN]) {
    let prevWither = -1;
    let prevOpen = 2;
    let prevFore = null;
    for (let s = 0; s <= 1.0001; s += 0.0005) {
      const p = creaturePose({ band, stress: Math.min(1, s), frame: 0 });
      const sum = p.weights.open + p.weights.neutral + p.weights.withered + p.weights.flourish;
      assert.ok(near(sum, 1, 1e-9), `weights partition at s=${s} (${sum})`);
      for (const wgt of Object.values(p.weights)) assert.ok(wgt >= 0 && wgt <= 1, 'weights stay in [0,1]');
      assert.ok(p.weights.withered >= prevWither - 1e-12, 'the wither only deepens as stress rises');
      assert.ok(p.weights.open + p.weights.flourish <= prevOpen + 1e-12, 'the opening only closes as stress rises');
      prevWither = p.weights.withered;
      prevOpen = p.weights.open + p.weights.flourish;
      if (prevFore !== null) assert.ok(Math.abs(p.foreDirDeg - prevFore) < 0.15, `no jumps in the blend at s=${s}`);
      prevFore = p.foreDirDeg;
      assert.ok(p.dim >= 0.5 && p.dim <= 1, 'the dim stays in its range');
    }
  }
}

// 3. The flourish: gated on the reader's band (hysteresis can hold it off), swaying on the frame index only.
{
  const deep = { band: BAND_RELAX, stress: 0 };
  assert.equal(creaturePose({ ...deep, frame: 0 }).foreDirDeg, 20);
  assert.ok(near(creaturePose({ ...deep, frame: FLOURISH_PERIOD_FRAMES / 4 }).foreDirDeg, 20 + FLOURISH_FLAP_DEG), 'quarter period: full swing out');
  assert.ok(near(creaturePose({ ...deep, frame: FLOURISH_PERIOD_FRAMES / 4 }).hindDirDeg, 12 - FLOURISH_FLAP_DEG * 0.7), 'the hind pair sways in counterphase');
  assert.ok(near(creaturePose({ ...deep, frame: FLOURISH_PERIOD_FRAMES / 2 }).foreDirDeg, 20), 'half period: back through centre');
  assert.ok(near(creaturePose({ ...deep, frame: (3 * FLOURISH_PERIOD_FRAMES) / 4 }).foreDirDeg, 20 - FLOURISH_FLAP_DEG), 'three quarters: full swing the other way');
  assert.ok(near(
    creaturePose({ ...deep, frame: FLOURISH_PERIOD_FRAMES }).foreDirDeg,
    creaturePose({ ...deep, frame: 0 }).foreDirDeg,
  ), 'the sway is periodic in the frame index');
  // the same depth of stress with the band held at Normal (hysteresis holding): no flourish, no sway at all
  const held = creaturePose({ band: BAND_NORMAL, stress: 0, frame: FLOURISH_PERIOD_FRAMES / 4 });
  assert.equal(held.weights.flourish, 0);
  assert.equal(held.foreDirDeg, creaturePose({ band: BAND_NORMAL, stress: 0, frame: 0 }).foreDirDeg, 'frame-free outside the flourish');
  // and outside the flourish nothing anywhere depends on the frame
  assert.deepEqual(
    creaturePose({ band: BAND_TIGHTEN, stress: 0.95, frame: 0 }),
    creaturePose({ band: BAND_TIGHTEN, stress: 0.95, frame: 37 }),
    'a withered pose is the same at any frame: the frame only phases the flourish',
  );
}

// 4. Hygiene: no band (or junk) is no pose — the builder's pre-S5 behaviour.
{
  assert.equal(creaturePose(), null);
  assert.equal(creaturePose({}), null);
  assert.equal(creaturePose({ band: 'bogus', stress: 0.5, frame: 0 }), null);
  assert.equal(creaturePose({ band: BAND_RELAX }), null, 'a band with no stress value is not a pose');
  assert.equal(creaturePose({ band: BAND_RELAX, stress: NaN, frame: 0 }), null);
  assert.equal(creaturePose({ band: null, stress: 0.5, frame: 0 }), null);
  const junkFrame = creaturePose({ band: BAND_RELAX, stress: 0, frame: 'soon' });
  assert.equal(junkFrame.foreDirDeg, 20, 'a junk frame reads as frame 0');
}

// 5. One place: the pose module carries NO band edges of its own — it imports the reader's. (Source scan,
//    comments stripped, in the determinism guard's pattern.)
{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'creaturePose.js'), 'utf8');
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock.split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  assert.ok(!/0\.28|0\.72/.test(code), 'no band-edge literals in the pose module: the edges live in stress.js');
  assert.ok(/RELAX_BELOW/.test(code) && /TIGHTEN_ABOVE/.test(code) && /from '\.\.\/curator\/stress\.js'/.test(code), 'the edges are imported from the band reader');
  assert.ok(!/bandFor|createStressTracker/.test(code), 'the pose never computes a band');
  for (const banned of ['Math.random', 'Date.now', 'performance.now']) {
    assert.ok(!code.includes(banned), `creaturePose.js must not use ${banned} — frame index and reader outputs only`);
  }
}

// 6. Hysteresis, consumed: the REAL reader driven slowly through each edge in both directions produces
//    exactly one band transition per crossing (#1636's done-case), and a signal parked oscillating at an
//    edge holds its band — and the posture on top of it does not strobe.
{
  const all = (v) => ({ activity: v, dish: v, taste: v }); // weights sum to 1: the stress IS v
  const transitions = (tracker, values) => {
    const out = [];
    for (const v of values) {
      for (const e of tracker.update(all(v)).events) if (e.type === 'band') out.push(e.band);
    }
    return out;
  };
  // a slow sweep, hysteresis isolated (no smoothing): up through Tighten, back, down through Relax, back
  const t = createStressTracker({ smoothFrames: 1, hysteresis: 0.04 });
  const ramp = (a, b, step) => { const vs = []; for (let v = a; step > 0 ? v <= b : v >= b; v += step) vs.push(v); return vs; };
  const seen = [
    ...transitions(t, [0.6]),
    ...transitions(t, ramp(0.601, 0.85, 0.001)),
    ...transitions(t, ramp(0.849, 0.15, -0.001)),
    ...transitions(t, ramp(0.151, 0.4, 0.001)),
  ];
  assert.deepEqual(seen, [BAND_NORMAL, BAND_TIGHTEN, BAND_NORMAL, BAND_RELAX, BAND_NORMAL],
    'one transition per crossing, each way, at both edges — never two, never a flicker back');

  // parked oscillating ±0.01 around the Tighten edge: the band holds, and so does the posture
  const parked = createStressTracker();
  for (let i = 0; i < 30; i++) parked.update(all(0.5));
  assert.equal(parked.band, BAND_NORMAL);
  let bandEvents = 0;
  for (let i = 0; i < 120; i++) { // settle INTO the park first: the smoothed value climbs to the edge and stays
    bandEvents += parked.update(all(i % 2 === 0 ? 0.71 : 0.73)).events.filter((e) => e.type === 'band').length;
  }
  assert.equal(parked.band, BAND_NORMAL, 'even settling onto the edge does not flip the band');
  let minFore = Infinity;
  let maxFore = -Infinity;
  for (let i = 0; i < 480; i++) {
    const r = parked.update(all(i % 2 === 0 ? 0.71 : 0.73));
    bandEvents += r.events.filter((e) => e.type === 'band').length;
    const p = creaturePose({ band: r.band, stress: r.smoothed, frame: i });
    minFore = Math.min(minFore, p.foreDirDeg);
    maxFore = Math.max(maxFore, p.foreDirDeg);
  }
  assert.equal(bandEvents, 0, 'parked at the edge, the band never flips');
  assert.equal(parked.band, BAND_NORMAL);
  assert.ok(maxFore - minFore < 0.5, `the parked posture breathes by ${maxFore - minFore}°, it does not strobe`);

  // parked around the Relax edge from the Relax side: holds Relax
  const parkedLow = createStressTracker();
  for (let i = 0; i < 30; i++) parkedLow.update(all(0.15));
  assert.equal(parkedLow.band, BAND_RELAX);
  let lowEvents = 0;
  for (let i = 0; i < 600; i++) {
    lowEvents += parkedLow.update(all(i % 2 === 0 ? 0.27 : 0.29)).events.filter((e) => e.type === 'band').length;
  }
  assert.equal(lowEvents, 0, 'parked at the Relax edge, the band holds');
  assert.equal(parkedLow.band, BAND_RELAX);
}

// 7. The builder seam: bandless input is byte-identical to S1 (hash pin), an identity band changes nothing,
//    and a real band bends the skeleton through the pose — scales, curl, and the published pose.
{
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const input = (over = {}) => ({
    dishPins: [{ x: 500, y: 350 }], dishFormed: [true], seed: 77, seedOffsets: null, loopTimeMs: 0, assetAttach: {}, ...over,
  });
  const grow = (over) => {
    const b = createCreatureBuilder();
    let e;
    for (let i = 0; i < MOTH.growFrames + 1; i++) { e = entry(); b.append(input(over), e, ASSETS); }
    return { b, e };
  };

  const S1_WORLD_HASH = '7944cd55'; // S1's recorded builder hash for this fixture (kc-s1-build STAGING-REPORT)
  const plain = grow({ wantSkeletons: true });
  assert.equal(plain.b.lastSkeletons()[0].hash, S1_WORLD_HASH, 'no band on the input: the skeleton is S1’s, bit for bit');
  assert.deepEqual(plain.b.lastPoses(), [null], 'and no pose is published');
  // 58, not the 26 this check was staged against: S3's feather fan replaced the scatter moth (26 → 58
  // items) before S5 published. S5 itself adds and removes no items — the count is S3's census; the
  // identity this section guards is the bandless skeleton hash above, still S1's bit for bit.
  assert.equal(plain.e[0].items.filter((it) => it._creature).length, 58, 'the drawn moth is unchanged');

  const neutral = grow({ wantSkeletons: true, band: BAND_NORMAL, smoothed: 0.5 });
  assert.equal(neutral.b.lastSkeletons()[0].hash, S1_WORLD_HASH, 'a neutral band applies the identity pose: still S1’s frame');
  assert.equal(neutral.b.lastPoses()[0].name, 'neutral');

  const flourish = grow({ wantSkeletons: true, band: BAND_RELAX, smoothed: 0.04 });
  const flourish2 = grow({ wantSkeletons: true, band: BAND_RELAX, smoothed: 0.04 });
  assert.equal(flourish.b.lastPoses()[0].name, 'flourish');
  assert.equal(flourish.b.lastPoses()[0].weights.flourish, 1);
  assert.notEqual(flourish.b.lastSkeletons()[0].hash, S1_WORLD_HASH, 'deep Relax opens the frame');
  assert.equal(flourish.b.lastSkeletons()[0].hash, flourish2.b.lastSkeletons()[0].hash, 'and does so deterministically');

  const withered = grow({ wantSkeletons: true, band: BAND_TIGHTEN, smoothed: 0.95 });
  const wp = withered.b.lastPoses()[0];
  assert.equal(wp.name, 'withered');
  assert.equal(wp.dim, 0.5, 'the published pose carries the material dim for S4');
  const foreLen = (skel) => skel.bones.filter((bn) => bn.chain === 'fore').reduce((a, bn) => a + bn.length, 0);
  const ratio = foreLen(withered.b.lastSkeletons()[0]) / foreLen(plain.b.lastSkeletons()[0]);
  assert.ok(near(ratio, 0.88, 1e-9), `withered chains thin to the pose’s wing scale (ratio ${ratio})`);
  const localAngle = (skel, id) => skel.bones.find((bn) => bn.id === id).localAngleDeg;
  // The curl lands per segment at exactly the pose's degrees. The sign flips across the mirror (the left
  // chain is built in negated angle space, the right is its mirror) — the pair curls symmetrically.
  for (const [seg, want] of [['fore/L/1', -10], ['fore/L/2', -10], ['fore/R/1', 10], ['fore/R/2', 10]]) {
    const d = localAngle(withered.b.lastSkeletons()[0], seg) - localAngle(plain.b.lastSkeletons()[0], seg);
    assert.ok(near(d, want, 1e-6), `${seg} curls by the pose’s per-segment curl (got ${d})`);
  }

  // poses publish even when nobody asked for bones: the pose is cheap arithmetic, the skeleton is the cost
  const poseless = grow({ band: BAND_TIGHTEN, smoothed: 0.95 });
  assert.deepEqual(poseless.b.lastSkeletons(), [null], 'no skeleton without a consumer');
  assert.equal(poseless.b.lastPoses()[0].name, 'withered', 'but the frame’s pose is published');
}

// 8. The clip: 8 seconds (480 frames at 60) of wither-and-recover, driven through the REAL reader (default
//    smoothing + hysteresis) and the REAL builder. The frame-sequence hash is the byte-identity proxy for
//    the plan's desktop/iPad clip: the sequence is a pure function of the scripted signals, so any two
//    machines running it produce this hash — what remains for hardware is rendering it, not re-deriving it.
{
  const all = (v) => ({ activity: v, dish: v, taste: v });
  const script = (f) => {
    if (f < 120) return 0.5;
    if (f < 240) return 0.5 + 0.45 * ((f - 120) / 120);
    if (f < 360) return 0.95;
    return 0.95 - 0.45 * ((f - 360) / 120);
  };
  const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222'] };
  const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
  const tracker = createStressTracker();
  const b = createCreatureBuilder();
  const bandEvents = [];
  const names = [];
  const hashes = [];
  let chain = 0;
  for (let f = 0; f < 480; f++) {
    const r = tracker.update(all(script(f)));
    for (const e of r.events) if (e.type === 'band') bandEvents.push(e.band);
    b.append({
      dishPins: [{ x: 500, y: 350 }], dishFormed: [true], seed: 77, seedOffsets: null, loopTimeMs: 0,
      assetAttach: {}, wantSkeletons: true, band: r.band, smoothed: r.smoothed,
    }, entry(), ASSETS);
    const skel = b.lastSkeletons()[0];
    const name = b.lastPoses()[0].name;
    names.push(name);
    hashes.push(skel.hash);
    chain = fnv1a(`${chain}:${skel.hash}:${name}`);
  }
  assert.deepEqual(bandEvents, [BAND_NORMAL, BAND_TIGHTEN, BAND_NORMAL],
    'the whole clip crosses into Tighten once and back once — hysteresis holds the ramps clean');
  assert.ok(names.slice(60, 120).every((n) => n === 'neutral'), 'the clip opens at rest');
  assert.ok(names.slice(300, 360).every((n) => n === 'withered'), 'the hold is fully withered');
  assert.ok(names.slice(440, 480).every((n) => n === 'neutral'), 'and it recovers to rest');
  for (let k = 0; k < 20; k++) {
    assert.equal(hashes[460 + k], hashes[100 + k], `frame ${460 + k} is frame ${100 + k} again: the recover is exact, not approximate`);
  }
  // Pinned 2026-10-16 from the first verified run: every structural assertion above (band crossings,
  // pose plateaus, exact recovery) passed on the sequence this hash summarizes before it was pinned.
  const CLIP_HASH = chain.toString(16).padStart(8, '0');
  assert.equal(CLIP_HASH, '4c71aad3', `the clip's frame-sequence hash (got ${CLIP_HASH})`);
}

console.log('creaturePose.selfcheck: OK (endpoints, blending, flourish, hygiene, one-place edges, hysteresis consumed, builder seam, clip)');
