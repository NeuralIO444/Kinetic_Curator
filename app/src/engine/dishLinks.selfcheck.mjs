// node src/engine/dishLinks.selfcheck.mjs
//
// Petri dish D3 (#1597) — constraints: declared distance /
// spring links between a system's own discs, solved by XPBD
// inside the custom integrator (solver ruled by Matt
// 2026-10-16; the law and the ruling record live in
// dishLinks.mjs). This suite pins the issue's ACCEPTANCE:
//
//   (a) the leaf: the compliance algebra (stiffness 1 → α 0,
//       the (1 − s)/s form closed-form), the XPBD λ update
//       (rigid / spring / converged fixed point), α̃ = α/h²,
//       and the declaration gate (what survives
//       resolveDishLinks and what is skipped, in order).
//   (b) the solve, called directly on predicted positions: a
//       hard link projects a stretched pair exactly onto its
//       rest and folds Δx/h into velocity (momentum conserved);
//       masses split the projection by their inverse shares; a
//       spring converges to its XPBD residual C·α̃/(wSum + α̃)
//       and stops there; a satisfied link is a bit-exact no-op
//       EVEN with separating velocities (position-level law —
//       the answer arrives through integration + fold, proven
//       in (c)); coincident endpoints take the golden-angle
//       axis; the spin columns are bit-untouched; a 3-body
//       chain converges across the fixed iteration count.
//   (c) full updates — the acceptance probes proper:
//       · a linked pair holds its distance through a seeded
//         collision within the STATED TOLERANCE (below); the
//         unlinked control pair does not hold it.
//       · a compound (3 discs, 3 links) keeps its shape
//         through a wet scramble and relaxes back to its rests.
//       · determinism: the scramble repeats bit for bit, and
//         live-stepped vs baked fields are identical.
//       · no-link parity: absent vs empty vs junk-only
//         declarations are bit-identical through full updates.
//   (e) bond formation (ruled by Matt 2026-10-16): grip dwell
//       accrues in step units with a grace window; at
//       BOND_FORM_STEPS the pair hardens, rest latched at
//       formation; the formed bond solves like a declared
//       rigid link, stands down to a declaration, drops on a
//       dead endpoint, and tears at BOND_BREAK_STRAIN of
//       predicted strain. Dry scenes never allocate the state.
//   (d) wiring: the call site sits after the integration loop
//       (XPBD projects PREDICTED positions), gated on the dish
//       + a declaration; the leaf is clock- and dice-free; the
//       suite is manifest-registered.
//
// STATED TOLERANCE (the issue asks for one): the collision
// probe's shove is positional (depenetration fires in the
// contact passes, before the solve, in both engines), so the
// tolerance is a RECOVERY tolerance: after a 22 px overlap
// shove the linked pair is back within 2 px of rest by the
// end of the run, while the unlinked control keeps the
// displacement (≥ 6 px, and ≥ 3× the linked figure). The
// compound, dropped in scrambled (worst link 84 px out, one
// pair overlapping wet), is within 12 px of shape by step 30,
// holds within 4 px wet, and relaxes to within 1 px dry.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import {
  LINK_ITERATIONS, LINK_COMPLIANCE,
  BOND_FORM_STEPS, BOND_GRACE_STEPS, BOND_TOUCH, BOND_GRIP_VT, BOND_BREAK_STRAIN,
  linkCompliance, linkDeltaLambda, resolveDishLinks, solveDishLinks, noteBondGrip,
} from './dishLinks.mjs';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-9;

const mkSys = (n, w = 2000, h = 1400) => {
  const sys = new ParticleSystem();
  sys.init(n, w, h, assets, palette, SEED);
  for (let i = 0; i < n; i++) { sys.mass[i] = 1; sys.scale[i] = 1; }
  return sys;
};
const place = (sys, i, x, y, vx, vy) => {
  sys.x[i] = x; sys.y[i] = y; sys.vx[i] = vx; sys.vy[i] = vy;
};
const dist = (sys, a, b) => Math.hypot(sys.x[b] - sys.x[a], sys.y[b] - sys.y[a]);

