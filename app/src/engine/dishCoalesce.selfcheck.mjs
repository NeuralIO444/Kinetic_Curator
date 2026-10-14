// node src/engine/dishCoalesce.selfcheck.mjs
//
// Petri dish B2 (#1411) — coalescence: the law in dishCoalesce.mjs, pinned.
//
//   (a) a resting same-family pair merges on the closed-form dwell law:
//       no factor below the gate, a linear ramp past it, the field at
//       the contact midpoint with radius from the pair's discs — and a
//       brief touch never merges at all;
//   (b) separation breaks the merge cleanly: the factor drains by the
//       named rate and the pair is forgotten; a far separation composes
//       no field at all (a membrane cannot span a gap);
//   (c) physics byte-identity: coalescence on vs off, same seeded run,
//       every position/velocity bit equal — the merge is a finish, not
//       a force (B1's proof shape);
//   (d) reduced-motion: no field ever renders, while the dwell state
//       tracks underneath and the physics is untouched;
//   (e) different families never merge: two strata in sustained
//       cross-contact (the dish pass really resolves them) accrue no
//       dwell and compose no fields, while a within-family pair in the
//       same harness merges;
//   (f) the governor rung: cost tier 1, shed at contract build the
//       moment tier 1 is gone (any quality) — stills/exports never
//       shed; the contract omits the key when nothing merges, so
//       unmerged contracts (and hashes) are unchanged;
//   (g) bake equals live: the fields are a pure function of (seed,
//       params, steps) — two identical runs agree bit for bit;
//   (h) the render path is wired: resolver → contract → finish pass.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import {
  feedDishCoalesce, stepDishCoalesce, coalescenceFields, coalesceFactor,
  COALESCE_DWELL_GATE, COALESCE_RAMP_STEPS, COALESCE_DRAIN_PER_STEP,
  COALESCE_FIELD_RADIUS_K, COALESCE_MAX_FIELDS,
} from './dishCoalesce.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { buildSceneContract, dishCoalesceShed, assertSceneContract } from '../gl/sceneContract.js';
import { COALESCE_FS, COALESCE_THRESHOLD, COALESCE_FINISH_MAX_FIELDS } from '../gl/coalesceFinish.mjs';
import { getCostTier, tier1ShedIds } from '../gl/costTiers.mjs';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// The resting-pair harness (B1's (a) idiom): discs r=20 overlapping by
// 10, at rest, mode 'none' — depenetration parks them exactly at the
// disc sum after one pass, where the near-touch rule keeps the contact
// "sustained" without strobing. One pass + one step = one engine step.
const CTX = {
  radius: 20, restitution: 1, repel: 0, mode: 'none', umask: 0xffffffff,
  breedCap: 10, seed: SEED, organism: false,
  minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
};
const restingPair = () => {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = 0; sys.vy[0] = 0; sys.vx[1] = 0; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
  sys.color[0] = '#ff0000'; sys.color[1] = '#00ff00';
  sys._layout = { contactRadius: 20 };
  return sys;
};
const stepPair = (sys) => { sys._contactPass(CTX); stepDishCoalesce(sys, {}); };

// (a) — the dwell law, closed form.
{
  const sys = restingPair();
  stepPair(sys);
  assert.ok(Object.is(sys.x[0], 395) && Object.is(sys.x[1], 435),
    'depenetration parks the resting pair exactly at the disc sum');
  for (let k = 2; k <= COALESCE_DWELL_GATE; k++) stepPair(sys);
  assert.deepStrictEqual(coalescenceFields(sys), [],
    `no merge at the gate (${COALESCE_DWELL_GATE} steps): dwell-gated, not per-frame`);
  stepPair(sys); // dwell = gate + 1
  let f = coalescenceFields(sys);
  assert.strictEqual(f.length, 1, 'the step past the gate composes one field');
  assert.ok(Math.abs(f[0].f - 1 / COALESCE_RAMP_STEPS) < EPS, `ramp starts at 1/${COALESCE_RAMP_STEPS}: ${f[0].f}`);
  assert.ok(Object.is(f[0].x, 415) && Object.is(f[0].y, 350), 'the field sits at the contact midpoint');
  assert.strictEqual(f[0].tint, '#808000', 'the tint is the pair colours averaged');
  for (let k = COALESCE_DWELL_GATE + 2; k < COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS; k++) stepPair(sys);
  f = coalescenceFields(sys);
  assert.ok(Math.abs(f[0].f - (COALESCE_RAMP_STEPS - 1) / COALESCE_RAMP_STEPS) < EPS, 'ramp is linear in dwell');
  stepPair(sys); // dwell = gate + ramp
  f = coalescenceFields(sys);
  assert.ok(Object.is(f[0].f, 1), 'full merge at gate + ramp steps');
  assert.ok(Math.abs(f[0].r - 20 * COALESCE_FIELD_RADIUS_K) < EPS,
    `field radius from the pair's discs: ${f[0].r}`);
  assert.ok(Object.is(coalesceFactor(COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS), 1), 'closed form agrees');

  // a brief touch never merges: 10 steps of contact, then apart.
  const brief = restingPair();
  for (let k = 0; k < 10; k++) stepPair(brief);
  brief.x[1] = 900;
  for (let k = 0; k < 30; k++) stepPair(brief);
  assert.deepStrictEqual(coalescenceFields(brief), [], 'a glancing touch leaves no membrane');
  assert.strictEqual(brief._coalesce.pairs.size, 0, 'the brief pair is forgotten');
}

