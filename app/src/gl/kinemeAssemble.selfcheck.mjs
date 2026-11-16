// kinemeAssemble.selfcheck.mjs — #2116 (Motion Core P4, step 2c): the assemble kineme — a TRIGGERED one-shot. A new Look,
// a Book chapter landing or a strong audio hit throws the pieces out; they settle home. Idle, it is exactly rest.
//
// Node: the library entry (region-only, appended last); the CPU reference (rest with no trigger for EVERY phase, a landing
// starts displaced, a cubic ease-out in a ripple, exactly home after (1 + ripple) x per, the audio kick and hold); the shader
// carries the same formulas; the motion source reads node.trig; the trigger fold (first frame adopts, a landing stamps once,
// a hit scatters only pieces at home, a stranded scatter settles itself, spent forgets, time backwards rests, a snapshot
// replays); the live driver (landings, one scatter per bar, the next downbeat, a clock restart, a keep is not a trigger);
// the contract (the stamps ride only for an assemble scene with a live trigger); the pack (an assemble region carries the
// scatter's vector).
// Browser (when Playwright's browser is installed): no trigger == the frozen render; a landing frame is displaced; settled == rest.
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import {
  KINEMES,
  KINEME_KINDS,
  KINEME_STACKS,
  KINEME_PHRASES,
  ASSEMBLE_RIPPLE,
  ASSEMBLE_KICK,
  BREAK_ONSET_STRENGTH,
  getKineme,
  sanitizeAssetKineme,
} from '../data/kinemes.js';
import { sanitizeRegionKinemes } from '../data/regionKinemes.js';
import { bakeAtlas } from './atlas.mjs';
import { packInstanceData, INSTANCE_STRIDE } from './renderer.mjs';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { assemblePose, scatterPose, kinemePose } from '../engine/motionCore/kinemeSources.js';
import { getMotionSource } from '../engine/motionCore/index.js';
import {
  createBreakTrigger,
  BREAK_NEVER,
  BREAK_SETTLED_AFTER,
  BREAK_HOLD_MAX,
} from '../engine/motionCore/breakTrigger.js';
import { startBreak } from '../curator/breakLive.js';
import { emit, Events } from '../composition/eventBus.js';

const INK = '#ffffff';
const ACC = '#ff4444';
const FLORA = 'flora_flower_01';
const flora = ASSETS.find((a) => a.id === FLORA);
const PETALS = flora.regions.filter((r) => r.color === '000000').map((r) => r.id);
const asm = getKineme('assemble');
const AS_KIND = KINEME_KINDS.assemble;
const PER = asm.period;

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── the library ───────────────────────────────────────────────────────
ok('assemble is kind 8, at the spec numbers, region-only, appended last; no stack or phrase uses it', () => {
  assert.strictEqual(AS_KIND, 8);
  assert.deepStrictEqual(asm, { id: 'assemble', kind: 'assemble', period: 1.6, amp: 0.3, regionOnly: true });
  assert.ok(Object.isFrozen(asm));
  assert.strictEqual(ASSEMBLE_RIPPLE, 0.5);
  assert.strictEqual(ASSEMBLE_KICK, 0.12);
  assert.strictEqual(BREAK_ONSET_STRENGTH, 0.8);
  assert.deepStrictEqual(
    sanitizeAssetKineme({ a: 'assemble' }),
    null,
    'a whole mark cannot take it (it would be inert)',
  );
  assert.deepStrictEqual(sanitizeRegionKinemes({ [PETALS[0]]: 'assemble' }, flora.regions), {
    [PETALS[0]]: 'assemble',
  });
  assert.strictEqual(KINEMES[KINEMES.length - 1].id, 'assemble', 'appended last: earlier slots unmoved');
  for (const st of KINEME_STACKS) assert.ok(!st.stack.includes('assemble'), `${st.id}: not stackable`);
  for (const ph of KINEME_PHRASES)
    assert.ok(!ph.steps.some((s) => s.kineme === 'assemble'), `${ph.id}: not a phrase step`);
});