// (a) — the leaf, unit-pinned.
{
  assert.strictEqual(LINK_ITERATIONS, 4, 'four Gauss–Seidel passes over the links per step');
  assert.strictEqual(LINK_COMPLIANCE, 1, 'the compliance scale (Matt’s tune line)');
  assert.strictEqual(BOND_FORM_STEPS, 45, 'formation threshold: 45 grip steps (¾ s at 60 fps)');
  assert.strictEqual(BOND_GRACE_STEPS, 3, 'grace: 3 missed steps before the count restarts');
  assert.strictEqual(BOND_TOUCH, 1.06, 'near-touch band: the COALESCE_TOUCH factor');
  assert.strictEqual(BOND_GRIP_VT, 0.1, 'near-touch slip ceiling (px/step)');
  assert.strictEqual(BOND_BREAK_STRAIN, 24, 'break strain: 24 px of predicted error');

  assert.strictEqual(linkCompliance(1), 0, 'stiffness 1: rigid, α = 0');
  assert.strictEqual(linkCompliance(0.5), 1, 'stiffness 0.5: α = LINK_COMPLIANCE');
  assert.strictEqual(linkCompliance(0.25), 3, 'stiffness 0.25: α = 3 × LINK_COMPLIANCE');
  assert.ok(linkCompliance(0.9) < linkCompliance(0.5) && linkCompliance(0.5) < linkCompliance(0.25),
    'compliance is monotone: softer declarations, larger α');

  // The λ update, closed-form: rigid pays the whole error over
  // wSum; a spring's α̃ shares the denominator.
  assert.strictEqual(linkDeltaLambda(30, 0, 2, 0), -15, 'rigid Δλ: −C/wSum');
  assert.strictEqual(linkDeltaLambda(30, 0, 2, 1), -10, 'spring Δλ: −C/(wSum + α̃)');
  // The converged fixed point: once λ has accumulated to
  // −C/α̃ the update is exactly zero — the spring STOPS at its
  // residual instead of creeping (this is what α̃ buys).
  assert.strictEqual(linkDeltaLambda(10, -10, 2, 1), 0, 'converged spring: Δλ = 0 at C = −α̃λ');
  // α̃ = α/h²: the same declared spring at h = 2 carries a
  // quarter the α̃ — stiffness meaning survives the frame rate.
  const atH2 = linkDeltaLambda(30, 0, 2, linkCompliance(0.5) / 4);
  assert.ok(Math.abs(atH2 - -30 / 2.25) < 1e-12, `α̃ at h=2: ${atH2}`);

  // The declaration gate: one valid entry survives among junk.
  const sys = mkSys(3);
  sys.alive[2] = 0;
  const got = resolveDishLinks(sys, [
    { a: 0, b: 1, rest: 120 },                    // valid, stiffness defaults to 1
    { a: 0, b: 0, rest: 10 },                     // self-link
    { a: 0, b: 9, rest: 10 },                     // out of range
    { a: 0, b: 2, rest: 10 },                     // dead endpoint
    { a: 1, b: 0, rest: 0 },                      // no rest
    { a: 1, b: 0, rest: -5 },                     // negative rest
    { a: 1, b: 0, rest: 10, stiffness: 0 },       // stiffness 0 = no link
    { a: 1.5, b: 0, rest: 10 },                   // fractional index
    null, 'junk', { a: 1, b: 0 },                 // junk / missing rest
  ]);
  assert.strictEqual(got.length, 1, `the gate keeps exactly the valid link: ${JSON.stringify(got)}`);
  assert.deepStrictEqual(got[0], { a: 0, b: 1, rest: 120, stiffness: 1 }, 'defaults applied');
  const sprung = resolveDishLinks(sys, [{ a: 0, b: 1, rest: 80, stiffness: 0.5 }]);
  assert.deepStrictEqual(sprung[0], { a: 0, b: 1, rest: 80, stiffness: 0.5 }, 'a spring survives as declared');
  assert.deepStrictEqual(resolveDishLinks(sys, null), [], 'no declaration, no links');
  assert.deepStrictEqual(resolveDishLinks(sys, []), [], 'empty declaration, no links');
}

