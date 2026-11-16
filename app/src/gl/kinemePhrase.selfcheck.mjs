// kinemePhrase.selfcheck.mjs — #2118 (Motion Core P6, step 2): kineme PHRASES — motion sequenced on the bar.
//
// Node: the records (caps, members, the id namespace) and the sanitizers; the pure resolver (bar -> step for staggered
// offsets, restart at bar 0); snap-to-beats; the envelope (continuity across the boundary for EVERY ordered pair of library
// singles); the tempo fold (a BPM change never jumps the cycle; a replay reproduces it); the contract (a phrase-less doc is
// identical with or without a musical view; slots, the fade pair, the over-budget fallback); the table entries + the
// shader's lines reproduce the CPU reference (a JS transcription of QUAD_VS's kineme block); the motion sources.
// Browser (when Playwright's browser is installed): a phrase-less scene is byte-identical with a musical view; a phrase mark
// moves with the musical position; nothing pops across a step boundary.
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import {
  KINEMES,
  KINEME_STACKS,
  KINEME_PHRASES,
  KINEME_KINDS,
  KINEME_TABLE_MAX,
  PHRASE_MAX_STEPS,
  PHRASE_MAX_STEP_BARS,
  PHRASE_MAX_BARS,
  getKineme,
  getKinemePhrase,
  getAssetKineme,
  kinemePhase,
  sanitizeAssetKineme,
} from '../data/kinemes.js';
import {
  PHRASE_BEATS_PER_BAR,
  STILL_MUSICAL,
  musicalView,
  beatsPerCycle,
  phraseOffsetBars,
  phraseStepAt,
  fadeWeight,
  resolvePhrase,
  phraseCycleAt,
  phrasePeriod,
  phrasePairFades,
  createPhraseClock,
} from '../data/kinemePhrases.js';
import { sanitizeRegionKinemes, sanitizeRegionKinemesDoc } from '../data/regionKinemes.js';
import { BEATS_PER_BAR, createMusicalClock } from './musicalClock.mjs';
import { bakeAtlas } from './atlas.mjs';
import { packInstanceData, INSTANCE_STRIDE } from './renderer.mjs';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { phrasePose, fadePose, kinemePose, phraseSourceId } from '../engine/motionCore/kinemeSources.js';
import { getMotionSource, POSE_IDENTITY } from '../engine/motionCore/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const fract = (x) => x - Math.floor(x);
const TAU = 6.28318530718;
/** A resolved phrase from [kinemeId, bars] pairs (the shape getKinemePhrase returns), for pairs no library phrase has. */
const mk = (...steps) => ({
  id: 'test',
  kind: 'phrase',
  steps: steps.map(([id, bars]) => ({ kineme: getKineme(id), bars })),
  totalBars: steps.reduce((s, [, b]) => s + b, 0),
});

// ── the records ───────────────────────────────────────────────────────
ok(
  'records: the three starter phrases, frozen, inside the caps, single members only, ids disjoint from singles and stacks',
  () => {
    assert.deepStrictEqual(
      KINEME_PHRASES.map((p) => [p.id, p.steps.map((s) => `${s.kineme}${s.bars}`).join(' ')]),
      [
        ['lookout', 'blink2 spin2'],
        ['tide', 'bob4 rock4'],
        ['signal', 'pulse2 blink2 spin4'],
      ],
    );
    const taken = new Set([...KINEMES, ...KINEME_STACKS].map((k) => k.id));
    for (const p of KINEME_PHRASES) {
      assert.ok(Object.isFrozen(p) && Object.isFrozen(p.steps) && p.steps.every(Object.isFrozen));
      assert.ok(!taken.has(p.id), `${p.id}: its own id`);
      taken.add(p.id);
      assert.ok(p.steps.length >= 1 && p.steps.length <= PHRASE_MAX_STEPS);
      let total = 0;
      for (const s of p.steps) {
        assert.ok(getKineme(s.kineme), `${p.id}: ${s.kineme} is a single library kineme (no stack, no nesting)`);
        assert.ok(Number.isInteger(s.bars) && s.bars >= 1 && s.bars <= PHRASE_MAX_STEP_BARS);
        total += s.bars;
      }
      assert.ok(total <= PHRASE_MAX_BARS);
      const r = getKinemePhrase(p.id);
      assert.ok(r.kind === 'phrase' && r.totalBars === total && Object.isFrozen(r));
      assert.strictEqual(r.steps[0].kineme, getKineme(p.steps[0].kineme));
      assert.strictEqual(getAssetKineme(p.id), r, 'single -> stack -> phrase');
      assert.strictEqual(getKineme(p.id), undefined, 'getKineme stays single-only');
    }
    assert.deepStrictEqual([PHRASE_MAX_STEPS, PHRASE_MAX_STEP_BARS, PHRASE_MAX_BARS], [8, 16, 64]);
    assert.strictEqual(PHRASE_BEATS_PER_BAR, BEATS_PER_BAR, "the musical clock's own bar");
  },
);

const FLORA = 'flora_flower_01';
const flora = ASSETS.find((a) => a.id === FLORA);
const PETALS = flora.regions.filter((r) => r.color === '000000').map((r) => r.id);
const NONE = Object.fromEntries(flora.regions.map((r) => [r.id, null]));

ok('documents: a phrase id survives the asset and region sanitizers; an unknown id is dropped', () => {
  assert.deepStrictEqual(sanitizeAssetKineme({ a: 'lookout', b: 'tide', c: 'signal', d: 'nope', e: 'tide+bob' }), {
    a: 'lookout',
    b: 'tide',
    c: 'signal',
  });
  assert.deepStrictEqual(
    sanitizeAssetKineme({ a: 'rock', b: 'rock+bob' }),
    { a: 'rock', b: 'rock+bob' },
    'old docs unchanged',
  );
  assert.deepStrictEqual(sanitizeRegionKinemes({ [PETALS[0]]: 'tide', [PETALS[1]]: 'nope' }, flora.regions), {
    [PETALS[0]]: 'tide',
  });
  assert.deepStrictEqual(
    sanitizeRegionKinemesDoc({ [FLORA]: { [PETALS[0]]: 'signal', [PETALS[1]]: null, x: 'nope' } }),
    {
      [FLORA]: { [PETALS[0]]: 'signal', [PETALS[1]]: null },
    },
  );
  // a JSON round trip changes nothing (ids are plain strings)
  const doc = { assetKineme: { a: 'lookout' }, regionKinemes: { [FLORA]: { [PETALS[0]]: 'tide' } } };
  const back = JSON.parse(JSON.stringify(doc));
  assert.deepStrictEqual(sanitizeAssetKineme(back.assetKineme), doc.assetKineme);
  assert.deepStrictEqual(sanitizeRegionKinemesDoc(back.regionKinemes), doc.regionKinemes);
});