// ── the CPU reference ─────────────────────────────────────────────────
const BRK = [100, 0];
ok('rest: no trigger is exactly +0 at every time and every seed-hash phase (1000 of them)', () => {
  for (let i = 0; i < 1000; i++) {
    for (const t of [0, 0.7, 3.3, 1e4]) {
      for (const trig of [null, undefined]) {
        const p = assemblePose(asm, t, i / 1000, BRK, trig);
        assert.ok(Object.is(p.dx, 0) && Object.is(p.dy, 0), `phase ${i / 1000} t ${t}`);
      }
    }
  }
  assert.deepStrictEqual(kinemePose(asm, 1, 0.3, BRK), { dx: 0, dy: 0 }, 'kinemePose with no stamps rests');
});

ok('a landing starts displaced: at the stamp every piece is at amp x box, then it eases home', () => {
  const trig = [BREAK_NEVER, 5];
  for (const ph of [0, 0.3, 0.999]) {
    const p = assemblePose(asm, 5, ph, BRK, trig);
    assert.ok(near(p.dx, 30) && near(p.dy, 0), `phase ${ph} at the stamp: ${p.dx}`);
  }
  // a pinned table (phase 0): e = (1 - x)^3, x = (t - tIn) / per
  const table = [
    [5.0, 1.0],
    [5.4, (1 - 0.25) ** 3], // x = 0.25
    [5.8, 0.5 ** 3],
    [6.2, 0.25 ** 3],
    [6.6, 0],
  ];
  for (const [t, e] of table) assert.ok(near(assemblePose(asm, t, 0, BRK, trig).dx, 30 * e, 1e-9), `t ${t}`);
  // monotone settle, never overshoots
  let prev = Infinity;
  for (let s = 0; s <= 40; s++) {
    const d = assemblePose(asm, 5 + (PER * s) / 40, 0, BRK, trig).dx;
    assert.ok(d <= prev + 1e-12 && d >= 0, `step ${s}`);
    prev = d;
  }
});

ok('the ripple: a higher phase holds displaced longer; everything is exactly home after (1 + ripple) x per', () => {
  const trig = [BREAK_NEVER, 10];
  const late = assemblePose(asm, 10 + 0.5 * ASSEMBLE_RIPPLE * PER, 0.5, BRK, trig); // its delay is phase x ripple x per
  assert.ok(near(late.dx, 30), 'phase 0.5 is still at its start while phase 0 has moved');
  assert.ok(assemblePose(asm, 10 + 0.5 * ASSEMBLE_RIPPLE * PER, 0, BRK, trig).dx < 30 - 1e-6);
  for (let i = 0; i < 1000; i++) {
    const p = assemblePose(asm, 10 + (1 + ASSEMBLE_RIPPLE) * PER, i / 1000, BRK, trig);
    assert.ok(p.dx === 0 && p.dy === 0, `phase ${i / 1000}: ${p.dx}`);
    assert.ok(!Object.is(p.dx, -0) && !Object.is(p.dy, -0));
  }
  assert.strictEqual(BREAK_SETTLED_AFTER, (1 + ASSEMBLE_RIPPLE) * PER);
});

ok('an audio scatter flies out in the kick and holds until the settle; direction is the packed vector', () => {
  const trig = [7, BREAK_NEVER];
  assert.ok(near(assemblePose(asm, 7, 0.2, [50, -80], trig).dx, 0), 'starts at home');
  const k = assemblePose(asm, 7 + ASSEMBLE_KICK / 2, 0, [50, -80], trig);
  assert.ok(near(k.dx, 50 * 0.3 * (1 - 0.5 ** 3)) && near(k.dy, -80 * 0.3 * (1 - 0.5 ** 3)));
  for (const t of [7 + ASSEMBLE_KICK, 9, 100])
    assert.ok(near(assemblePose(asm, t, 0.4, BRK, trig).dx, 30), `held at ${t}`);
  // a settle after the scatter: tIn >= tOut -> the settle form, starting from fully out
  assert.ok(near(assemblePose(asm, 9, 0, BRK, [7, 9]).dx, 30), 'the downbeat settle starts displaced');
  assert.ok(near(assemblePose(asm, 9 + PER, 0, BRK, [7, 9]).dx, 0));
});