// (b) — separation breaks the merge within a beat, by the drain law.
{
  const sys = restingPair();
  for (let k = 0; k < COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS; k++) stepPair(sys);
  assert.ok(Object.is(coalescenceFields(sys)[0].f, 1), 'fixture: fully merged');
  sys.x[1] = sys.x[0] + 43; // beyond the touch tolerance (42.4), inside the gap limit (44)
  let prev = 1;
  for (let k = 1; k <= 7; k++) {
    stepPair(sys);
    const f = coalescenceFields(sys);
    assert.strictEqual(f.length, 1, `apart step ${k}: the membrane fades, not pops`);
    const expected = coalesceFactor(54 - k * COALESCE_DRAIN_PER_STEP);
    assert.ok(Math.abs(f[0].f - expected) < EPS, `apart step ${k}: factor drains by the law (${f[0].f} vs ${expected})`);
    assert.ok(f[0].f < prev, 'the fade is monotone');
    prev = f[0].f;
  }
  stepPair(sys); // dwell 22 — below the gate
  assert.deepStrictEqual(coalescenceFields(sys), [], 'two clean discs again within a beat (8 steps)');
  for (let k = 9; k <= 13; k++) stepPair(sys);
  assert.strictEqual(sys._coalesce.pairs.size, 1, 'the drained pair is still tracked at dwell 2');
  stepPair(sys); // dwell <= 0
  assert.strictEqual(sys._coalesce.pairs.size, 0, 'and forgotten at zero');

  // a far separation composes nothing, even at full dwell.
  const far = restingPair();
  for (let k = 0; k < COALESCE_DWELL_GATE + COALESCE_RAMP_STEPS; k++) stepPair(far);
  far.x[1] = 900;
  stepPair(far);
  assert.deepStrictEqual(coalescenceFields(far), [], 'no field spans a wide gap');
}

// Seeded full-update harness for (c), (d), (g). 'stick' (restitution 0)
// so bodies genuinely come to rest against each other and merge.
const lpSwarm = (over = {}) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 90,
  contactRadius: 26, contactMode: 'stick', contactRestitution: 0.6,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over,
});
const runSys = (lp, steps, extra = {}) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, SEED, null, { graze: lp.graze || 0 });
  let maxFields = 0;
  let fieldsEveryStep = true;
  const fieldTrail = [];
  for (let s = 0; s < steps; s++) {
    sys.update({ ...lp, maxParticles: 200, ...extra }, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    const n = coalescenceFields(sys).length;
    if (n > maxFields) maxFields = n;
    if (n === 0) fieldsEveryStep = false;
    fieldTrail.push(coalescenceFields(sys).map((f) => ({ ...f })));
  }
  return { sys, maxFields, fieldsEveryStep, fieldTrail };
};
const assertSamePhysics = (a, b, label) => {
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[fld][i], b[fld][i]), `${label}: ${fld}[${i}] ${a[fld][i]} vs ${b[fld][i]}`);
    }
  }
};