// ── the resolver ──────────────────────────────────────────────────────
ok('resolution is pure: bar -> step, staggered by the seed phase in whole bars; a restart walks from bar 0', () => {
  const P = mk(['rock', 2], ['bob', 2]);
  const seq = (ph, bars = 8) => Array.from({ length: bars }, (_, bar) => phraseStepAt(P, bar, ph).index).join('');
  assert.deepStrictEqual(
    [0, 0.37, 0.999].map((ph) => phraseOffsetBars(P, ph)),
    [0, 1, 3],
  );
  assert.deepStrictEqual([seq(0), seq(0.37), seq(0.999)], ['00110011', '10011001', '01100110']);
  // pure: the same (phrase, bar, phase) always answers the same, in any order
  assert.deepStrictEqual(phraseStepAt(P, 5, 0.37), phraseStepAt(P, 5, 0.37));
  assert.deepStrictEqual(phraseStepAt(P, 3, 0.37), { index: 1, step: P.steps[1], barsIntoStep: 0 });
  // the library phrases over two loops
  const walk = (id, ph) => {
    const p = getKinemePhrase(id);
    return Array.from({ length: p.totalBars * 2 }, (_, bar) => phraseStepAt(p, bar, ph).index).join('');
  };
  assert.strictEqual(walk('lookout', 0), '00110011');
  assert.strictEqual(walk('tide', 0), '0000111100001111');
  assert.strictEqual(walk('signal', 0), '0011222200112222');
  assert.strictEqual(walk('signal', 0.5), '2222001122220011', 'half a phrase late');
  // restart: the musical clock returns bar to 0, and bar 0 is the first step for a phase-0 mark
  const clock = createMusicalClock();
  clock.advance(0, 120);
  clock.advance(9000, 120); // 18 beats in: bar 4
  assert.strictEqual(phraseStepAt(getKinemePhrase('tide'), clock.now().bar, 0).index, 1);
  const r = clock.advance(10, 120); // the loop went back
  assert.ok(r.restarted && clock.now().bar === 0);
  assert.strictEqual(phraseStepAt(getKinemePhrase('tide'), clock.now().bar, 0).index, 0);
});

ok(
  'the musical view: malformed is the still position; pos is authoritative; bar / beat / phase can also carry it',
  () => {
    for (const bad of [undefined, null, 5, 'x', {}, { bar: NaN }, { pos: Infinity }])
      assert.strictEqual(musicalView(bad), STILL_MUSICAL);
    assert.deepStrictEqual(STILL_MUSICAL, { pos: 0, bar: 0, beat: 0, phase: 0, bpm: 120 });
    assert.deepStrictEqual(musicalView({ pos: 15.5, bpm: 96 }), { pos: 15.5, bar: 3, beat: 3, phase: 0.5, bpm: 96 });
    assert.deepStrictEqual(musicalView({ bar: 3, beat: 3, phase: 0.5 }), {
      pos: 15.5,
      bar: 3,
      beat: 3,
      phase: 0.5,
      bpm: 120,
    });
    assert.deepStrictEqual(musicalView({ pos: -2, bpm: -1 }), { pos: 0, bar: 0, beat: 0, phase: 0, bpm: 120 });
    assert.deepStrictEqual(musicalView({ pos: 1, cyc: { rock: 1.25, nope: 0.5, bob: 'x' } }).cyc, { rock: 0.25 });
  },
);

// ── snap to beats ─────────────────────────────────────────────────────
ok('tempo: a period snaps to the nearest whole beat, minimum one (pinned at 90 / 120 / 140 BPM)', () => {
  const ids = ['spin', 'rock', 'pulse', 'blink', 'bob', 'bend', 'scatter', 'orbit'];
  const row = (bpm) => ids.map((id) => beatsPerCycle(getKineme(id).period, bpm));
  assert.deepStrictEqual(row(90), [6, 4, 2, 2, 5, 5, 5, 6]);
  assert.deepStrictEqual(row(120), [8, 5, 3, 2, 6, 7, 6, 8]);
  assert.deepStrictEqual(row(140), [9, 6, 4, 2, 7, 8, 7, 9]);
  assert.strictEqual(beatsPerCycle(0.05, 60), 1, 'never inside a beat');
  // the cycle is counted in beats on the musical clock: 5 beats of rock at 120 BPM is one cycle
  const rock = getKineme('rock');
  assert.strictEqual(phraseCycleAt(rock, musicalView({ pos: 5, bpm: 120 })), 0);
  assert.ok(Math.abs(phraseCycleAt(rock, musicalView({ pos: 6.5, bpm: 120 })) - 0.3) < 1e-12);
  // lookout's spin step (2 bars) is exactly one snapped turn at 120 BPM, starting on the turn's zero
  assert.strictEqual(phraseCycleAt(getKineme('spin'), musicalView({ pos: 8, bpm: 120 })), 0);
});

