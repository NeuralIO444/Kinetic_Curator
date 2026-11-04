// beastRoam.selfcheck.mjs — #1867 (BEAST S4): the travelling home.
//
//   motor       the stance stroke is the ONLY motion source: switch the advance off and the beast walks in place, its crank
//               still turning; the body's speed IS the stance foot's backward speed (stroke ÷ stance time)
//   planted     in a straight walk the stance foot does not move over the ground
//   steering    the heading is exactly (stride ÷ track) × (phaseA − phaseB): differential phase alone; no differential, no turn
//   standing    a stopped crank is a standing beast (pause = no motion, no phase)
//   bounds      a roam stays inside the dish, whichever seed, however long
//   replay      the route is a pure function: same answers in any order of asking, and under a new seed it differs
//   contract    through the real expansion: the beast travels, frozen is home at rest, the A/B switch walks it in place
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateGenome } from './jansenSolver.js';
import { wildTypeMeasures } from './jansenMeasures.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { poseLinkage, strideTileUnits, LINKAGE_TILE_K, LINKAGE_CRANK_HZ } from './beastRig.js';
import { roamAt, sanitizeRoam, BEAST_ROAM } from './beastRoam.js';
import { expandCreatureInstances } from './creatureRig.js';

const wild = sanitizeMeasures(wildTypeMeasures());
const ev = evaluateGenome(wild, wild.scale);
const stride = strideTileUnits(wild);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const spec = (key, params = {}) => ({ seedKey: key, stride, params: sanitizeRoam(params) });

near(stride, (ev.step / ev.duty) * LINKAGE_TILE_K, 1e-9, 'the stride is the stance stroke over the stance share');

// ---- the motor
{
  const walk = spec('m', { turnGain: 0, pauseChance: 0 }); // straight, no pauses: a clean line
  const a = roamAt(walk, 3);
  const b = roamAt(walk, 4);
  near(b.x - a.x, stride * LINKAGE_CRANK_HZ, 1e-6, 'speed = stance stroke ÷ stance time (stride × crank rate)');
  near(b.y - a.y, 0, 1e-9, 'straight');
  const inPlace = spec('m', { advance: 0, turnGain: 0 });
  for (const t of [0, 1, 7, 33, 120]) {
    const s = roamAt(inPlace, t);
    assert.ok(s.x === 0 && s.y === 0 && s.heading === 0, `advance off: the beast stays home (t=${t})`);
  }
  assert.ok(roamAt(inPlace, 33).phaseA > 5, 'advance off: the crank still turns — it walks in place');
}

// ---- the stance foot is planted against the ground
{
  const walk = spec('p', { turnGain: 0, pauseChance: 0 });
  const k = LINKAGE_TILE_K;
  let low = -Infinity;
  const foot = [];
  for (let i = 0; i < 400; i++) {
    const t = 20 + i * 0.0139; // one crank turn (≈5.5 s)
    const r = roamAt(walk, t);
    const pose = poseLinkage({ measures: wild, phase: 0 }, t, 1, { a: r.phaseA, b: r.phaseB });
    const f = pose.find((p) => p.id === '0:h');
    foot.push({ x: f.tx + r.x, y: f.ty, rel: f.tx });
    low = Math.max(low, f.ty);
  }
  const stance = foot.filter((f) => f.y >= low - 0.3);
  assert.ok(stance.length > 20, 'a stance window exists');
  const worldRange = Math.max(...stance.map((f) => f.x)) - Math.min(...stance.map((f) => f.x));
  const relRange = Math.max(...stance.map((f) => f.rel)) - Math.min(...stance.map((f) => f.rel));
  assert.ok(relRange > 0.5 * ev.step * k, `the foot moves under the body in stance (${relRange})`);
  assert.ok(worldRange < 0.25 * relRange, `…and not over the ground: world ${worldRange} vs body-relative ${relRange}`);
}

// ---- steering is differential phase, and nothing else
{
  const sp = spec('s');
  const g = stride / sp.params.trackUnits;
  let turned = 0;
  for (let t = 0; t < 600; t += 0.37) {
    const s = roamAt(sp, t);
    near(s.heading, g * (s.phaseA - s.phaseB), 1e-7, `heading = (stride ÷ track) × Δphase at t=${t}`);
    if (Math.abs(s.phaseA - s.phaseB) > 0.05) turned++;
  }
  assert.ok(turned > 100, 'the banks do part company: it steers');
  const straight = spec('s', { turnGain: 0 });
  for (let t = 0; t < 600; t += 1.3) {
    const s = roamAt(straight, t);
    assert.ok(s.heading === 0 && s.phaseA === s.phaseB, 'no differential, no turn');
  }
}