// (c) — physics byte-identity, coalescence on vs off.
{
  const on = runSys(lpSwarm(), 90);
  const off = runSys(lpSwarm(), 90, { coalesce: false });
  assert.ok(on.maxFields > 0, 'the on run actually merged (the comparison is not vacuous)');
  assert.strictEqual(off.maxFields, 0, 'the off run never composes a field');
  assertSamePhysics(on.sys, off.sys, 'coalescence on == off');
  assert.deepStrictEqual(on.sys.getItems(assets), off.sys.getItems(assets),
    'items are identical: the merge adds no item state, only layer fields');
}

// (d) — reduced-motion: nothing renders, the state tracks, physics same.
{
  const on = runSys(lpSwarm(), 90);
  const rm = runSys(lpSwarm(), 90, { reducedMotion: true });
  assert.strictEqual(rm.maxFields, 0, 'reduced-motion renders no membrane at any step');
  assert.ok(rm.sys._coalesce && rm.sys._coalesce.pairs.size > 0,
    'the dwell state still tracks underneath the stillness');
  assertSamePhysics(on.sys, rm.sys, 'reduced-motion == full motion, physically');
}

// (e) — different families never merge (v1 family = the stratum).
{
  const A = restingPair();
  const B = new ParticleSystem();
  B.init(2, 1000, 700, assets, palette, SEED);
  B.x[0] = 415; B.y[0] = 382; B.x[1] = 900; B.y[1] = 100;
  B.vx[0] = 0; B.vy[0] = 0; B.vx[1] = 0; B.vy[1] = 0;
  B.mass[0] = 1; B.mass[1] = 1; B.scale[0] = 1; B.scale[1] = 1;
  B._layout = { contactRadius: 20 };
  const ses = createDishSession();
  enrolDishBody(ses, { key: 'A', sys: A, radius: 20, restitution: 0.5, contactMode: 'none', umask: 0xffffffff, organism: false });
  enrolDishBody(ses, { key: 'B', sys: B, radius: 20, restitution: 0.5, contactMode: 'none', umask: 0xffffffff, organism: false });
  armDish(ses, ['A', 'B']);
  const b0 = [B.x[0], B.y[0]];
  for (let k = 0; k < 60; k++) {
    A._contactPass(CTX);
    B._contactPass(CTX);
    runDishContacts(ses, A);
    stepDishCoalesce(A, {});
    stepDishCoalesce(B, {});
  }
  assert.ok(B.x[0] !== b0[0] || B.y[0] !== b0[1],
    'the cross-strata contact really resolved (B0 was depenetrated) — the test is not vacuous');
  const fa = coalescenceFields(A);
  assert.strictEqual(fa.length, 1, 'the within-family pair merged');
  assert.ok(Math.abs(fa[0].x - 415) < 2 && Math.abs(fa[0].y - 350) < 2,
    'the only field is the A–A seam');
  assert.deepStrictEqual(coalescenceFields(B), [], 'stratum B composes no fields');
  assert.strictEqual(B._coalesce ? B._coalesce.pairs.size : 0, 0,
    'sustained cross-family contact accrued no dwell anywhere');
}

