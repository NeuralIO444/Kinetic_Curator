// creatureRole.selfcheck.mjs — #1945 (asset descriptors, slice 4): Davis deals parts by role fit.
//
//   lift        over 500 seeded stages the dealt limb parts fit "limb" better than the stage pile does, and the head
//               fits "head" better, each by a pinned margin; the draw is soft (fit^k), so the top fit is NOT always taken
//   determinism same seed + stage + fits → same parts; a new seed redresses
//   chains      a limb's lower bones prefer lighter shapes than the thigh, and never repeat the thigh's part
//   moods       BLOOM/FLOW (wide) still gives every bone its own shape; STUCK/UGLY (tight) still one shape on all limbs
//   bars        the API is a bar { role, len, chain, id }, not a creature bone — a Strandbeest linkage bar deals too
//   untouched   with no fit lookup (the A/B switch off) dealPart and the contract are byte-identical to main
//   kits        pileOnly narrows the pile to stage ∩ kit pool; no overlap → the stage pile; nothing changes without it
//   shed        frozen holds the rest pose and collapsed drops the parts, with role weighting on
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ASSETS } from '../data/assets/index.js';
import { libraryTraits } from '../data/assetDescriptor.js';
import { mkRng } from './prng.js';
import { assembleCreature, creatureTile } from './creatureAssembler.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import * as now from './creatureRig.js';

const { dealPart, partFit, partWeight, expandCreatureInstances, ROLE_DEAL_K, ROLE_FIT_FLOOR } = now;
const ids = ASSETS.map((a) => a.id).filter((id) => libraryTraits(id));
const fitOf = (id) => partFit(libraryTraits(id));
const bones = [
  { id: 'h', role: 'head', chain: 0, len: 14 },
  { id: 'l0.0', role: 'limb', chain: 0, len: 30 },
  { id: 'l0.1', role: 'limb', chain: 0, len: 20 },
  { id: 'l1.0', role: 'limb', chain: 1, len: 30 },
  { id: 'l1.1', role: 'limb', chain: 1, len: 20 },
];
const stageOf = (s) => {
  const r = mkRng(s * 31);
  return [...new Set(Array.from({ length: 8 }, () => ids[Math.floor(r() * ids.length)]))].sort();
};
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

assert.ok(ROLE_DEAL_K >= 1 && ROLE_FIT_FLOOR > 0, 'k and the floor are named, pinned constants');

// ---- lift (and: not always the single top fit)
{
  let limb = 0,
    limbPile = 0,
    head = 0,
    headPile = 0,
    n = 0,
    topLimb = 0,
    limbDeals = 0;
  for (let s = 1; s <= 500; s++) {
    const pile = stageOf(s);
    const mean = (k) => pile.reduce((a, id) => a + fitOf(id)[k], 0) / pile.length;
    const best = pile.reduce((a, id) => (fitOf(id).limb > fitOf(a).limb ? id : a), pile[0]);
    for (const b of bones) {
      const id = dealPart(pile, s, 'user:t', b, null, 0, { fitOf });
      assert.ok(pile.includes(id), 'only shapes the stage has');
      if (b.role === 'limb') {
        limb += fitOf(id).limb;
        limbPile += mean('limb');
        n++;
        limbDeals++;
        if (id === best) topLimb++;
      } else {
        head += fitOf(id).head;
        headPile += mean('head');
      }
    }
  }
  assert.ok(limb / n - limbPile / n > 0.08, `limb parts beat the pile: ${limb / n} vs ${limbPile / n}`);
  assert.ok(head / 500 - headPile / 500 > 0.08, `heads beat the pile: ${head / 500} vs ${headPile / 500}`);
  assert.ok(topLimb / limbDeals < 0.6, `varied, never just the top fit (${topLimb / limbDeals})`);
}

// ---- determinism
{
  const pile = stageOf(5);
  const deal = (seed) => bones.map((b) => dealPart(pile, seed, 'user:t', b, null, 0, { fitOf }));
  assert.deepEqual(deal(7), deal(7));
  assert.notDeepEqual(deal(7), deal(8), 'a new seed redresses');
}