// ---- the banks show it in the legs: bank A (even legs) rides phaseA, bank B (odd legs) phaseB
{
  const sp = spec('s');
  let t = 0;
  while (t < 600 && Math.abs(roamAt(sp, t).phaseA - roamAt(sp, t).phaseB) < 0.3) t += 0.25;
  assert.ok(t < 600, 'a turn with a visible phase gap exists');
  const r = roamAt(sp, t);
  const lk = { measures: wild, phase: 0 };
  const foot = (crank, leg) => poseLinkage(lk, 0, 1, crank).find((p) => p.id === `${leg}:h`);
  const split = { a: r.phaseA, b: r.phaseB };
  const even = { a: r.phaseA, b: r.phaseA };
  assert.deepEqual(foot(split, 0), foot(even, 0), 'an even leg follows bank A');
  assert.notDeepEqual(foot(split, 1), foot(even, 1), 'an odd leg follows bank B, which has drifted');
}

// ---- a stopped crank is a standing beast
{
  const sp = spec('z', { pauseChance: 1 });
  let found = 0;
  for (let t = 0; t < 400 && found < 5; t += 0.5) {
    const s = roamAt(sp, t);
    if (s.moving) continue;
    const later = roamAt(sp, t + 0.2);
    if (later.moving) continue;
    found++;
    assert.ok(later.x === s.x && later.y === s.y && later.phaseA === s.phaseA, 'paused: no travel, no crank');
  }
  assert.ok(found >= 3, 'pauses happen');
}

// ---- bounds: the dish holds the beast
{
  const R = BEAST_ROAM.radius;
  const turningCircle = BEAST_ROAM.trackUnits / (2 * BEAST_ROAM.turnGain);
  let worst = 0;
  for (let k = 0; k < 24; k++) {
    const sp = spec(`b${k}`);
    for (let t = 0; t < 900; t += 0.5) {
      const s = roamAt(sp, t);
      worst = Math.max(worst, Math.hypot(s.x, s.y));
    }
  }
  assert.ok(worst <= R + 2.5 * turningCircle, `bounded: worst reach ${worst} of range ${R}`);
  assert.ok(worst > 0.6 * R, `and it does use its range (${worst})`);
  // a hold that would carry it straight out is cut at the edge: 20 crank turns is ~470 units, the range is 150
  const bold = spec('edge', { wander: 0, holdMin: 20, holdMax: 20, pauseChance: 0 });
  let far = 0;
  for (let t = 0; t < 900; t += 0.5) far = Math.max(far, Math.hypot(roamAt(bold, t).x, roamAt(bold, t).y));
  assert.ok(far <= R + 2.5 * turningCircle, `a long hold is cut at the edge: reach ${far}`);
}

// ---- replay: pure in (seed, key, t)
{
  const ts = Array.from({ length: 300 }, (_, i) => i * 1.7);
  const hash = (order) =>
    createHash('sha256')
      .update(JSON.stringify(order.map((t) => [t, roamAt(spec('r'), t)]).sort((a, b) => a[0] - b[0])))
      .digest('hex');
  assert.equal(hash(ts), hash([...ts].reverse()), 'the order of asking does not matter');
  assert.deepEqual(roamAt(spec('r'), 99.9), roamAt(spec('r'), 99.9));
  assert.notDeepEqual(roamAt(spec('r'), 200), roamAt(spec('r2'), 200), 'another beast roams another way');
  const j = sanitizeRoam({ turnGain: 9, holdMin: -3, radius: 'x', junk: 1, advance: 0.5 });
  assert.ok(
    j.turnGain === 1 && j.holdMin >= 0.25 && j.radius === BEAST_ROAM.radius && j.advance === 0.5 && !('junk' in j),
  );
}