// (b) — the solve, direct, on predicted positions.
{
  // Stretched pair (err +30), hard link, body 1 separating at
  // 3/step: the projection lands the pair EXACTLY on rest, and
  // the fold (Δx/h, h = 1) makes the velocities agree with the
  // corrected positions. Momentum conserved.
  const sys = mkSys(2);
  place(sys, 0, 400, 350, 0, 0); place(sys, 1, 530, 350, 3, 0);
  const solved = solveDishLinks(sys, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.strictEqual(solved, 1, 'one link solved');
  assert.ok(Object.is(sys.x[0], 415) && Object.is(sys.x[1], 515),
    `projected onto rest: ${sys.x[0]}, ${sys.x[1]}`);
  assert.ok(Math.abs(dist(sys, 0, 1) - 100) < EPS, 'distance is the rest distance');
  assert.ok(Object.is(sys.vx[0], 15) && Object.is(sys.vx[1], -12),
    `fold Δx/h: ${sys.vx[0]}, ${sys.vx[1]} (the separating 3 rides through the fold)`);
  assert.ok(Math.abs((sys.vx[0] + sys.vx[1]) - 3) < EPS, 'momentum conserved (equal masses)');

  // At rest, matched velocities: C = 0, Δλ = 0 — positions AND
  // velocities bit-untouched.
  const rest = mkSys(2);
  place(rest, 0, 400, 350, 1, 1); place(rest, 1, 500, 350, 1, 1);
  solveDishLinks(rest, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Object.is(rest.x[0], 400) && Object.is(rest.x[1], 500)
    && Object.is(rest.vx[0], 1) && Object.is(rest.vx[1], 1)
    && Object.is(rest.vy[0], 1) && Object.is(rest.vy[1], 1), 'a satisfied link is a bit-exact no-op');

  // At rest with SEPARATING velocities the solve still writes
  // nothing — XPBD is position-level; the constraint answers
  // the error integration creates, through the fold (the
  // recovery probes in (c) are that answer, end to end).
  const sep = mkSys(2);
  place(sep, 0, 400, 350, 0, 0); place(sep, 1, 500, 350, 3, 0);
  solveDishLinks(sep, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Object.is(sep.x[1], 500) && Object.is(sep.vx[1], 3),
    'position-level law: no error yet, no answer yet');

  // Compressed pair (err −20): pushed apart onto rest,
  // symmetrically, folds −10 / +10.
  const comp = mkSys(2);
  place(comp, 0, 400, 350, 0, 0); place(comp, 1, 480, 350, 0, 0);
  solveDishLinks(comp, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Object.is(comp.x[0], 390) && Object.is(comp.x[1], 490)
    && Object.is(comp.vx[0], -10) && Object.is(comp.vx[1], 10),
    `compression answered symmetrically: ${comp.x[0]}, ${comp.x[1]}, ${comp.vx[0]}, ${comp.vx[1]}`);

  // Masses 1 vs 3: the projection splits by inverse mass — the
  // light body travels 3× the heavy one's Δx; the folds carry
  // equal and opposite momentum.
  const heavy = mkSys(2);
  place(heavy, 0, 400, 350, 0, 0); place(heavy, 1, 530, 350, 0, 0);
  heavy.mass[1] = 3;
  solveDishLinks(heavy, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Math.abs(heavy.x[0] - 422.5) < EPS && Math.abs(heavy.x[1] - 522.5) < EPS,
    `inverse-mass shares: ${heavy.x[0]}, ${heavy.x[1]}`);
  assert.ok(Math.abs(heavy.vx[0] - 22.5) < EPS && Math.abs(heavy.vx[1] - -7.5) < EPS,
    'the folds are the Δx shares at h = 1');
  assert.ok(Math.abs((1 * heavy.vx[0] + 3 * heavy.vx[1])) < EPS, 'momentum conserved across the split');

  // The spring (stiffness 0.5, α̃ = 1) converges in ONE pass
  // to its XPBD residual — err 30 → 30·α̃/(wSum + α̃) = 10 —
  // and the accumulated λ holds it there (the second pass's
  // Δλ is exactly 0, pinned in (a)). The fold is the corrected
  // share only: ±10, strictly softer than the hard ±15.
  const spr = mkSys(2);
  place(spr, 0, 400, 350, 0, 0); place(spr, 1, 530, 350, 0, 0);
  solveDishLinks(spr, [{ a: 0, b: 1, rest: 100, stiffness: 0.5 }], 1);
  assert.ok(Math.abs(dist(spr, 0, 1) - 110) < EPS,
    `spring residual is the XPBD fixed point: dist ${dist(spr, 0, 1)} (err 10 of 30)`);
  assert.ok(Math.abs(spr.vx[0] - 10) < EPS && Math.abs(spr.vx[1] - -10) < EPS,
    'the spring fold is the corrected share, softer than hard');

  // Tangential motion is not the link's business: a pair
  // sliding sideways at rest distance is untouched, positions
  // and velocities alike.
  const slide = mkSys(2);
  place(slide, 0, 400, 350, 0, 2); place(slide, 1, 500, 350, 0, -1);
  solveDishLinks(slide, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Object.is(slide.vy[0], 2) && Object.is(slide.vy[1], -1)
    && Object.is(slide.x[0], 400) && Object.is(slide.x[1], 500), 'pure tangential slide: no answer');

  // Coincident endpoints: golden-angle axis, the pair lands on
  // rest along it, finite, momentum conserved.
  const coin = mkSys(2);
  place(coin, 0, 400, 350, 1, 0); place(coin, 1, 400, 350, -1, 0);
  solveDishLinks(coin, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Number.isFinite(coin.x[0]) && Number.isFinite(coin.y[0])
    && Number.isFinite(coin.x[1]) && Number.isFinite(coin.y[1]), 'coincident: no NaN');
  assert.ok(Math.abs(dist(coin, 0, 1) - 100) < 1e-9,
    `coincident: separated onto rest along the golden axis: ${dist(coin, 0, 1)}`);
  assert.ok(Math.abs((coin.vx[0] + coin.vx[1]) - 0) < EPS
    && Math.abs((coin.vy[0] + coin.vy[1]) - 0) < EPS, 'coincident: momentum conserved');

  // Spin is not the link's business either (centre-attached):
  // ω and θ are bit-untouched by a stretched solve.
  const spin = mkSys(2);
  place(spin, 0, 400, 350, 0, 0); place(spin, 1, 560, 350, 0, 0);
  spin.omega[0] = 0.3; spin.omega[1] = -0.2; spin.theta[0] = 1; spin.theta[1] = 2;
  solveDishLinks(spin, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Object.is(spin.omega[0], 0.3) && Object.is(spin.omega[1], -0.2)
    && Object.is(spin.theta[0], 1) && Object.is(spin.theta[1], 2), 'ω/θ bit-untouched');

  // A chain: the second link's stretch couples into the first
  // through the shared body; across the fixed passes the
  // residuals converge geometrically toward zero (XPBD: the
  // count buys convergence, never a different stiffness).
  const chain = mkSys(3);
  place(chain, 0, 400, 350, 0, 0); place(chain, 1, 500, 350, 0, 0); place(chain, 2, 630, 350, 0, 0);
  solveDishLinks(chain, [
    { a: 0, b: 1, rest: 100 }, { a: 1, b: 2, rest: 100 },
  ], 1);
  const c01 = Math.abs(dist(chain, 0, 1) - 100);
  const c12 = Math.abs(dist(chain, 1, 2) - 100);
  assert.ok(c01 < 0.5 && c12 < 0.5,
    `chain residuals after ${LINK_ITERATIONS} passes: ${c01.toFixed(4)}, ${c12.toFixed(4)}`);
  assert.ok(Math.abs(chain.vx[0] + chain.vx[1] + chain.vx[2]) < EPS, 'chain folds conserve momentum');

  // Junk-only declarations solve nothing and write nothing.
  const junk = mkSys(2);
  place(junk, 0, 400, 350, 1, 2); place(junk, 1, 530, 350, 3, 4);
  assert.strictEqual(solveDishLinks(junk, [{ a: 0, b: 0, rest: 5 }, null], 1), 0, 'junk solves zero links');
  assert.ok(Object.is(junk.x[0], 400) && Object.is(junk.vx[0], 1) && Object.is(junk.vx[1], 3), 'junk writes nothing');
}

// (c) — full updates: the acceptance probes.
const lpFor = (extra = {}) => normalizeLayoutParams({
  ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 3,
  contactRadius: 22, contactMode: 'bounce', contactRestitution: 0.85, contactRepel: 0,
  wind: 0, swarmCohesion: 0, gravityWells: 0, noiseSpeed: 0, damping: 0.995,
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
  accumulationWetness: 0,
  ...extra,
});
const stepN = (sys, lp, steps) => {
  for (let s = 0; s < steps; s++) {
    sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
};
{
  // The collision: a third disc authored OVERLAPPING body 1
  // (22 of the 44 px contact distance) — depenetration shoves
  // body 1 eleven px toward body 0 in the first step, in both
  // engines (the contact passes run before the solve). The
  // linked pair must RECOVER its rest from that shove — the
  // projection answers the displacement the passes created —
  // while the unlinked control keeps it: nothing restores it.
  const scene = (links) => {
    const sys = mkSys(3);
    place(sys, 0, 940, 700, 0, 0);
    place(sys, 1, 1060, 700, 0, 0);
    place(sys, 2, 1082, 700, 0, 0);
    const lp = { ...lpFor(), maxParticles: 10, ...(links ? { dishLinks: links } : {}) };
    stepN(sys, lp, 200);
    return sys;
  };
  const linkedFinal = Math.abs(dist(scene([{ a: 0, b: 1, rest: 120 }]), 0, 1) - 120);
  const controlFinal = Math.abs(dist(scene(null), 0, 1) - 120);
  assert.ok(linkedFinal <= 2, `linked pair recovers its rest after the shove: final deviation ${linkedFinal.toFixed(3)} px (tolerance 2)`);
  assert.ok(controlFinal >= 6 && controlFinal >= 3 * linkedFinal,
    `unlinked control keeps the shove: final deviation ${controlFinal.toFixed(3)} px (the probe is not vacuous)`);

  // The compound: an equilateral triangle of hard links,
  // dropped in SCRAMBLED — body 2 sits inside body 0's disc
  // (wet contact: depenetration, cling, friction all fire on
  // step 1) with its two links 84 / 34 px out. The shape must
  // pull itself back together in the wet dish and hold; a dry
  // relax then brings it home to its rests.
  const tri = () => {
    const sys = mkSys(3);
    place(sys, 0, 940, 640, 0, 0);
    place(sys, 1, 1060, 640, 0, 0);
    place(sys, 2, 975, 650, 0, 0);
    return sys;
  };
  const links = [
    { a: 0, b: 1, rest: 120 }, { a: 1, b: 2, rest: 120 }, { a: 0, b: 2, rest: 120 },
  ];
  const devs = (sys) => [
    Math.abs(dist(sys, 0, 1) - 120), Math.abs(dist(sys, 1, 2) - 120), Math.abs(dist(sys, 0, 2) - 120),
  ];
  const scram = tri();
  const lpWet = { ...lpFor({ accumulationWetness: 1 }), maxParticles: 10, dishLinks: links };
  let dev30 = null;
  for (let s = 0; s < 150; s++) {
    scram.update(lpWet, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    if (s === 29) dev30 = Math.max(...devs(scram));
  }
  assert.ok(dev30 <= 12, `compound pulls itself together in the wet dish: step-30 deviation ${dev30.toFixed(3)} px (tolerance 12)`);
  const wetFinal = Math.max(...devs(scram));
  assert.ok(wetFinal <= 4, `and holds its shape wet: final deviation ${wetFinal.toFixed(3)} px (tolerance 4)`);
  // Relax: dry the dish, damp hard — the shape comes home.
  const lpDry = { ...lpFor({ damping: 0.9 }), maxParticles: 10, dishLinks: links };
  stepN(scram, lpDry, 150);
  const home = devs(scram);
  assert.ok(Math.max(...home) <= 1, `compound relaxes back to its rests: ${home.map((v) => v.toFixed(3)).join(', ')} (tolerance 1)`);

  // Determinism: the scramble twice, bit for bit — spin
  // columns included (links must not have written them).
  const again = tri();
  for (let s = 0; s < 150; s++) {
    again.update(lpWet, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  const scram2 = tri();
  for (let s = 0; s < 150; s++) {
    scram2.update(lpWet, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  assert.strictEqual(again.n, scram2.n, 'scramble repeat: population');
  for (const fld of ['x', 'y', 'vx', 'vy', 'omega', 'theta']) {
    for (let i = 0; i < again.n; i++) {
      assert.ok(Object.is(again[fld][i], scram2[fld][i]), `scramble repeat: ${fld}[${i}]`);
    }
  }

  // No-link parity through full updates: absent vs empty vs
  // junk-only declarations — bit-identical fields.
  const parity = (extra) => {
    const sys = tri();
    const lp = { ...lpFor({ accumulationWetness: 1 }), maxParticles: 10, ...extra };
    for (let s = 0; s < 150; s++) {
      sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    }
    return sys;
  };
  const pA = parity({});
  const pB = parity({ dishLinks: [] });
  const pC = parity({ dishLinks: [{ a: 0, b: 0, rest: 5 }, { a: 0, b: 1, rest: -1 }, null] });
  for (const fld of ['x', 'y', 'vx', 'vy', 'omega', 'theta']) {
    for (let i = 0; i < 3; i++) {
      assert.ok(Object.is(pA[fld][i], pB[fld][i]) && Object.is(pA[fld][i], pC[fld][i]),
        `no-link parity: ${fld}[${i}] absent vs empty vs junk`);
    }
  }

  // Live vs bake: the same declared scene stepped by hand and
  // by the bake driver lands on identical fields.
  const layerParams = {
    mode: 'swarm', contactRadius: 22, contactMode: 'bounce', contactRestitution: 0.85,
    contactRepel: 0, wind: 0, swarmCohesion: 0, gravityWells: 0, noiseSpeed: 0,
    damping: 0.995, accumulationWetness: 1, dishLinks: links,
  };
  const probe = new ParticleSystem();
  probe.init(3, 2000, 1400, assets, palette, SEED);
  const rests = [dist(probe, 0, 1), dist(probe, 1, 2), dist(probe, 0, 2)];
  const bakeLinks = [
    { a: 0, b: 1, rest: rests[0] }, { a: 1, b: 2, rest: rests[1] }, { a: 0, b: 2, rest: rests[2] },
  ];
  const baked = bakeDishParticles({
    layers: [{
      key: 'l', seed: SEED, count: 3, activeAssets: assets, palette,
      layoutParams: { ...layerParams, dishLinks: bakeLinks },
    }],
    canvasW: 2000, canvasH: 1400, steps: 120,
  }).get('l');
  const hand = new ParticleSystem();
  hand.init(3, 2000, 1400, assets, palette, SEED);
  const handLp = { ...layerParams, dishLinks: bakeLinks, particleCount: 3, maxParticles: 3 };
  for (let s = 0; s < 120; s++) {
    hand.update(handLp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  const handItems = hand.getItems(assets);
  assert.strictEqual(baked.length, handItems.length, 'bake vs live: item count');
  for (let i = 0; i < baked.length; i++) {
    assert.ok(Object.is(baked[i].x, handItems[i].x) && Object.is(baked[i].y, handItems[i].y),
      `bake vs live: item ${i} position identical`);
  }
}

// (e) — bond formation (ruled by Matt 2026-10-16): sustained
// wet grip hardens into a stateful bond.
{
  // Direct dwell: 44 grip notes, no bond; the 45th hardens
  // it, rest latched at the distance the pair holds.
  const sys = mkSys(2);
  place(sys, 0, 400, 350, 0, 0); place(sys, 1, 440, 350, 0, 0);
  for (let s = 1; s < BOND_FORM_STEPS; s++) {
    sys._step = s;
    assert.strictEqual(noteBondGrip(sys, 0, 1), false, `grip ${s}: not yet a bond`);
  }
  assert.ok(!sys._dishBonds || sys._dishBonds.formed.size === 0, 'no bond before the threshold');
  sys._step = BOND_FORM_STEPS;
  assert.strictEqual(noteBondGrip(sys, 0, 1), true, 'the 45th grip hardens the bond');
  assert.strictEqual(sys._dishBonds.formed.size, 1, 'one formed bond');
  const bond = [...sys._dishBonds.formed.values()][0];
  assert.strictEqual(bond.rest, 40, 'rest latched at the formation distance');
  assert.strictEqual(noteBondGrip(sys, 0, 1), true, 'a bonded pair stays bonded');

  // Grace: a gap of exactly BOND_GRACE_STEPS missed steps
  // keeps the count; a longer gap restarts it.
  const g = mkSys(2);
  place(g, 0, 400, 350, 0, 0); place(g, 1, 440, 350, 0, 0);
  for (let s = 1; s <= 10; s++) { g._step = s; noteBondGrip(g, 0, 1); }
  g._step = 10 + BOND_GRACE_STEPS;
  noteBondGrip(g, 0, 1);
  assert.strictEqual([...g._dishBonds.dwell.values()][0].count, 11, 'grace holds the count');
  const g2 = mkSys(2);
  place(g2, 0, 400, 350, 0, 0); place(g2, 1, 440, 350, 0, 0);
  for (let s = 1; s <= 10; s++) { g2._step = s; noteBondGrip(g2, 0, 1); }
  g2._step = 10 + BOND_GRACE_STEPS + 1;
  noteBondGrip(g2, 0, 1);
  assert.strictEqual([...g2._dishBonds.dwell.values()][0].count, 1, 'past grace, the count restarts');

  // The formed bond SOLVES like a declared rigid link: a
  // strain of 8 (under the break strain) is projected back
  // onto rest by solveDishLinks with NO declarations at all.
  place(sys, 1, 448, 350, 0, 0);
  const solvedFormed = solveDishLinks(sys, null, 1);
  assert.ok(solvedFormed >= 1 && Math.abs(dist(sys, 0, 1) - 40) < EPS,
    'formed bond holds its pair with no declaration in sight');

  // Break: strain past BOND_BREAK_STRAIN tears the bond at
  // solve entry — state deleted, positions NOT projected.
  place(sys, 1, sys.x[0] + 70, 350, 0, 0); // dist 70, strain 30
  solveDishLinks(sys, null, 1);
  assert.strictEqual(sys._dishBonds.formed.size, 0, 'the rip tore the bond');
  assert.ok(Math.abs(dist(sys, 0, 1) - 70) < EPS, 'a torn bond does not reach back');

  // Declared wins: a bonded pair carrying a declaration
  // solves to the DECLARED rest; the bond stands down and
  // its state is kept.
  const dw = mkSys(2);
  place(dw, 0, 400, 350, 0, 0); place(dw, 1, 440, 350, 0, 0);
  for (let s = 1; s <= BOND_FORM_STEPS; s++) { dw._step = s; noteBondGrip(dw, 0, 1); }
  assert.strictEqual(dw._dishBonds.formed.size, 1, 'bond formed for the declared-wins probe');
  solveDishLinks(dw, [{ a: 0, b: 1, rest: 100 }], 1);
  assert.ok(Math.abs(dist(dw, 0, 1) - 100) < EPS, 'the declaration wins over the formed rest');
  assert.strictEqual(dw._dishBonds.formed.size, 1, 'the bond stands down, not deleted');

  // A dead endpoint drops the bond at solve entry.
  dw.alive[1] = 0;
  solveDishLinks(dw, null, 1);
  assert.strictEqual(dw._dishBonds.formed.size, 0, 'a dead endpoint drops the bond');

  // Full updates, DRY: two discs resting overlapped in a dry
  // dish for 200 steps — the bond state is never allocated.
  // The dry world is bit-identical country (the family
  // golden suites are its witnesses).
  const dry = mkSys(3);
  place(dry, 0, 940, 700, 0, 0); place(dry, 1, 980, 700, 0, 0); place(dry, 2, 1500, 1200, 0, 0);
  stepN(dry, { ...lpFor(), maxParticles: 10 }, 200);
  assert.ok(!dry._dishBonds, 'dry: bond state never allocated');

  // Full updates, WET: the same resting pair forms a bond in
  // the wet dish; a small shove is answered by the solve; a
  // rip tears the bond in play.
  const wetScene = () => {
    const sys = mkSys(3);
    place(sys, 0, 940, 700, 0, 0); place(sys, 1, 980, 700, 0, 0); place(sys, 2, 1500, 1200, 0, 0);
    const lp = { ...lpFor({ accumulationWetness: 1 }), maxParticles: 10 };
    stepN(sys, lp, 150);
    return { sys, lp };
  };
  const { sys: wet, lp: wetLp } = wetScene();
  assert.ok(wet._dishBonds && wet._dishBonds.formed.size === 1,
    'wet: sustained resting grip formed exactly one bond');
  const formedRest = [...wet._dishBonds.formed.values()][0].rest;
  wet.x[1] += 8;
  stepN(wet, wetLp, 1);
  assert.ok(Math.abs(dist(wet, 0, 1) - formedRest) < 1,
    `formed bond answers a shove in play: dist ${dist(wet, 0, 1).toFixed(3)} vs rest ${formedRest.toFixed(3)}`);
  wet.x[1] += 60;
  stepN(wet, wetLp, 1);
  assert.strictEqual(wet._dishBonds.formed.size, 0, 'the rip tore the bond in play');
  assert.ok(dist(wet, 0, 1) > formedRest + 30, 'and the torn pair stays apart');

  // Formation determinism: the wet scene twice, fresh —
  // fields and bond state identical.
  const det1 = wetScene().sys;
  const det2 = wetScene().sys;
  for (const fld of ['x', 'y', 'vx', 'vy', 'omega', 'theta']) {
    for (let i = 0; i < 3; i++) {
      assert.ok(Object.is(det1[fld][i], det2[fld][i]), `formation repeat: ${fld}[${i}]`);
    }
  }
  assert.strictEqual(det1._dishBonds.formed.size, det2._dishBonds.formed.size,
    'formation repeat: same bond count');
  assert.strictEqual(
    [...det1._dishBonds.formed.values()][0].rest,
    [...det2._dishBonds.formed.values()][0].rest,
    'formation repeat: same latched rest');
}

// (d) — wiring.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const leaf = readFileSync(new URL('./dishLinks.mjs', import.meta.url), 'utf8');
  const iContact = particles.indexOf('this._contactPass({');
  const iInteg = particles.indexOf('const dampDt = Math.pow(damp, dtFrames)');
  const iLinks = particles.indexOf('solveDishLinks(this, dishLinks, dtFrames)');
  assert.ok(iContact >= 0 && iInteg > iContact && iLinks > iInteg,
    'the XPBD solve sits after integration — it projects the predicted positions');
  assert.ok(particles.includes('layoutParams.dishLinks'), 'the declaration is read spread-only from layoutParams');
  assert.ok(particles.includes("from './dishLinks.mjs'"), 'particles.js imports the leaf (call site only)');
  assert.ok(particles.includes('noteBondGrip(this, i, j)'),
    'grip is noted from the contact pass (friction stick verdict + near-touch band)');
  assert.ok(particles.includes('this._dishBonds.formed.size'), 'the solve gate opens for formed bonds');
  assert.ok(particles.includes('this._dishBonds = null'), 'bond state is constructor-held and cleared on re-seed');
  assert.ok(!/Math\.random|Date\.now/.test(leaf), 'the leaf is clock- and dice-free');
  const manifest = readFileSync(new URL('../../selfcheck.manifest', import.meta.url), 'utf8');
  assert.ok(manifest.includes('node src/engine/dishLinks.selfcheck.mjs'), 'the suite is manifest-registered');
}

console.log('dishLinks.selfcheck: OK (#1597 — XPBD leaf compliance algebra + λ update + declaration gate, projection closed forms / fold momentum / chain convergence, collision-shove recovery within 2 px, compound scramble + relax, bond formation threshold/grace/hold/break + declared-wins, determinism + live-vs-bake, no-link parity, wiring)');