// ── the envelope ──────────────────────────────────────────────────────
ok('the fade: the last beat of a step, a raised cosine; same-kineme neighbours never fade', () => {
  assert.deepStrictEqual([fadeWeight(0), fadeWeight(1), fadeWeight(-3), fadeWeight(9)], [0, 1, 0, 1]);
  assert.ok(Math.abs(fadeWeight(0.5) - 0.5) < 1e-12);
  const tide = getKinemePhrase('tide');
  const at = (pos, ph = 0) => resolvePhrase(tide, musicalView({ pos }), ph);
  assert.deepStrictEqual(
    at(14.99),
    { index: 0, out: getKineme('bob'), in: null, w: 0 },
    'not yet: beat 2 of the last bar',
  );
  assert.deepStrictEqual(
    at(15),
    { index: 0, out: getKineme('bob'), in: null, w: 0 },
    'w = 0 is exactly the outgoing kineme',
  );
  const mid = at(15.5);
  assert.ok(mid.out.id === 'bob' && mid.in.id === 'rock' && Math.abs(mid.w - 0.5) < 1e-12);
  assert.deepStrictEqual(
    at(16),
    { index: 1, out: getKineme('rock'), in: null, w: 0 },
    'the boundary: the incoming kineme alone',
  );
  assert.strictEqual(at(31.5).in.id, 'bob', 'the loop seam fades too');
  assert.strictEqual(at(11.5).in, null, 'only the LAST bar of a step');
  // an offset mark fades on its own bar
  assert.strictEqual(
    at(15.5, 0.5).in.id,
    'bob',
    'half a phrase late: it is leaving rock where a phase-0 mark leaves bob',
  );
  assert.strictEqual(at(15.5, 0.25).in, null);
  assert.strictEqual(at(31.5, 0.5).in.id, 'rock');
  // same kineme next (a merged step, a one-step phrase looping onto itself): no boundary in substance
  for (const P of [mk(['rock', 1]), mk(['rock', 2], ['rock', 1]), mk(['bob', 1], ['rock', 1], ['rock', 1])]) {
    for (let pos = 0; pos < P.totalBars * 4; pos += 0.25) {
      const r = resolvePhrase(P, musicalView({ pos }), 0);
      if (r.in) assert.notStrictEqual(r.in.id, r.out.id, 'a fade always names two different kinemes');
    }
  }
  assert.strictEqual(resolvePhrase(mk(['rock', 1]), musicalView({ pos: 3.5 }), 0).in, null);
  // two break-up kinds read the one packed vector differently: that boundary cuts
  assert.strictEqual(phrasePairFades(getKineme('scatter'), getKineme('orbit')), false);
  assert.strictEqual(phrasePairFades(getKineme('scatter'), getKineme('rock')), true);
});

ok('no pop: across the boundary the pose is continuous for EVERY ordered pair of library singles', () => {
  const brk = [120, -40];
  const KEYS = ['dx', 'dy', 'dRot', 'sx', 'sy', 'dAlpha'];
  const dist = (a, b) => Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
  const D = 0.001; // beats per sample
  let pairs = 0;
  let worst = 0;
  for (const A of KINEMES) {
    for (const B of KINEMES) {
      if (A.id === B.id) continue;
      const P = mk([A.id, 1], [B.id, 1]);
      for (const bpm of [90, 120]) {
        for (const ph of [0, 0.37]) {
          const pose = (pos) => phrasePose(P, { pos, bpm }, ph, brk);
          const alone = (k, pos) =>
            kinemePose({ ...k, period: 1 }, phraseCycleAt(k, musicalView({ pos, bpm })), ph, brk);
          const full = (p) => ({ ...POSE_IDENTITY, ...p });
          // the mark's own bar offset decides which beat is its fade beat: find the A -> B boundary it sees
          const off = phraseOffsetBars(P, ph);
          const boundary = (off + 1) * 4; // end of A's bar for this mark
          // exact at the ends: w = 0 is the outgoing pose; just past the boundary is the incoming pose
          assert.strictEqual(dist(pose(boundary - 1), full(alone(A, boundary - 1))), 0, `${A.id}>${B.id}: w = 0`);
          assert.strictEqual(dist(pose(boundary), full(alone(B, boundary))), 0, `${A.id}>${B.id}: boundary`);
          if (!phrasePairFades(A, B)) continue; // scatter <-> orbit cuts by rule
          // sampled through the fade beat and past the boundary: no step larger than the members' own motion allows
          let maxStep = 0;
          let ownA = 0;
          let ownB = 0;
          let magA = 0;
          let magB = 0;
          for (let i = 0; i < 1300; i++) {
            const p0 = boundary - 1.1 + i * D;
            const p1 = p0 + D;
            maxStep = Math.max(maxStep, dist(pose(p0), pose(p1)));
            const a0 = full(alone(A, p0));
            const b0 = full(alone(B, p0));
            ownA = Math.max(ownA, dist(a0, full(alone(A, p1))));
            ownB = Math.max(ownB, dist(b0, full(alone(B, p1))));
            magA = Math.max(magA, dist(a0, POSE_IDENTITY));
            magB = Math.max(magB, dist(b0, POSE_IDENTITY));
          }
          // d(blend) <= |dA| + |dB| + |dw| (|A| + |B|), |dw| <= (pi / 2) D per sample
          const bound = ownA + ownB + (Math.PI / 2) * D * (magA + magB) + 1e-9;
          assert.ok(maxStep <= bound, `${A.id}>${B.id} @${bpm} phase ${ph}: step ${maxStep} > bound ${bound}`);
          // and the blend lands ON the incoming pose: just before the boundary it is within one sample's motion of it
          const before = pose(boundary - 1e-6);
          const landed = full(alone(B, boundary - 1e-6));
          assert.ok(dist(before, landed) < 1e-3 * (1 + magA + magB), `${A.id}>${B.id}: arrives on the incoming pose`);
          worst = Math.max(worst, maxStep / bound);
          pairs++;
        }
      }
    }
  }
  assert.ok(pairs >= 200 && worst <= 1, `${pairs} cases`);
  // the spec's measured case: rock -> bob at 120 BPM, the largest sample step is the poses' own derivative (~0.025)
  const RB = mk(['rock', 1], ['bob', 1]);
  let m = 0;
  for (let i = 0; i < 1300; i++) {
    const p0 = 2.9 + i * D;
    const a = phrasePose(RB, { pos: p0, bpm: 120 }, 0);
    const b = phrasePose(RB, { pos: p0 + D, bpm: 120 }, 0);
    m = Math.max(m, Math.abs(a.dRot - b.dRot), Math.abs(a.dy - b.dy));
  }
  assert.ok(m < 0.03, `rock > bob largest step ${m}`);
});