// ---- chains: the shin never repeats the thigh; lower bones lean light
{
  let lighter = 0,
    same = 0,
    total = 0,
    meanThigh = 0,
    meanShin = 0;
  for (let s = 1; s <= 500; s++) {
    const pile = stageOf(s);
    const thigh = dealPart(pile, s, 'user:t', bones[1], null, 0, { fitOf });
    const shin = dealPart(pile, s, 'user:t', bones[2], null, 0, { fitOf });
    if (shin === thigh) same++;
    meanThigh += fitOf(thigh).mass;
    meanShin += fitOf(shin).mass;
    total++;
  }
  assert.equal(same, 0, 'a shin never wears its thigh’s part while the pile allows');
  assert.ok(meanShin / total < meanThigh / total, `shins are lighter: ${meanShin / total} < ${meanThigh / total}`);
  // a one-part pile can only repeat
  assert.equal(dealPart(['geo_hex_01'], 1, 't', bones[2], null, 0, { fitOf }), 'geo_hex_01');
  // partWeight: the formula itself
  const fit = { limb: 0.8, head: 0.2, mass: 0.6, elong: 0.5 };
  assert.equal(
    partWeight(null, { role: 'limb', len: 30, depth: 0 }),
    ROLE_FIT_FLOOR ** ROLE_DEAL_K,
    'no traits → the floor',
  );
  assert.ok(
    partWeight(fit, { role: 'limb', len: 30, depth: 1 }) < partWeight(fit, { role: 'limb', len: 30, depth: 0 }),
    'depth > 0 prefers light',
  );
  assert.ok(
    partWeight({ ...fit, elong: 0.9 }, { role: 'limb', len: 30, depth: 0 }) >
      partWeight(fit, { role: 'limb', len: 30, depth: 0 }),
    'a long bar leans to elongated shapes',
  );
  assert.equal(
    partWeight({ ...fit, elong: 0.9 }, { role: 'limb', len: 5, depth: 0 }),
    partWeight(fit, { role: 'limb', len: 5, depth: 0 }),
    'a short bar does not',
  );
  assert.ok(
    partWeight(fit, { role: 'head', len: 14, depth: 0 }) < partWeight(fit, { role: 'limb', len: 14, depth: 0 }),
    'a head reads head fit, a limb limb fit',
  );
}

// ---- moods still hold
{
  let widePerBone = 0,
    tightOne = 0,
    runs = 0;
  for (let s = 1; s <= 200; s++) {
    const pile = stageOf(s);
    if (pile.length < 5) continue;
    runs++;
    const wide = bones.map((b, i) => dealPart(pile, s, 'user:t', b, 'wide', i, { fitOf }));
    if (new Set(wide).size === wide.length) widePerBone++;
    const tight = bones
      .filter((b) => b.role === 'limb')
      .map((b, i) => dealPart(pile, s, 'user:t', b, 'tight', i, { fitOf }));
    if (new Set(tight).size === 1) tightOne++;
  }
  assert.equal(widePerBone, runs, 'wide: every bone its own shape');
  assert.equal(tightOne, runs, 'tight: one shape on every limb');
}

// ---- bars: a Strandbeest linkage bar is { role, len, chain, id }
{
  const bar = { id: 'l3.0', role: 'limb', chain: 3, len: 40 };
  const pile = stageOf(9);
  assert.ok(
    pile.includes(dealPart(pile, 9, 'strandbeest:1', bar, null, 0, { fitOf })),
    'a bar deals with no creature around',
  );
}

// ---- untouched: switch off ≡ main, byte for byte
{
  const grid = [];
  for (let s = 1; s <= 60; s++) {
    const pile = stageOf(s);
    for (const variety of [null, 'wide', 'tight'])
      for (const [i, b] of bones.entries()) grid.push([s, variety, i, b.id]);
  }
  const run = (mod) =>
    grid.map(([s, variety, i, bid]) =>
      mod.dealPart(
        stageOf(s),
        s,
        'user:t',
        bones.find((b) => b.id === bid),
        variety,
        i,
      ),
    );
  // pinned from main's creatureRig.js before #1945
  assert.equal(
    sha(run(now)),
    '04460202b241047d9298ff49173b9764bf4738124bb919a01244cd74515c4cf5',
    'dealPart without a fit lookup is main’s dealPart',
  );
}

