// beastRig.selfcheck.mjs — #1960 (BEAST S3b): the Strandbeest's linkage is a creature rig.
//
//   door        sanitizeRig accepts rig.linkage (measures clamp, phase wraps), refuses garbage; creature rigs unchanged
//   pose        every bar bone is the S2 solver's joints mapped into the tile frame — no scripted motion
//   stance      the stance foot is stationary against the ground line (the linkage's own geometry)
//   legs        legCount legs × 12 bars + the beam; scale and legCount stay visible (fixed tile K, never re-zoomed)
//   deal        the 12 bar names are dealt once, every leg wears the same set; the beam deals by BODY fit; the tile mark
//               itself is not pushed (the beast is the linkage)
//   stillbirth  an infeasible set is a real, dead animal: it expands to nothing, ever
//   shed        frozen holds the rest pose, collapsed drops the parts; a stage with no beast is the same array
//   determinism same seed + stage → same instances; a new seed redresses
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { libraryTraits } from '../data/assetDescriptor.js';
import { mkRng } from './prng.js';
import { sanitizeMeasures, BEAST_BARS, legPoints } from './beastBuilder.js';
import { evaluateGenome, isStillborn } from './jansenSolver.js';
import { wildTypeMeasures } from './jansenMeasures.js';
import { poseLinkage, sanitizeLinkage, LINKAGE_TILE_K, LINKAGE_CRANK_HZ } from './beastRig.js';
import { sanitizeRig, expandCreatureInstances, partFit, dealBodyPart, BEAST_BARE_BAR } from './creatureRig.js';

const ids = ASSETS.map((a) => a.id).filter((id) => libraryTraits(id));
const fitOf = (id) => partFit(libraryTraits(id));
const wild = sanitizeMeasures(wildTypeMeasures());
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// ---- door
{
  const rig = sanitizeRig({ body: 'x', linkage: { measures: { ...wild, a: 9999, legCount: 99 }, phase: 1.25 } });
  assert.ok(rig && rig.linkage && rig.bones.length === 0, 'a linkage rig has no creature bones');
  assert.equal(rig.linkage.measures.legCount, 12, 'legCount clamps');
  assert.ok(rig.linkage.measures.a < 9999, 'measures clamp to their range');
  near(rig.linkage.phase, 0.25, 1e-9, 'phase wraps');
  assert.equal(sanitizeRig({ linkage: 7 }), null);
  assert.equal(sanitizeRig({ linkage: { measures: null } }), null);
  assert.equal(sanitizeLinkage(null), null);
  const plain = sanitizeRig({
    body: '',
    bones: [{ id: 'h', role: 'head', chain: 0, parent: null, x: 50, y: 20, angle: -90, len: 14 }],
  });
  assert.ok(plain && !plain.linkage, 'creature rigs are untouched');
}

const ev = evaluateGenome(wild, wild.scale);
const k = LINKAGE_TILE_K;

// ---- pose = the solver
{
  const lk = { measures: wild, phase: 0 };
  const t = 1.7;
  const pose = poseLinkage(lk, t);
  assert.equal(pose.length, 1 + wild.legCount * BEAST_BARS.length, 'beam + legCount × 12 bars');
  const theta = 2 * Math.PI * (wild.phase0 ?? 0 / wild.legCount) - 2 * Math.PI * LINKAGE_CRANK_HZ * t;
  const pts = legPoints(wild, theta, wild.scale);
  const f = pose.find((p) => p.id === '0:h'); // bar h ends at the foot
  const o = pose.find((p) => p.id === '0:crank'); // crank starts at the hub O
  near(f.tx - o.x, pts.F.x * k, 1e-6, 'foot x = the solver F.x · k');
  near(f.ty - o.y, -pts.F.y * k, 1e-6, 'foot y = −solver F.y · k (y flips)');
  for (const p of pose) near(Math.hypot(p.tx - p.x, p.ty - p.y), p.len, 1e-9, `${p.id} len is its segment`);
  assert.equal(
    poseLinkage(lk, 1.7)
      .map((p) => p.tx)
      .join(),
    pose.map((p) => p.tx).join(),
    'pure',
  );
}