// (f) — the governor rung + the contract.
{
  const decl = getCostTier('engine/dish-coalesce');
  assert.ok(decl, 'coalescence cost tier registered');
  assert.strictEqual(decl.tier, 1, 'coalescence sheds with the FX finishes (tier 1, first on the ladder)');
  assert.ok(tier1ShedIds().includes('engine/dish-coalesce'), 'the tier-1 shed set names it');
  assert.strictEqual(dishCoalesceShed({ perfTier1: true, quality: 'balanced' }), true, 'shed: tier 1 gone, any quality');
  assert.strictEqual(dishCoalesceShed({ perfTier1: true, quality: 'performance' }), true, 'shed: tier 1 gone at PERF too');
  assert.strictEqual(dishCoalesceShed({ perfTier1: false, quality: 'performance' }), false, 'no shed: tier 1 still on');
  assert.strictEqual(dishCoalesceShed({}), false, 'no shed: a still/export doc carries no governor state');

  const field = { x: 415.1234, y: 350, r: 12, f: 0.5, tint: '#808000' };
  const rl = [{
    id: 'sw', layer: { name: 'SW' }, layerOpacity: 1, layerBlendMode: 'normal',
    layoutParams: { blendMode: 'normal' }, items: [], coalesce: [field],
  }];
  const docFor = (over = {}) => ({
    seed: 7, quality: 'balanced',
    layers: [{ id: 'sw', name: 'SW', type: 'content', visible: true }],
    ...over,
  });
  const live = buildSceneContract({ doc: docFor(), resolvedLayers: rl, caps: null });
  assert.deepEqual(live.layers[0].coalesce, [{ x: 415.123, y: 350, r: 12, f: 0.5, tint: '#808000' }],
    'contract carries the field, 3-place rounded');
  assert.doesNotThrow(() => assertSceneContract(live));
  const shed = buildSceneContract({ doc: docFor({ perfTier1: true }), resolvedLayers: rl, caps: null });
  assert.ok(!('coalesce' in shed.layers[0]), 'tier-1 shed drops the fields, keeps the layer');
  const plain = buildSceneContract({
    doc: docFor(), caps: null,
    resolvedLayers: [{ id: 'sw', layer: { name: 'SW' }, layerOpacity: 1, layerBlendMode: 'normal', layoutParams: { blendMode: 'normal' }, items: [] }],
  });
  assert.ok(!('coalesce' in plain.layers[0]), 'no merge, no key — the unmerged contract is unchanged');

  // sanitization: junk drops, a factor that rounds to rest drops, the cap holds.
  const messy = buildSceneContract({
    doc: docFor(), caps: null,
    resolvedLayers: [{
      ...rl[0],
      coalesce: [
        { x: NaN, y: 1, r: 5, f: 0.5, tint: '#808000' },
        { x: 1, y: 1, r: 5, f: 0.0004, tint: '#808000' },
        { x: 1, y: 1, r: 5, f: 0.5, tint: 'red' },
        ...Array.from({ length: COALESCE_MAX_FIELDS + 5 }, (_, i) => ({ x: i, y: i, r: 5, f: 0.5, tint: '#808000' })),
      ],
    }],
  });
  assert.strictEqual(messy.layers[0].coalesce.length, COALESCE_MAX_FIELDS, 'fields capped, junk dropped');
  assert.doesNotThrow(() => assertSceneContract(messy));
  assert.throws(() => assertSceneContract({
    ...live, layers: [{ ...live.layers[0], coalesce: [{ x: 1, y: 1, r: 5, f: 0, tint: '#808000' }] }],
  }), /coalesce field f/, 'a zero factor is not a valid contract field');
  assert.throws(() => assertSceneContract({
    ...live, layers: [{ ...live.layers[0], coalesce: [{ x: 1, y: 1, r: 5, f: 0.5, tint: '#fff' }] }],
  }), /tint/, 'a non-hex tint is not a valid contract field');
}

// (g) — bake equals live: identical runs, identical fields, every step.
{
  const a = runSys(lpSwarm(), 90);
  const b = runSys(lpSwarm(), 90);
  assert.deepStrictEqual(a.fieldTrail, b.fieldTrail,
    'the field trail is a pure function of (seed, params, steps)');
  assertSamePhysics(a.sys, b.sys, 'deterministic run');
}

// (h) — the render path is wired end to end (source pins, the B1 habit).
{
  const renderer = readFileSync(new URL('../gl/renderer.mjs', import.meta.url), 'utf8');
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  assert.ok(renderer.includes('createCoalesceFinish') && renderer.includes('layer.coalesce'),
    'the renderer runs the finish on layers carrying fields');
  assert.ok(resolve.includes('coalescenceFields'), 'the resolver forwards the system fields');
  assert.ok(particles.includes('feedDishCoalesce(this, i, j)') && particles.includes('stepDishCoalesce(this'),
    'particles.js takes the feed + step call sites only');
  assert.ok(COALESCE_FS.includes('u_fields') && COALESCE_FS.includes('u_colors'),
    'the finish shader reads the field + tint arrays');
  assert.ok(COALESCE_THRESHOLD > 0 && COALESCE_THRESHOLD < 1, 'the threshold blend is a real threshold');
  assert.strictEqual(COALESCE_FINISH_MAX_FIELDS, COALESCE_MAX_FIELDS,
    'the finish uniform array and the contract cap are the same count');
  assert.ok(!particles.includes('coalesceFactor'), 'the law stays in the module, not the integrator');
  assert.strictEqual(typeof feedDishCoalesce, 'function');
}

console.log('dishCoalesce.selfcheck: OK (#1411 — dwell-gated closed form, clean break, physics byte-identity, reduced-motion rest, family gate, tier-1 shed, bake=live, finish wiring)');