ok('the shader carries the same formulas (kind 8, armed by u_break, kick 0.12, ripple 0.5, cubic)', () => {
  assert.ok(QUAD_VS.includes('uniform vec3 u_break;'));
  assert.ok(QUAD_VS.includes('else if (kind == 8) {'));
  for (const line of [
    'if (u_break.z > 0.5) {',
    'if (u_break.x > u_break.y) {',
    'float ax = 1.0 - clamp((u_kinemeTime - u_break.x) / 0.12, 0.0, 1.0);',
    'ae = 1.0 - ax * ax * ax;',
    'float ax = 1.0 - clamp((u_kinemeTime - u_break.y - a_inst4.w * 0.5 * per) / per, 0.0, 1.0);',
    'ae = ax * ax * ax;',
    'kOff = a_brk * (km.z * ae);',
  ])
    assert.ok(QUAD_VS.includes(line), line);
  const gate = QUAD_VS.indexOf('if (a_inst4.z > 0.5) {');
  const k7 = QUAD_VS.indexOf('else if (kind == 7) {');
  const k8 = QUAD_VS.indexOf('else if (kind == 8) {');
  const kb = QUAD_VS.indexOf('vec3 kb = u_kinemeB[');
  assert.ok(gate > 0 && gate < k7 && k7 < k8 && k8 < kb, 'inside the slot gate, after orbit, before the stack member');
  assert.ok(QUAD_VS.includes('kOff = a_brk * (km.z * es);'), 'scatter untouched');
  assert.ok(near(scatterPose(getKineme('scatter'), 0, 0.9, [10, 0]).dx, 0));
});

ok('the motion source: registered, kineme clock, rest with no trig, reads node.brk and node.trig', () => {
  const src = getMotionSource('kineme:assemble');
  assert.ok(src && src.family === 'kineme' && src.timeBase === 'kineme');
  const node = { key: 'p', seedOffset: 0, phase01: 0.37, brk: [100, 0] };
  assert.deepStrictEqual(src.evaluate(node, 3), { dx: 0, dy: 0 });
  const live = { ...node, trig: [BREAK_NEVER, 2] };
  assert.deepStrictEqual(src.evaluate(live, 2.9), assemblePose(asm, 2.9, 0.37, [100, 0], [BREAK_NEVER, 2]));
});

// ── the trigger fold ──────────────────────────────────────────────────
ok('fold: the first frame adopts the counters (a take opening at n is not displaced); null while idle', () => {
  const f = createBreakTrigger();
  assert.strictEqual(f.at({ out: 4, in: 9 }, 0), null);
  assert.strictEqual(f.at({ out: 4, in: 9 }, 0.5), null);
  assert.strictEqual(createBreakTrigger().at(undefined, 0), null);
});

ok('fold: a landing stamps the first frame it sees the counter move; several bumps in a frame are one', () => {
  const f = createBreakTrigger();
  f.at({ out: 0, in: 0 }, 1);
  assert.strictEqual(f.at({ out: 0, in: 0 }, 1.1), null);
  assert.deepStrictEqual(f.at({ out: 0, in: 3 }, 1.2), [BREAK_NEVER, 1.2], 'three bumps, one settle');
  assert.deepStrictEqual(f.at({ out: 0, in: 3 }, 1.7), [BREAK_NEVER, 1.2], 'the stamp holds');
  // a second landing mid-settle restarts the settle (the new picture arrives displaced)
  assert.deepStrictEqual(f.at({ out: 0, in: 4 }, 2.0), [BREAK_NEVER, 2.0]);
});