ok('fadePose: weight 1 is the pose, weight 0 is rest, scales ease to 1', () => {
  const p = { dx: 4, dy: -2, dRot: 90, sx: 1.2, sy: 0.8, dAlpha: -1 };
  assert.deepStrictEqual(fadePose(p, 1), p);
  assert.deepStrictEqual(fadePose(p, 0), { ...POSE_IDENTITY });
  const h = fadePose(p, 0.5);
  assert.ok(Math.abs(h.sx - 1.1) < 1e-12 && Math.abs(h.sy - 0.9) < 1e-12 && h.dAlpha === -0.5 && h.dRot === 45);
});

// ── the tempo fold ────────────────────────────────────────────────────
ok('a BPM change mid-step never jumps the cycle: the phrase clock re-anchors; the bare count would jump', () => {
  const rock = getKineme('rock');
  assert.deepStrictEqual([beatsPerCycle(rock.period, 120), beatsPerCycle(rock.period, 100)], [5, 4]);
  // the bare formula at beat 6.3: 120 -> 100 BPM moves the cycle 0.260 -> 0.575 (the spec's measurement)
  const bare = (bpm) => phraseCycleAt(rock, musicalView({ pos: 6.3, bpm }));
  assert.ok(Math.abs(bare(120) - 0.26) < 1e-9 && Math.abs(bare(100) - 0.575) < 1e-9);
  // the fold: step the tempo down at beat 6.3, sample finely either side
  const run = () => {
    const pc = createPhraseClock();
    const out = [];
    for (let i = 0; i <= 2000; i++) {
      const pos = i * 0.005;
      out.push(pc.at({ pos, bpm: pos < 6.3 ? 120 : 100 }).cyc.rock);
    }
    return { out, state: pc.snapshotState() };
  };
  const a = run();
  let maxJump = 0;
  for (let i = 1; i < a.out.length; i++) {
    let d = Math.abs(a.out[i] - a.out[i - 1]);
    d = Math.min(d, 1 - d);
    maxJump = Math.max(maxJump, d);
  }
  assert.ok(maxJump <= 0.005 / 4 + 1e-9, `largest cycle step ${maxJump} is one sample at the faster rate`);
  // after the change it runs at the new rate from where it was
  const pc = createPhraseClock();
  pc.at({ pos: 6.2, bpm: 120 });
  const c0 = pc.at({ pos: 6.3, bpm: 100 }).cyc.rock;
  const c1 = pc.at({ pos: 7.3, bpm: 100 }).cyc.rock;
  assert.ok(
    Math.abs(c0 - 0.26) < 1e-9 && Math.abs(fract(c1 - c0) - 0.25) < 1e-9,
    'one beat later = a quarter of the 4-beat cycle',
  );
  // a kineme whose beat count did not change is the bare count, exactly
  assert.strictEqual(
    pc.at({ pos: 9, bpm: 100 }).cyc.blink,
    phraseCycleAt(getKineme('blink'), musicalView({ pos: 9, bpm: 100 })),
  );
  // a replay of the same (pos, bpm) sequence reproduces the cycles and the anchors
  const b = run();
  assert.deepStrictEqual(a.out, b.out);
  assert.deepStrictEqual(a.state, b.state);
  // the state is plain JSON and restores
  const pc2 = createPhraseClock();
  assert.ok(pc2.restoreState(JSON.parse(JSON.stringify(a.state))));
  assert.deepStrictEqual(pc2.snapshotState(), a.state);
  assert.strictEqual(
    pc2.at({ pos: 10.5, bpm: 100 }).cyc.rock,
    (() => {
      const p3 = createPhraseClock();
      p3.restoreState(a.state);
      return p3.at({ pos: 10.5, bpm: 100 }).cyc.rock;
    })(),
  );
  for (const bad of [
    null,
    {},
    { lastPos: 1 },
    { lastPos: 1, anchors: { rock: [0, 0] } },
    { lastPos: 1, anchors: { rock: [0, 0, 0] } },
  ])
    assert.strictEqual(createPhraseClock().restoreState(bad), false);
  // the loop restarted (the position ran back): every anchor starts over, so the take walks from zero again
  const pr = createPhraseClock();
  pr.at({ pos: 6.2, bpm: 120 });
  pr.at({ pos: 6.3, bpm: 100 });
  assert.strictEqual(pr.at({ pos: 0, bpm: 100 }).cyc.rock, 0);
  assert.ok(Math.abs(pr.at({ pos: 1, bpm: 100 }).cyc.rock - 0.25) < 1e-12);
  // what it returns is the doc's musical field, and the resolver reads the folded cycle from it
  const v = musicalView(pc.at({ pos: 9, bpm: 100 }));
  assert.ok(v.bar === 2 && v.beat === 1 && v.bpm === 100 && Object.keys(v.cyc).length === KINEMES.length);
  assert.strictEqual(phraseCycleAt(rock, v), v.cyc.rock);
});

// ── the contract ──────────────────────────────────────────────────────
const GEO = 'geo_tri_01';
const item = (assetId, key, extra = {}) => ({
  assetId,
  x: 500,
  y: 350,
  scale: 2.5,
  rotation: 0,
  color: '#ffffff',
  accent: '#ff4444',
  alpha: 100,
  key,
  seedOffset: 0,
  ...extra,
});
const contract = (doc, items) =>
  buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: [{ id: 'L', isFx: false, items }] });

ok('goldens: a doc with no phrase builds the identical contract with or without a musical view', () => {
  const musical = createPhraseClock().at({ pos: 13.7, bpm: 133 });
  for (const doc of [
    { kinemeTime: 2.5 },
    { assetKineme: { [GEO]: 'rock' }, kinemeTime: 2.5 },
    { assetKineme: { [GEO]: 'rock+bob' }, kinemeTime: 2.5 },
    { regionKinemes: { [FLORA]: { ...NONE, [PETALS[0]]: 'scatter', [PETALS[1]]: 'orbit' } }, kinemeTime: 2.5 },
    {},
  ]) {
    const items = [item(GEO, 'a'), item(FLORA, 'b')];
    const plain = contract(doc, items);
    const withView = contract({ ...doc, musical }, items);
    assert.deepStrictEqual(withView, plain);
    assert.strictEqual(JSON.stringify(withView), JSON.stringify(plain));
    assert.ok(!('musical' in withView), 'the view never rides the scene');
  }
  // and a phrase contract does not carry it either
  assert.ok(!('musical' in contract({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 1, musical }, [item(GEO, 'a')])));
});