// ---- stance foot stationary
{
  const foot = [];
  let hubY0;
  for (let s = 0; s < 360; s++) {
    const pose = poseLinkage({ measures: wild, phase: 0 }, s / 360 / LINKAGE_CRANK_HZ);
    const hub = pose.find((p) => p.id === '0:crank');
    const f = pose.find((p) => p.id === '0:h');
    hubY0 = hub.y;
    foot.push({ x: f.tx, y: f.ty - hub.y });
  }
  const low = Math.max(...foot.map((f) => f.y)); // y down: the ground is the largest y
  const high = Math.min(...foot.map((f) => f.y));
  const stance = foot.filter((f) => f.y >= low - 0.15 * (low - high));
  const yRange = Math.max(...stance.map((f) => f.y)) - Math.min(...stance.map((f) => f.y));
  const step = Math.max(...stance.map((f) => f.x)) - Math.min(...stance.map((f) => f.x));
  assert.ok(step > 0 && yRange < 0.15 * step, `stance is flat against the ground: Δy ${yRange} vs step ${step}`);
  near(hubY0, 50 + (ev.stanceMean * k) / 2, 1e-6, 'the hub-to-stance span is centred on the tile');
  near(low, -ev.minY * k, 1e-3, "the ground line is the solver's lowest foot");
}

// ---- legs: scale and legCount stay visible
{
  const span = (m) => {
    const b = poseLinkage({ measures: sanitizeMeasures(m), phase: 0 }, 0)[0];
    return Math.abs(b.tx - b.x);
  };
  assert.ok(span({ ...wild, scale: 1.4 }) > span({ ...wild, scale: 0.6 }), 'a bigger gene is a bigger beast');
  assert.ok(span({ ...wild, legCount: 12 }) > span({ ...wild, legCount: 6 }), 'more legs, a longer beam');
  for (const lc of [6, 8, 12]) {
    const m = sanitizeMeasures({ ...wild, legCount: lc, scale: 1.4 });
    const xs = poseLinkage({ measures: m, phase: 0 }, 0.3).flatMap((p) => [p.x, p.tx]);
    assert.ok(Math.min(...xs) >= -50 && Math.max(...xs) <= 150, 'inside the rig box');
  }
}

// ---- the stage
const inst = (asset, key, extra = {}) => ({
  asset,
  key,
  x: 300,
  y: 300,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  seedOffset: 0,
  ...extra,
});
const rec = (measures, phase = 0) => ({
  category: 'creature',
  source: 'wetlab',
  rig: { body: '', linkage: { measures, phase } },
});
const stage = ids.slice(0, 9).sort();
const overlay = new Map([['user:beast', rec(wild)]]);
const scene = [...stage.map((id, i) => inst(id, `s${i}`)), inst('user:beast', 'b')];
const opts = { seed: 7, t: 0.9, fitOf };
const out = expandCreatureInstances(scene, overlay, opts);
const mine = out.filter((i) => i.key.startsWith('b#'));

// a bare stage (every other shape off): the beast still walks, in plain bars — never an empty tile
{
  const bare = expandCreatureInstances([inst('user:beast', 'b')], overlay, opts);
  assert.equal(bare.length, 1 + wild.legCount * 12, 'beam + every bar, with nothing else on the stage');
  assert.ok(
    bare.every((i) => i.asset === BEAST_BARE_BAR),
    'dressed in the bare bar',
  );
}