ok('fold: spent forgets — null once every piece is home, so the contract carries nothing again', () => {
  const f = createBreakTrigger();
  f.at({ out: 0, in: 0 }, 0);
  f.at({ out: 0, in: 1 }, 1);
  assert.ok(f.at({ out: 0, in: 1 }, 1 + BREAK_SETTLED_AFTER - 0.01));
  assert.strictEqual(f.at({ out: 0, in: 1 }, 1 + BREAK_SETTLED_AFTER), null);
  assert.strictEqual(f.at({ out: 0, in: 1 }, 99), null);
});

ok('fold: a hit scatters only pieces at home; a downbeat settles it; a stranded scatter settles itself', () => {
  const f = createBreakTrigger();
  f.at({ out: 0, in: 0 }, 0);
  assert.deepStrictEqual(f.at({ out: 1, in: 0 }, 2), [2, BREAK_NEVER]);
  // a second hit while out does not snap the pieces back to start a new flight
  assert.deepStrictEqual(f.at({ out: 2, in: 0 }, 2.5), [2, BREAK_NEVER]);
  assert.deepStrictEqual(f.at({ out: 2, in: 1 }, 3), [2, 3], 'the downbeat');
  // a hit during the settle is ignored too
  assert.deepStrictEqual(f.at({ out: 3, in: 1 }, 3.5), [2, 3]);
  // a stranded scatter (no clock, no downbeat) settles itself after HOLD_MAX
  const g = createBreakTrigger();
  g.at({ out: 0, in: 0 }, 0);
  g.at({ out: 1, in: 0 }, 1);
  assert.deepStrictEqual(g.at({ out: 1, in: 0 }, 1 + BREAK_HOLD_MAX - 0.01), [1, BREAK_NEVER]);
  assert.deepStrictEqual(g.at({ out: 1, in: 0 }, 1 + BREAK_HOLD_MAX), [1, 1 + BREAK_HOLD_MAX]);
  assert.strictEqual(BREAK_HOLD_MAX, 2 * PER);
});

ok('fold: time running backwards (a loop restart) rests everything; a snapshot replays identically', () => {
  const f = createBreakTrigger();
  f.at({ out: 0, in: 0 }, 5);
  f.at({ out: 0, in: 1 }, 6);
  assert.strictEqual(f.at({ out: 0, in: 1 }, 0.1), null, 'backwards: nothing live');
  const frames = [
    [{ out: 0, in: 1 }, 0.2],
    [{ out: 1, in: 1 }, 0.5],
    [{ out: 1, in: 2 }, 0.9],
    [{ out: 1, in: 2 }, 1.4],
    [{ out: 1, in: 2 }, 6],
  ];
  const snap = f.snapshotState();
  const a = frames.map(([s, t]) => f.at(s, t));
  const g = createBreakTrigger();
  g.restoreState(JSON.parse(JSON.stringify(snap)));
  const b = frames.map(([s, t]) => g.at(s, t));
  assert.deepStrictEqual(a, b, 'same recorded frames -> same stamps');
  assert.ok(a.some((x) => x !== null));
});

// ── the live driver ───────────────────────────────────────────────────
ok('driver: landings settle; a keep does not; one scatter per bar; the next downbeat settles; a restart clears', () => {
  const log = [];
  let landingCb = null;
  const stop = startBreak({
    bump: (w) => log.push(w),
    watchLanding: (cb) => {
      landingCb = cb;
      return () => (landingCb = null);
    },
  });
  const take = () => log.splice(0).join(',');
  emit(Events.KINETIC_TAP, {});
  emit(Events.LAYOUT_PRESET, 'x');
  emit(Events.LAYOUT_CURATE, {});
  landingCb();
  assert.strictEqual(
    take(),
    'in,in,in,in',
    'a Look landing (three press paths) and a chapter landing are each a settle',
  );
  emit(Events.AUDIO_ONSET, { strength: 0.79, band: 'low' });
  assert.strictEqual(take(), '', 'below the strength cutoff');
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  emit(Events.AUDIO_ONSET, { strength: 0.9, band: 'low' });
  emit(Events.AUDIO_ONSET, { strength: 1, band: 'high' });
  assert.strictEqual(take(), 'out', 'at most one scatter per bar');
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 });
  assert.strictEqual(take(), '', 'the same bar again is not the next downbeat');
  emit(Events.CLOCK_BAR, { bar: 5, bpm: 120 });
  assert.strictEqual(take(), 'in', 'the next downbeat reassembles');
  emit(Events.AUDIO_ONSET, { strength: 0.85 });
  assert.strictEqual(take(), 'out', 'a new bar allows a new scatter');
  emit(Events.CLOCK_BAR, { bar: 0, bpm: 120 });
  assert.strictEqual(take(), 'in', 'a restart settles what was left out');
  emit(Events.AUDIO_ONSET, { strength: 0.85 });
  assert.strictEqual(take(), 'out', 'and the bar count starts again (a scatter in bar 0 is allowed)');
  emit(Events.KEEP_ADD, {});
  assert.strictEqual(take(), '', 'a keep is not a trigger');
  stop();
  emit(Events.KINETIC_TAP, {});
  assert.strictEqual(take(), '', 'stopped');
  assert.strictEqual(landingCb, null);
});