/** The shader's kineme block for one instance, transcribed from QUAD_VS: table entry + phase + time -> the pose it draws. */
function shaderPose(entry, phase, t, brk = [0, 0], box = 250) {
  let kDeg = 0;
  let kVis = 1;
  let scale = 1;
  let kOff = [0, 0];
  const member = (m, add) => {
    const per = Math.max(m.period, 1e-3);
    const ph = fract(t / per + phase);
    const wav = Math.sin(ph * TAU);
    let deg = 0;
    let off = [0, 0];
    let vis = 1;
    if (m.kind === 1) deg = (m.amp < 0 ? -ph : ph) * 360;
    else if (m.kind === 2) deg = m.amp * wav;
    else if (m.kind === 3) scale *= 1 + m.amp * wav;
    else if (m.kind === 4) vis = ph < m.amp ? 1 : 0;
    else if (m.kind === 5) off = [0, m.amp * wav];
    else if (m.kind === 6) {
      const us = fract(t / per - phase * 0.4);
      const es = us < 0.6 ? 0.5 * (1 - Math.cos((TAU * us) / 0.6)) : 0;
      off = [brk[0] * m.amp * es, brk[1] * m.amp * es];
    } else if (m.kind === 7) {
      const ob = brk[0] > 0 ? brk[0] : box;
      const ot = TAU * fract(t / per);
      const oh = Math.sin(0.5 * ot);
      const oc = [-2 * oh * oh, (m.amp < 0 ? -1 : 1) * Math.sin(ot)];
      const ol = TAU * phase;
      const r = ob * Math.abs(m.amp);
      off = [r * (oc[0] * Math.cos(ol) - oc[1] * Math.sin(ol)), r * (oc[0] * Math.sin(ol) + oc[1] * Math.cos(ol))];
    }
    add(deg, off, vis);
  };
  const w = entry.f > 0 ? entry.f : 0;
  member(entry, (deg, off, vis) => {
    kDeg = deg;
    kOff = off;
    kVis = vis;
  });
  if (w > 0) {
    const ka = 1 - w;
    kDeg *= ka;
    kOff = [kOff[0] * ka, kOff[1] * ka];
    kVis = 1 + ka * (kVis - 1);
  }
  if (entry.b) {
    const d0 = kDeg;
    const o0 = kOff;
    const v0 = kVis;
    member(entry.b, (deg, off, vis) => {
      kDeg += deg;
      kOff = [kOff[0] + off[0], kOff[1] + off[1]];
      if (entry.b.kind === 4) kVis *= vis;
      if (w > 0) {
        kDeg = d0 + w * (kDeg - d0);
        kOff = [o0[0] + w * (kOff[0] - o0[0]), o0[1] + w * (kOff[1] - o0[1])];
        if (entry.b.kind === 4) kVis = v0 + w * (vis - 1);
      }
    });
  }
  return { dx: kOff[0], dy: kOff[1], dRot: kDeg, sx: scale, sy: scale, dAlpha: kVis - 1 };
}
const close = (a, b, eps, msg) => {
  for (const k of Object.keys(POSE_IDENTITY))
    assert.ok(Math.abs(a[k] - b[k]) <= eps, `${msg}: ${k} ${a[k]} vs ${b[k]}`);
};

ok(
  'the table entries + the shader lines draw the CPU reference: steady steps and every fading pair, at any motion time',
  () => {
    let cases = 0;
    for (const p of KINEME_PHRASES) {
      const phrase = getKinemePhrase(p.id);
      for (const t of [0.5, 17.3, 3600.25]) {
        for (let i = 0; i < phrase.totalBars * 16; i++) {
          const pos = i * 0.25 + 0.137;
          const musical = { pos, bpm: 120 };
          const c = contract({ assetKineme: { [GEO]: p.id }, kinemeTime: t, musical }, [item(GEO, 'a')]);
          const inst = c.instances[0];
          const phase = kinemePhase(0, 'a');
          assert.strictEqual(inst.kinemePhase, phase);
          const want = phrasePose(phrase, musical, phase);
          // rotations compare modulo a turn-fraction error of the synthetic period (1e-6 of a cycle = 4e-4 degrees)
          close(shaderPose(c.kinemes[inst.kineme - 1], phase, t), want, 2e-3, `${p.id} pos ${pos} t ${t}`);
          cases++;
        }
      }
    }
    // every ordered pair, through a region assignment (so scatter and orbit take part), mid-fade
    const brk = [200, 0];
    for (const A of KINEMES) {
      for (const B of KINEMES) {
        if (A.id === B.id || !phrasePairFades(A, B)) continue;
        const P = mk([A.id, 1], [B.id, 1]);
        const view = musicalView({ pos: 3.4, bpm: 120 });
        const r = resolvePhrase(P, view, 0);
        assert.ok(r.in && r.w > 0);
        const entry = {
          kind: KINEME_KINDS[A.kind],
          period: phrasePeriod(phraseCycleAt(A, view), 9.5),
          amp: A.kind === 'pulse' ? A.amp * (1 - r.w) : A.amp,
          b: {
            kind: KINEME_KINDS[B.kind],
            period: phrasePeriod(phraseCycleAt(B, view), 9.5),
            amp: B.kind === 'pulse' ? B.amp * r.w : B.amp,
          },
          f: r.w,
        };
        // orbit reads the box from brk.x; scatter the whole vector — a pair never holds both, so one vector serves
        close(shaderPose(entry, 0, 9.5, brk), phrasePose(P, view, 0, brk), 2e-3, `${A.id}>${B.id}`);
        cases++;
      }
    }
    assert.ok(cases > 800, `${cases} cases`);
    // the synthetic period lands the shader on the cycle to float32 precision, and is rest at motion time 0
    let worstC = 0;
    for (const t of [0.004, 0.5, 17.3, 999.9, 36000.1]) {
      for (let i = 0; i < 1000; i++) {
        const c = i / 1000;
        const q = Math.fround(Math.fround(t) / Math.fround(phrasePeriod(c, t)));
        const d = Math.abs(fract(q) - c);
        worstC = Math.max(worstC, Math.min(d, 1 - d));
      }
    }
    assert.ok(worstC < 1e-6, `worst cycle error ${worstC}`);
    assert.strictEqual(0 / phrasePeriod(0.4, 0), 0, 'motion time 0 is cycle 0 whatever the musical position');
    assert.ok(
      phrasePeriod(0.4, 0.001) > 1e20 && phrasePeriod(0.999, 0.004) >= 1e-3,
      "never under the shader's period floor",
    );
  },
);