{
  assert.equal(mine.length, 1 + wild.legCount * 12, 'beam + every bar of every leg');
  assert.ok(!out.some((i) => i.key === 'b'), 'the tile mark is not drawn: the beast is the linkage');
  assert.equal(out.length, stage.length + mine.length);
  const byBar = new Map();
  for (const p of mine) {
    const m = /^b#(\d+):(\w+)$/.exec(p.key);
    if (!m) continue;
    byBar.set(m[2], new Set([...(byBar.get(m[2]) || []), p.asset]));
  }
  assert.equal(byBar.size, 12);
  for (const [name, set] of byBar) assert.equal(set.size, 1, `every leg wears one part on bar ${name}`);
  assert.ok(
    mine.every((p) => stage.includes(p.asset)),
    'parts come from the stage pile',
  );
  assert.equal(mine[mine.length - 1].key, 'b#beam', 'the beam draws over the legs');
  assert.equal(
    mine[mine.length - 1].asset,
    dealBodyPart(stage, 7, 'user:beast', fitOf),
    'the beam is the body-fit deal',
  );
}

// ---- the beam deals by body fit
{
  let beam = 0,
    pile = 0;
  for (let s = 1; s <= 300; s++) {
    const p = ids.slice(s % 40, (s % 40) + 10).sort();
    const id = dealBodyPart(p, s, 'user:x', fitOf);
    assert.ok(p.includes(id));
    beam += fitOf(id).body;
    pile += p.reduce((a, q) => a + fitOf(q).body, 0) / p.length;
  }
  assert.ok(beam / 300 - pile / 300 > 0.05, `beams fit body better than the pile: ${beam / 300} vs ${pile / 300}`);
  assert.ok(dealBodyPart(stage, 3, 'user:x', null), 'no fit table: a plain seeded pick');
}

// ---- stillbirth
{
  let dead = null;
  for (let i = 0; i < 4000 && !dead; i++) {
    const rng = mkRng(i * 7919 + 13);
    const f = () => rng();
    const m = sanitizeMeasures({
      ...wild,
      ...Object.fromEntries('abcdefghijl'.split('').map((c) => [c, wild[c] * (0.5 + 1.5 * f())])),
    });
    if (isStillborn(m, m.scale)) dead = m;
  }
  assert.ok(dead, 'found an infeasible set');
  assert.equal(poseLinkage({ measures: dead, phase: 0 }, 0), null);
  const ghost = expandCreatureInstances(scene, new Map([['user:beast', rec(dead)]]), opts);
  assert.ok(!ghost.some((i) => i.key.startsWith('b')), 'a stillbirth expands to nothing');
  assert.equal(ghost.length, stage.length);
}

// ---- shed
{
  assert.equal(
    expandCreatureInstances(scene, overlay, { ...opts, collapsed: true }),
    scene,
    'collapsed: the same array',
  );
  const a = expandCreatureInstances(scene, overlay, { ...opts, frozen: true, t: 0 });
  const b = expandCreatureInstances(scene, overlay, { ...opts, frozen: true, t: 5 });
  assert.deepEqual(
    a.map((i) => [i.key, i.x, i.y, i.rotation]),
    b.map((i) => [i.key, i.x, i.y, i.rotation]),
    'frozen holds the rest pose',
  );
  const plain = scene.filter((i) => i.asset !== 'user:beast');
  assert.equal(expandCreatureInstances(plain, overlay, opts), plain, 'no beast on stage: the same array');
}

// ---- determinism
{
  const again = expandCreatureInstances(scene, overlay, opts);
  assert.deepEqual(again, out, 'same seed + stage → same instances');
  const other = expandCreatureInstances(scene, overlay, { ...opts, seed: 8 });
  assert.notDeepEqual(
    other.map((i) => i.asset),
    out.map((i) => i.asset),
    'a new seed redresses',
  );
  const moved = expandCreatureInstances(scene, overlay, { ...opts, t: 1.9 });
  assert.deepEqual(
    moved.map((i) => i.asset),
    out.map((i) => i.asset),
    'time moves the bones, never the parts',
  );
  assert.notDeepEqual(
    moved.map((i) => i.x),
    out.map((i) => i.x),
    'the crank turns',
  );
}

console.log('beastRig.selfcheck: ok');