// ── the contract and the pack ─────────────────────────────────────────
const item = (assetId, key) => ({
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
});
const contract = (doc, items) =>
  buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: [{ id: 'L', isFx: false, items }] });
const NONE = Object.fromEntries(flora.regions.map((r) => [r.id, null]));
const only = { regionKinemes: { [FLORA]: { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'assemble'])) } } };

ok(
  'contract: the stamps ride only for an assemble scene with a live trigger; otherwise the contract is what it was',
  () => {
    const live = contract({ ...only, kinemeTime: 3, kinemeBreak: [BREAK_NEVER, 2.5] }, [item(FLORA, 'a')]);
    assert.deepStrictEqual(live.kinemeBreak, [BREAK_NEVER, 2.5]);
    const slot = live.kinemes.findIndex((k) => k.kind === AS_KIND) + 1;
    assert.ok(slot > 0);
    assert.deepStrictEqual(live.kinemes[slot - 1], { kind: 8, period: 1.6, amp: 0.3 });
    for (const p of PETALS) assert.strictEqual(live.regionAnim.assets[FLORA][p], slot);
    const idle = contract({ ...only, kinemeTime: 3 }, [item(FLORA, 'a')]);
    assert.ok(!('kinemeBreak' in idle), 'no trigger: no key');
    const nul = contract({ ...only, kinemeTime: 3, kinemeBreak: null }, [item(FLORA, 'a')]);
    assert.deepStrictEqual(nul, idle, 'a null fold output is the idle contract, byte for byte');
    // a scene with no assemble region ignores a live trigger entirely
    const rock = { regionKinemes: { [FLORA]: { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'rock'])) } } };
    const withTrig = contract({ ...rock, kinemeTime: 3, kinemeBreak: [BREAK_NEVER, 2.5] }, [item(FLORA, 'a')]);
    assert.deepStrictEqual(withTrig, contract({ ...rock, kinemeTime: 3 }, [item(FLORA, 'a')]), 'hash and all');
    const bare = contract({ kinemeTime: 3, kinemeBreak: [BREAK_NEVER, 2.5] }, [item(FLORA, 'a')]);
    assert.ok(!('kinemeBreak' in bare));
    assert.ok(live.kinemes.length <= 16);
  },
);

const atlas = bakeAtlas([{ asset: FLORA, ink: INK, accent: ACC }]);
const cellsObj = Object.fromEntries(atlas.cells);
const frameOf = (c) => ({ motionTime: 0, shed: false, regions: c.regionAnim || null, kinemes: c.kinemes || null });
const tails = (packed) => {
  const out = [];
  for (let i = 0; i < packed.length / INSTANCE_STRIDE; i++)
    out.push([...packed.subarray(i * INSTANCE_STRIDE + 49, (i + 1) * INSTANCE_STRIDE)]);
  return out;
};