ok(
  'contract: one slot per phrase kineme, shared across offsets and phrases; a fade is one pair slot; a still is rest',
  () => {
    // 12 marks on `tide`, different seed phases -> different bar offsets, at a bar where both steps are in play
    const items = Array.from({ length: 12 }, (_, i) => item(GEO, `k${i}`, { seedOffset: i * 977 }));
    const c = contract({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 3, musical: { pos: 9.2, bpm: 120 } }, items);
    const kinds = c.kinemes.map((k) => k.kind);
    assert.deepStrictEqual(kinds.sort(), [KINEME_KINDS.osc, KINEME_KINDS.bob].sort(), 'bob and rock, once each');
    assert.ok(c.kinemes.every((k) => !k.b && !k.f));
    const tide = getKinemePhrase('tide');
    for (const inst of c.instances) {
      const ph = kinemePhase(inst.seedOffset, inst.key);
      const want = phraseStepAt(tide, 2, ph).step.kineme;
      assert.strictEqual(c.kinemes[inst.kineme - 1].kind, KINEME_KINDS[want.kind], `${inst.key} plays its own step`);
      assert.strictEqual(inst.kinemePhase, ph);
    }
    assert.ok(new Set(c.instances.map((i) => i.kineme)).size === 2, 'the field is split across the two steps');
    // a plain `bob` beside the phrase keeps its own period in seconds, in its own slot
    const mixed = contract(
      { assetKineme: { [GEO]: 'tide', geo_tri_02: 'bob' }, kinemeTime: 3, musical: { pos: 1, bpm: 120 } },
      [item(GEO, 'a'), item('geo_tri_02', 'b')],
    );
    const plainBob = mixed.kinemes[mixed.instances[1].kineme - 1];
    assert.deepStrictEqual(
      plainBob,
      { kind: KINEME_KINDS.bob, period: 3.0, amp: 6 },
      'outside a phrase nothing changes',
    );
    // the fade beat: the pair rides ONE slot — the outgoing kineme, the incoming as b, the weight as f
    const ph0 = kinemePhase(0, 'a');
    const off = phraseOffsetBars(tide, ph0);
    const fadePos = ((off + 3) % 8) * 4 + 3.5; // the last beat of this mark's bob step, half way
    const f = contract({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 3, musical: { pos: fadePos, bpm: 120 } }, [
      item(GEO, 'a'),
    ]);
    const e = f.kinemes[f.instances[0].kineme - 1];
    assert.ok(e.kind === KINEME_KINDS.bob && e.b.kind === KINEME_KINDS.osc && Math.abs(e.f - 0.5) < 1e-9);
    assert.ok(e.amp === 6 && e.b.amp === 18, 'bob and rock keep their amp: the shader weights them');
    // a pulse in a fade arrives pre-scaled in its amp
    const sig = getKinemePhrase('signal');
    const offS = phraseOffsetBars(sig, ph0);
    const sp = ((offS + 1) % 8) * 4 + 3.5; // the last beat of the pulse step
    const s = contract({ assetKineme: { [GEO]: 'signal' }, kinemeTime: 3, musical: { pos: sp, bpm: 120 } }, [
      item(GEO, 'a'),
    ]);
    const se = s.kinemes[s.instances[0].kineme - 1];
    assert.ok(
      se.kind === KINEME_KINDS.pulse &&
        se.b.kind === KINEME_KINDS.blink &&
        Math.abs(se.amp - 0.12 * (1 - se.f)) < 1e-12,
    );
    assert.strictEqual(se.b.amp, 0.5, "blink's amp is its duty: never scaled");
    // a still (no musical view, motion time 0): the offset's step, cycle 0
    const still = contract({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 0 }, [item(GEO, 'a')]);
    const se0 = still.kinemes[still.instances[0].kineme - 1];
    assert.strictEqual(se0.kind, KINEME_KINDS[phraseStepAt(tide, 0, ph0).step.kineme.kind]);
    assert.strictEqual(0 / se0.period, 0);
    // reduced motion / the freeze rung are unchanged paths: the contract is what a single kineme's would be
    const single = contract({ assetKineme: { [GEO]: 'bob' }, kinemeTime: 1, reducedMotion: true }, [item(GEO, 'a')]);
    const phr = contract({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 1, reducedMotion: true, musical: { pos: 1 } }, [
      item(GEO, 'a'),
    ]);
    assert.strictEqual('kinemes' in single, 'kinemes' in phr);
  },
);