// ---- the expansion: untouched without fitOf, kits narrow the pile, the shed rungs hold
{
  const body = ASSETS.find((x) => x.id === 'org_blob_01');
  const points = [
    { x: 50, y: 6, role: 'H' },
    { x: 12, y: 70, role: 'L' },
    { x: 88, y: 70, role: 'L' },
  ];
  const [rec] = sanitizeOverlay([creatureTile(assembleCreature({ assetId: body.id, points, seed: 1945 }), body)]);
  assert.ok(rec && rec.rig && rec.rig.bones.length >= 5, 'fixture: a real, sanitized rig');
  const STAGE = ['geo_hex_01', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_tri_02'];
  const inst = (asset, key, extra = {}) => ({
    asset,
    key,
    x: 100,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    seedOffset: 0,
    ...extra,
  });
  const instances = [inst(rec.id, 'a'), ...STAGE.map((id, i) => inst(id, `s${i}`))];
  const over = new Map([[rec.id, rec]]);
  const opts = { seed: 3, t: 0.4 };
  const a = expandCreatureInstances(instances, over, opts);
  assert.equal(
    sha(a),
    'e58c8d2182ff30b972d3b9866b3231f40860c33d1320f111e687964ecf23eac7',
    'no fitOf: the whole expansion is main’s',
  );
  const roled = expandCreatureInstances(instances, over, { ...opts, fitOf });
  assert.equal(roled.length, a.length);
  assert.ok(roled.filter((i) => i.key.includes('#')).length >= 5, 'the creature expands into parts');
  assert.ok(
    roled.filter((i) => i.key.includes('#')).every((i) => STAGE.includes(i.asset)),
    'still the stage’s own shapes',
  );
  // kits
  const kit = new Set(['geo_hex_01', 'org_petal_01', 'not-on-stage']);
  for (let seed = 1; seed <= 20; seed++) {
    const kitted = expandCreatureInstances(instances, over, { ...opts, seed, fitOf, pileOnly: kit });
    assert.ok(
      kitted.filter((i) => i.key.includes('#')).every((i) => kit.has(i.asset)),
      'parts come from stage ∩ kit pool',
    );
  }
  const none = expandCreatureInstances(instances, over, { ...opts, fitOf, pileOnly: new Set(['nowhere']) });
  assert.equal(sha(none), sha(roled), 'no overlap → the stage pile');
  assert.equal(
    sha(expandCreatureInstances(instances, over, { ...opts, fitOf, pileOnly: new Set() })),
    sha(roled),
    'an empty kit pool narrows nothing',
  );
  // shed rungs
  assert.equal(
    expandCreatureInstances(instances, over, { ...opts, fitOf, collapsed: true }),
    instances,
    'collapsed: the body alone',
  );
  const f1 = expandCreatureInstances(instances, over, { ...opts, fitOf, frozen: true, t: 0.1 });
  const f2 = expandCreatureInstances(instances, over, { ...opts, fitOf, frozen: true, t: 0.9 });
  assert.equal(sha(f1), sha(f2), 'frozen: the rest pose at any time');
}

// ---- the contract: role weighting is on by default; the doc flag and the global are the A/B switch
{
  const body = ASSETS.find((x) => x.id === 'org_blob_01');
  const points = [
    { x: 50, y: 6, role: 'H' },
    { x: 12, y: 70, role: 'L' },
    { x: 88, y: 70, role: 'L' },
  ];
  const [rec] = sanitizeOverlay([creatureTile(assembleCreature({ assetId: body.id, points, seed: 1945 }), body)]);
  const STAGE = [
    'geo_hex_01',
    'org_petal_01',
    'flora_flower_01',
    'line_squiggle_03',
    'geo_tri_02',
    'dot_field_01',
    'mrk_sun_01',
  ];
  const its = [rec.id, ...STAGE].map((assetId, i) => ({
    assetId,
    x: 60 + i * 90,
    y: 270,
    scale: 1,
    rotation: 0,
    key: `k${i}`,
    color: '#111',
    accent: '#e33',
    alpha: 100,
    seedOffset: 0,
  }));
  const parts = (doc) =>
    buildSceneContract({
      doc: { seed: 11, customAssets: [rec], ...doc },
      resolvedLayers: [{ id: 'L', isFx: false, items: its }],
    })
      .instances.filter((i) => i.key.includes('#'))
      .map((i) => i.asset);
  const on = parts({});
  const offFlag = parts({ davisRoleDeal: false });
  assert.ok(on.length >= 5 && offFlag.length === on.length);
  const hash = (xs) => sha(xs);
  let differs = 0;
  for (const seed of [11, 12, 13, 14, 15, 16])
    differs += hash(parts({ seed })) !== hash(parts({ seed, davisRoleDeal: false })) ? 1 : 0;
  assert.ok(differs >= 1, 'the switch changes the deal');
  globalThis.__KC_DAVIS_ROLE_OFF = true;
  assert.equal(hash(parts({})), hash(offFlag), 'the global switch is the flag');
  delete globalThis.__KC_DAVIS_ROLE_OFF;
  assert.equal(hash(parts({})), hash(on), 'and back on');
}

console.log('creatureRole.selfcheck: ok');