ok(
  'pack: an assemble region carries the SAME break-up vector scatter does; nothing else does; frozen carries none',
  () => {
    const sc = { regionKinemes: { [FLORA]: { ...NONE, ...Object.fromEntries(PETALS.map((p) => [p, 'scatter'])) } } };
    const cA = contract({ ...only, kinemeTime: 0 }, [item(FLORA, 'a')]);
    const cS = contract({ ...sc, kinemeTime: 0 }, [item(FLORA, 'a')]);
    const tA = tails(packInstanceData([{ ...cA.instances[0], rotation: 30 }], cellsObj, 1, frameOf(cA)));
    const tS = tails(packInstanceData([{ ...cS.instances[0], rotation: 30 }], cellsObj, 1, frameOf(cS)));
    assert.deepStrictEqual(tA, tS, 'one vector, two kinds');
    assert.deepStrictEqual(tA[0], [0, 0], 'the remainder carries none');
    assert.ok(
      tA.some((v) => v[0] !== 0 || v[1] !== 0),
      'the petals carry a direction x box',
    );
    for (const gov of [{ perfTier1: true, quality: 'performance' }, { reducedMotion: true }]) {
      const c = contract({ ...only, ...gov, kinemeTime: 0, kinemeBreak: [BREAK_NEVER, 0] }, [item(FLORA, 'a')]);
      assert.strictEqual(c.regionAnim.budget, 0);
      for (const t of tails(packInstanceData([c.instances[0]], cellsObj, 1, frameOf(c))))
        assert.deepStrictEqual(t, [0, 0]);
    }
    const geo = 'geo_tri_01';
    const cg = contract(
      { regionKinemes: { [geo]: { nope: 'assemble' } }, kinemeTime: 0, kinemeBreak: [BREAK_NEVER, 0] },
      [item(geo, 'a')],
    );
    assert.ok(!('regionAnim' in cg) && !('kinemeBreak' in cg), 'an untagged mark is untouched');
  },
);

// ── GPU: real WebGL2 through the parity driver ────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  try {
    const shot = async (doc) =>
      (await renderViaGL(contract(doc, [item(FLORA, 'solo')]), { width: 400, height: 280, bg: '#000000' })).pixels;
    const diffPx = (a, b) => {
      let k = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++;
      }
      return k;
    };
    const frozen = await shot({ ...only, kinemeTime: 0, perfTier1: true, quality: 'performance' });
    const idle = await shot({ ...only, kinemeTime: 0 });
    assert.strictEqual(
      Buffer.compare(idle, frozen),
      0,
      'assemble with no trigger at t = 0 is byte-identical to the frozen render',
    );
    const idleLate = await shot({ ...only, kinemeTime: 37 });
    assert.strictEqual(Buffer.compare(idleLate, frozen), 0, 'no trigger is rest at ANY time');
    const landing = await shot({ ...only, kinemeTime: 5, kinemeBreak: [BREAK_NEVER, 5] }); // the landing frame
    const out = diffPx(frozen, landing);
    assert.ok(out > 200, `the landing frame is displaced: ${out} px`);
    const mid = await shot({ ...only, kinemeTime: 5.5, kinemeBreak: [BREAK_NEVER, 5] });
    const midPx = diffPx(frozen, mid);
    assert.ok(midPx > 0 && midPx < out, `mid-settle is between: ${midPx} px`);
    const home = await shot({ ...only, kinemeTime: 5 + BREAK_SETTLED_AFTER, kinemeBreak: [BREAK_NEVER, 5] });
    assert.strictEqual(Buffer.compare(home, frozen), 0, 'settled is byte-identical to rest');
    const hit = await shot({ ...only, kinemeTime: 8, kinemeBreak: [7, BREAK_NEVER] });
    assert.ok(diffPx(frozen, hit) > 200, 'an audio hit holds the pieces out');
    console.log(
      `kinemeAssemble GPU: OK — landing ${out} px displaced, mid ${midPx}; idle == frozen; settled == frozen`,
    );
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser assemble tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log(`kinemeAssemble.selfcheck: ${n} ok`);