ok(
  'regions: a region phrase resolves on the region seed hash, sheds with the region ladder, and a scatter member is packed',
  () => {
    const tide = getKinemePhrase('tide');
    const assign = { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'tide'])) };
    const c = contract({ regionKinemes: { [FLORA]: assign }, kinemeTime: 2, musical: { pos: 9.2, bpm: 120 } }, [
      item(FLORA, 'a'),
    ]);
    for (const p of PETALS) {
      const want = phraseStepAt(tide, 2, kinemePhase(FLORA, p)).step.kineme;
      assert.strictEqual(c.kinemes[c.regionAnim.assets[FLORA][p] - 1].kind, KINEME_KINDS[want.kind], p);
    }
    for (const gov of [{ perfTier1: true, quality: 'performance' }, { reducedMotion: true }]) {
      const g = contract({ regionKinemes: { [FLORA]: assign }, ...gov, kinemeTime: 2, musical: { pos: 9.2 } }, [
        item(FLORA, 'a'),
      ]);
      assert.strictEqual(g.regionAnim.budget, 0);
      for (const p of PETALS) assert.strictEqual(g.regionAnim.assets[FLORA][p], 0, 'merged, at rest');
    }
    // the pack reads a fading pair's SECOND member too: scatter fading in gets its vector, orbit its box
    const atlas = bakeAtlas([{ asset: FLORA, ink: '#ffffff', accent: '#ff4444' }]);
    const cells = Object.fromEntries(atlas.cells);
    const base = contract({ regionKinemes: { [FLORA]: { ...NONE, [PETALS[0]]: 'rock' } }, kinemeTime: 1 }, [
      item(FLORA, 'a'),
    ]);
    const slot = base.regionAnim.assets[FLORA][PETALS[0]];
    const idx = 1 + flora.regions.findIndex((r) => r.id === PETALS[0]);
    const tail = (table) => {
      const p = packInstanceData([base.instances[0]], cells, 1, {
        motionTime: 0,
        shed: false,
        regions: base.regionAnim,
        kinemes: table,
      });
      return [...p.subarray(idx * INSTANCE_STRIDE + 49, (idx + 1) * INSTANCE_STRIDE)];
    };
    const withB = (kind) =>
      base.kinemes.map((k, i) => (i === slot - 1 ? { ...k, b: { kind, period: 1, amp: 0.1 }, f: 0.5 } : k));
    assert.deepStrictEqual(tail(base.kinemes), [0, 0]);
    assert.ok(
      Math.abs(Math.hypot(...tail(withB(KINEME_KINDS.scatter))) - 250) < 1e-2,
      'scatter as b: the break-up vector',
    );
    assert.deepStrictEqual(tail(withB(KINEME_KINDS.orbit)), [250, 0], 'orbit as b: the mark box');
  },
);

ok(
  'over budget: a phrase mark drops to its phrase FIRST step, full and unfaded — never a blank the phrase caused',
  () => {
    // fill the table: 7 whole-mark singles + 4 stacks = 11, then three phrases whose first steps (blink, bob, pulse) take 3
    const singles = KINEMES.filter((k) => !k.regionOnly).map((k) => k.id); // 7
    const fillers = [...singles, ...KINEME_STACKS.map((s) => s.id)];
    const assets = ASSETS.filter((a) => a.id.startsWith('geo_') || a.id.startsWith('mic_')).map((a) => a.id);
    assert.ok(assets.length >= fillers.length + 3);
    const assetKineme = Object.fromEntries(fillers.map((k, i) => [assets[i], k]));
    const [pa, pb, pc] = assets.slice(fillers.length, fillers.length + 3);
    Object.assign(assetKineme, { [pa]: 'lookout', [pb]: 'tide', [pc]: 'signal' });
    // six marks per phrase asset, spread over the bar offsets, so every phrase kineme is in play at once
    const phraseOf = { [pa]: 'lookout', [pb]: 'tide', [pc]: 'signal' };
    const items = [
      ...fillers.map((_, i) => item(assets[i], 'solo')),
      ...[pa, pb, pc].flatMap((a) => Array.from({ length: 6 }, (_, i) => item(a, `m${i}`, { seedOffset: i * 977 }))),
    ];
    const at = (pos) => contract({ assetKineme, kinemeTime: 5, musical: { pos, bpm: 120 } }, items);
    const steady = at(0.5);
    const firstKind = { [pa]: KINEME_KINDS.blink, [pb]: KINEME_KINDS.bob, [pc]: KINEME_KINDS.pulse };
    let full = 0;
    let fell = 0;

    for (let bar = 0; bar < 8; bar++) {
      for (const beat of [0.5, 3.5]) {
        const pos = bar * 4 + beat;
        const c = at(pos);
        assert.ok(c.kinemes.length <= KINEME_TABLE_MAX);
        if (c.kinemes.length === KINEME_TABLE_MAX) full++;
        for (const inst of c.instances) {
          const id = phraseOf[inst.asset];
          if (!id) continue;
          assert.ok(inst.kineme > 0, `${id} at ${pos}: never blank`);
          const e = c.kinemes[inst.kineme - 1];
          const r = resolvePhrase(
            getKinemePhrase(id),
            musicalView({ pos, bpm: 120 }),
            kinemePhase(inst.seedOffset, inst.key),
          );
          const plays =
            e.kind === KINEME_KINDS[r.out.kind] && (r.in ? e.f > 0 && e.b.kind === KINEME_KINDS[r.in.kind] : !e.f);
          if (plays) {
            continue;
          }
          fell++;
          assert.strictEqual(e.kind, firstKind[inst.asset], `${id} at ${pos}: fell back to its first step`);
          assert.ok(!e.f && !e.b, 'full and unfaded');
        }
      }
    }
    assert.ok(full > 0, 'the table filled');
    assert.ok(fell > 0, 'a mark without room for its pair played its first step');
    // the singles and stacks around them are untouched by the phrases' presence
    const without = contract(
      { assetKineme: Object.fromEntries(fillers.map((k, i) => [assets[i], k])), kinemeTime: 5 },
      items.slice(0, fillers.length),
    );
    assert.deepStrictEqual(steady.kinemes.slice(0, fillers.length), without.kinemes);
  },
);