// ---- the contract's expansion
{
  const rec = { category: 'creature', source: 'wetlab', rig: { body: '', linkage: { measures: wild, phase: 0 } } };
  const overlay = new Map([['user:beast', rec]]);
  const stage = ['geo_tri_02', 'org_petal_01', 'flora_flower_01'];
  const inst = (asset, key, x) => ({
    asset,
    key,
    x,
    y: 300,
    scaleX: 3,
    scaleY: 3,
    rotation: 0,
    opacity: 1,
    seedOffset: 0,
  });
  const scene = [...stage.map((id, i) => inst(id, `s${i}`, 60 + i * 150)), inst('user:beast', 'b', 400)];
  const at = (t, extra = {}) => {
    const out = expandCreatureInstances(scene, overlay, { seed: 7, t, ...extra });
    const parts = out.filter((i) => i.key.startsWith('b#'));
    const beam = parts.find((p) => p.key === 'b#beam');
    return { parts, beam, out };
  };
  const walkOpts = { beastRoam: { pauseChance: 0 } };
  const t0 = at(0, walkOpts);
  const t30 = at(30, walkOpts);
  const travelled = Math.hypot(t30.beam.x - t0.beam.x, t30.beam.y - t0.beam.y);
  assert.ok(travelled > 100, `the beast travels over 30 s: ${travelled}px`);
  assert.equal(t30.parts.length, t0.parts.length, 'same body');
  {
    // in a turn the banks are out of step, and the expansion draws them so: leg 1's foot bar, relative to its own hub bar,
    // is the pose the BANK-B phase makes (not the clock's)
    const sp = { seedKey: `7|user:beast|b`, stride, params: sanitizeRoam(walkOpts.beastRoam) };
    let tt = 0;
    while (tt < 600 && Math.abs(roamAt(sp, tt).phaseA - roamAt(sp, tt).phaseB) < 0.3) tt += 0.25;
    assert.ok(tt < 600);
    const r = roamAt(sp, tt);
    const got = at(tt, walkOpts).parts;
    const c = Math.cos(-r.heading);
    const sn = Math.sin(-r.heading);
    const rel = (parts, a, b) => {
      const pa = parts.find((p) => p.key === `b#${a}`);
      const pb = parts.find((p) => p.key === `b#${b}`);
      const dx = (pb.x - pa.x) / 3;
      const dy = (pb.y - pa.y) / 3;
      return { x: dx * c - dy * sn, y: dx * sn + dy * c };
    };
    // each copy's crank starts at its own phase (a herd never steps in unison): FNV-1a over `lois|key|seedOffset`
    let h = 0x811c9dc5;
    for (const ch of 'lois|b|0') h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    const model = poseLinkage({ measures: wild, phase: h / 4294967296 }, 0, 1, { a: r.phaseA, b: r.phaseB });
    const mid = (id) => {
      const p = model.find((q) => q.id === id);
      return { x: (p.x + p.tx) / 2, y: (p.y + p.ty) / 2 };
    };
    const want = { x: mid('1:h').x - mid('1:crank').x, y: mid('1:h').y - mid('1:crank').y };
    const have = rel(got, '1:crank', '1:h');
    // the part is dealt per bar name, so parts sit on bone midpoints exactly as the pose says
    near(have.x, want.x, 0.05, 'leg 1 foot bar x follows bank B');
    near(have.y, want.y, 0.05, 'leg 1 foot bar y follows bank B');
  }
  const frozen = at(30, { ...walkOpts, frozen: true });
  const home = at(0, { ...walkOpts, frozen: true });
  assert.deepEqual(frozen.out, home.out, 'frozen: home, at rest');
  const off = (t) => at(t, { beastRoam: false });
  near(off(30).beam.x, off(0).beam.x, 1e-6, 'switch off: walks in place');
  near(off(30).beam.y, off(0).beam.y, 1e-6, 'switch off: walks in place');
  const zero = at(0, { beastRoam: false }).out;
  assert.deepEqual(zero, at(0, walkOpts).out, 'at t=0 the roam is exactly the S3b pose');
  const mirror = (t) => {
    const sc = scene.map((i) => (i.key === 'b' ? { ...i, scaleX: -3 } : i));
    return expandCreatureInstances(sc, overlay, { seed: 7, t, ...walkOpts }).find((p) => p.key === 'b#beam');
  };
  assert.ok(mirror(30).x < mirror(0).x - 100 || mirror(30).x > mirror(0).x + 100, 'a mirrored beast travels too');
  assert.ok(mirror(30).x !== t30.beam.x, 'mirrored: the other way');
}

console.log('beastRoam.selfcheck: ok');
