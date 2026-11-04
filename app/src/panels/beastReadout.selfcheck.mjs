// beastReadout.selfcheck.mjs — #1868 S5: the signature curve as the family-resemblance readout.
//
//   computed    the signature IS the solver's foot sweep (every point equals solvePose's F ÷ scale) — never approximated
//   kin         near-identical genomes → near-identical signatures; a measured mutation visibly kinks the curve, and the
//               distance grows with the mutation (2% < 10% < 25%)
//   honest      a stillbirth has no signature; an ugly gait keeps its ugly signature (nothing tidies it)
//   closed      the drawn path closes; two signatures draw to one shared frame
//   rows        the wet lab's rows: one per beast, nearest relative by distance, none for a lone beast, no annotation of the stage
import assert from 'node:assert/strict';
import { solvePose, isStillborn } from '../engine/jansenSolver.js';
import { wildTypeMeasures } from '../engine/jansenMeasures.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import { dealBeastMeasures, beastTile } from '../engine/beastTile.js';
import {
  footSignature,
  signatureDistance,
  signaturePath,
  kinship,
  SIGNATURE_SAMPLES,
  KIN_DISTANCE,
  COUSIN_DISTANCE,
} from '../engine/beastTrails.js';
import { beastRows } from './beastReadoutLogic.mjs';

const wild = sanitizeMeasures(wildTypeMeasures());
const sig = footSignature(wild);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// ---- computed
{
  assert.equal(sig.length, SIGNATURE_SAMPLES);
  for (const i of [0, 9, 31, 50, 71]) {
    const pose = solvePose(wild, (i / SIGNATURE_SAMPLES) * Math.PI * 2, wild.scale);
    near(sig[i].x, pose.joints.F.x / wild.scale, 1e-12, `point ${i} x is the solver's`);
    near(sig[i].y, pose.joints.F.y / wild.scale, 1e-12, `point ${i} y is the solver's`);
  }
  const big = footSignature({ ...wild, scale: 1.4 });
  for (const i of [0, 20, 40]) near(big[i].x, sig[i].x, 1e-9, 'scale-free: size is the beast, shape is the curve');
  assert.deepEqual(footSignature(wild), sig, 'deterministic');
}

// ---- kin: a measured mutation kinks the curve, in proportion
{
  const mutate = (id, f) => sanitizeMeasures({ ...wild, [id]: wild[id] * f });
  assert.equal(signatureDistance(sig, sig), 0);
  assert.ok(signatureDistance(sig, footSignature({ ...wild })) === 0, 'identical genomes, identical curves');
  for (const id of ['a', 'c', 'g', 'h']) {
    const d = [1.02, 1.1, 1.25].map((f) => {
      const m = mutate(id, f);
      return isStillborn(m, m.scale) ? NaN : signatureDistance(sig, footSignature(m));
    });
    assert.ok(d[0] < d[1] && (Number.isNaN(d[2]) || d[1] < d[2]), `bar ${id}: the kink grows with the mutation (${d})`);
    assert.ok(d[0] <= KIN_DISTANCE, `bar ${id}: a 2% change is still kin (${d[0]})`);
    assert.ok(d[1] > d[0] * 1.5, `bar ${id}: 10% is visibly further than 2%`);
  }
  // scale and leg count are not the curve: a bigger, longer beast of the same bars is the same signature
  assert.ok(signatureDistance(sig, footSignature({ ...wild, scale: 1.3, legCount: 8 })) < 1e-9);
  assert.equal(kinship(0.02), 'kin');
  assert.equal(kinship((KIN_DISTANCE + COUSIN_DISTANCE) / 2), 'cousin');
  assert.equal(kinship(COUSIN_DISTANCE + 0.01), 'stranger');
}

// ---- honest
{
  let dead = null;
  for (let i = 1; i < 400 && !dead; i++) {
    const m = sanitizeMeasures({ ...wild, b: wild.b * (1 + i * 0.01) });
    if (isStillborn(m, m.scale)) dead = m;
  }
  assert.ok(dead, 'found an infeasible set');
  assert.equal(footSignature(dead), null, 'a stillbirth leaves no curve');
  assert.equal(signatureDistance(sig, null), Infinity);
  assert.equal(footSignature(null), null);
}

// ---- closed, and one shared frame
{
  const d = signaturePath(sig, { w: 100, h: 60 });
  assert.match(d, /^M[\d.\- ]+L/);
  assert.ok(d.endsWith('Z'), 'the path closes');
  assert.equal(d.split('L').length, SIGNATURE_SAMPLES, 'one segment per sample');
  const other = footSignature(sanitizeMeasures({ ...wild, h: wild.h * 1.1 }));
  const frame = [...sig, ...other];
  assert.notEqual(
    signaturePath(sig, { frame }),
    signaturePath(sig),
    'a shared frame draws differently from the lone fit',
  );
  const nums = signaturePath(sig, { w: 100, h: 60, pad: 4, frame })
    .match(/-?\d+\.?\d*/g)
    .map(Number);
  assert.ok(
    nums.every((n) => n >= 3.9 && n <= 100),
    'inside the box',
  );
  assert.equal(signaturePath([], {}), '');
}

// ---- the wet lab's rows
{
  const tiles = [0, 1, 2].map((n) => beastTile(dealBeastMeasures(11, n)));
  const plain = { id: 'user:other', category: 'fragments', svg: '<circle cx="5" cy="5" r="3"/>' };
  assert.deepEqual(beastRows([plain]), [], 'no beasts, no rows');
  const smuggled = { ...tiles[0], id: 'user:imp', category: 'fragments', source: 'overlay' };
  assert.deepEqual(beastRows([smuggled]), [], 'an import that carries a rig is not a beast');
  const one = beastRows([tiles[0], plain]);
  assert.equal(one.length, 1);
  assert.equal(one[0].kin, null, 'a lone beast has no relative');
  assert.match(one[0].path, /^M/);
  const rows = beastRows([...tiles, plain]);
  assert.equal(rows.length, 3, 'one row per beast, the plain asset ignored');
  for (const r of rows) {
    assert.ok(r.kin && r.kin.id !== r.id && Number.isFinite(r.kin.distance), 'every beast names its nearest relative');
    const others = rows.filter((o) => o.id !== r.id).map((o) => o.id);
    assert.ok(others.includes(r.kin.id));
    assert.ok(r.kin.path.endsWith('Z') && r.path.endsWith('Z'));
  }
  // the pair is drawn to one shared frame, never each to its own fit
  const lone = signaturePath(footSignature(tiles[0].rig.linkage.measures), { w: 132, h: 72 });
  assert.notEqual(rows[0].path, lone, 'a beast with a relative draws to the shared frame');
  // the nearest relative really is the nearest
  const sigs = new Map(tiles.map((t) => [t.id, footSignature(t.rig.linkage.measures)]));
  for (const r of rows) {
    const best = [...sigs]
      .filter(([id]) => id !== r.id)
      .sort((a, b) => signatureDistance(sigs.get(r.id), a[1]) - signatureDistance(sigs.get(r.id), b[1]))[0][0];
    assert.equal(r.kin.id, best, 'the least-distant other beast');
  }
  // a hostile rig never throws a row
  assert.doesNotThrow(() => beastRows([{ ...tiles[0], rig: { linkage: { measures: 'x' } } }]));
}

console.log('beastReadout.selfcheck: ok');