// ── the shader and Motion Core ────────────────────────────────────────
ok(
  'shader: the fade weight is gated (0 never enters) inside the slot gate; the single and stack lines are untouched',
  () => {
    assert.ok(QUAD_VS.includes('uniform float u_kinemeF[16];'));
    const gate = QUAD_VS.indexOf('if (a_inst4.z > 0.5) {');
    const k7 = QUAD_VS.indexOf('else if (kind == 7) {');
    const f = QUAD_VS.indexOf('float kfw = u_kinemeF[int(a_inst4.z + 0.5) - 1];');
    const fa = QUAD_VS.indexOf('if (kfw > 0.0) {');
    const kb = QUAD_VS.indexOf('vec3 kb = u_kinemeB[int(a_inst4.z + 0.5) - 1];');
    const spec = QUAD_VS.indexOf('float specColour = 0.0;');
    assert.ok(gate > 0 && gate < k7 && k7 < f && f < fa && fa < kb && kb < spec);
    for (const line of [
      'kDeg *= kfa;',
      'kOff *= kfa;',
      'kVis = 1.0 + kfa * (kVis - 1.0);',
      'kDeg = kDeg0 + kfw * (kDeg - kDeg0);',
      'kOff = kOff0 + kfw * (kOff - kOff0);',
      'if (kindB == 4) kVis = kVis0 + kfw * ((phB < kb.z ? 1.0 : 0.0) - 1.0);',
      'else if (kindB == 6) {',
      'else if (kindB == 7) {',
      // the lines every earlier kind was pinned on
      'float ph = fract(u_kinemeTime / per + a_inst4.w);',
      'else if (kind == 5) kOff = vec2(0.0, km.z * wav);',
      'kOff = a_brk * (km.z * es);',
      'else if (kindB == 5) kOff += vec2(0.0, kb.z * wavB);',
    ])
      assert.ok(QUAD_VS.includes(line), line);
    assert.strictEqual(QUAD_VS.split('kfw > 0.0').length - 1, 2, 'both fade branches sit behind the weight');
  },
);

ok(
  'Motion Core: every phrase registers as kineme-phrase:<id>, family kineme, timeBase bars, and rests at bar 0',
  () => {
    for (const p of KINEME_PHRASES) {
      const src = getMotionSource(phraseSourceId(p.id));
      assert.ok(src, p.id);
      assert.deepStrictEqual(
        [src.id, src.family, src.timeBase, src.costTier],
        [`kineme-phrase:${p.id}`, 'kineme', 'bars', 'motionCore/kineme-phrase'],
      );
      assert.deepStrictEqual({ ...src.evaluate({ key: 'n', phase01: 0 }, 0, {}) }, { ...POSE_IDENTITY });
      const phrase = getKinemePhrase(p.id);
      for (const [tBars, ctx] of [
        [1.3, {}],
        [3.9, { bpm: 96 }],
        [7.99, { bpm: 140 }],
      ]) {
        assert.deepStrictEqual(
          src.evaluate({ key: 'n', phase01: 0.37 }, tBars, ctx),
          phrasePose(phrase, { pos: tBars * 4, bpm: ctx.bpm }, 0.37),
          `${p.id} @ ${tBars} bars`,
        );
      }
      // a replayed take reproduces the step sequence: same (bars, bpm) inputs, same answers
      const seq = () =>
        Array.from({ length: 64 }, (_, i) =>
          JSON.stringify(src.evaluate({ key: 'n', phase01: 0.37 }, i * 0.25, { bpm: 120 })),
        );
      assert.deepStrictEqual(seq(), seq());
    }
    assert.strictEqual(getMotionSource('kineme:tide'), undefined, 'a phrase is not a kineme: source');
  },
);

// ── GPU: real WebGL2 through the parity driver ────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  try {
    const shot = async (doc, asset = GEO, key = 'solo') =>
      (await renderViaGL(contract(doc, [item(asset, key)]), { width: 400, height: 280, bg: '#000000' })).pixels;
    const diffPx = (a, b) => {
      let k = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++;
      }
      return k;
    };
    // a phrase-less scene: a musical view changes nothing, byte for byte
    const musical = createPhraseClock().at({ pos: 13.7, bpm: 133 });
    const rock = { assetKineme: { [GEO]: 'rock' }, kinemeTime: 1.1 };
    assert.strictEqual(
      Buffer.compare(await shot(rock), await shot({ ...rock, musical })),
      0,
      'no phrase: byte-identical',
    );
    // a still of a phrase scene (motion time 0) is the motionless render when the mark's cycle starts at rest
    const still = await shot({ kinemeTime: 0 });
    // `tide`, key 'solo': which step it is on at bar 0 depends on its seed phase; both bob and rock rest at cycle 0 + phase
    // only for phase 0, so compare a phrase still against the SAME kineme's own still instead
    const tide = getKinemePhrase('tide');
    const k0 = phraseStepAt(tide, 0, kinemePhase(0, 'solo')).step.kineme;
    const phraseStill = await shot({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 0 });
    const singleStill = await shot({ assetKineme: { [GEO]: k0.id }, kinemeTime: 0 });
    assert.strictEqual(
      Buffer.compare(phraseStill, singleStill),
      0,
      'a phrase still is its step kineme at motion time 0',
    );
    // it moves with the musical position
    const at = (pos) => shot({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 5, musical: { pos, bpm: 120 } });
    const a = await at(1.0);
    const b = await at(2.5);
    const moved = diffPx(a, b);
    assert.ok(moved > 100, `the mark moves with the beat: ${moved} px`);
    assert.ok(diffPx(a, still) > 0);
    // the same musical position draws the same frame whatever the motion time (the cycle is the musical clock's)
    const again = await shot({ assetKineme: { [GEO]: 'tide' }, kinemeTime: 731.5, musical: { pos: 1.0, bpm: 120 } });
    assert.ok(diffPx(a, again) <= moved / 20, 'motion time does not move a phrase mark');
    // no pop: across this mark's bob -> rock boundary the frame changes no more than it does between neighbours
    const off = phraseOffsetBars(tide, kinemePhase(0, 'solo'));
    const boundary = ((off + 4) % 8) * 4 + 4;
    const pre = await at(boundary - 0.02);
    const post = await at(boundary + 0.02);
    const far = await at(boundary - 1.5); // a beat and a half earlier: ordinary motion for scale
    const jump = diffPx(pre, post);
    const scale = diffPx(far, pre);
    assert.ok(jump <= Math.max(60, scale), `across the boundary ${jump} px vs ${scale} px of ordinary motion`);
    // the fade itself draws: half way through the fade beat is neither end
    const mid = await at(boundary - 0.5);
    assert.ok(diffPx(mid, post) > 0 || diffPx(mid, far) > 0);
    console.log(
      `kinemePhrase GPU: OK — ${moved} px moved over 1.5 beats; boundary ${jump} px vs ${scale} px; no-phrase bytes identical`,
    );
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser phrase tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log(`kinemePhrase.selfcheck: ${n} ok`);
