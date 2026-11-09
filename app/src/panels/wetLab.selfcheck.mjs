// wetLab.selfcheck.mjs — #1946 (asset descriptors, slice 5): the wet lab reads descriptors.
//
//   card      role-fit bars for all five roles, the effective tags, and a hint only where one role clearly fits
//   filters   the parent filters return exactly assetsWhere's answer over the bodies, then the kit's pool
//   kit body  a kit source is deterministic per seed; its body is one of the kit's top body-fit shapes; an empty kit gives none;
//             it varies with the seed
//   preview   the part preview is the scene contract's own deal for the same stage and seed (and narrows to a kit)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { assetRecord, assetsWhere } from '../data/assetStyle.js';
import { SEED_KITS, resolveKit } from '../data/kits.js';
import { ROLES } from '../assets/assetRoles.js';
import { kitDescriptors } from '../state/rollPool.mjs';
import { dealableRecords } from '../state/rollPool.mjs';
import { assembleCreature, creatureTile } from '../engine/creatureAssembler.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import {
  descriptorOf,
  shapeCard,
  facetOptions,
  filterParents,
  kitBody,
  topBodies,
  KIT_BODY_TOP,
  previewDeal,
  HINT_MIN,
} from './wetLabLogic.mjs';

const descs = kitDescriptors(dealableRecords(ASSETS, []), { assets: ASSETS });
const recOf = (id) => descs.find((r) => r.id === id);
const kit = (id) => SEED_KITS.find((k) => k.id === id);

// ---- card
{
  const limby = descs.find(
    (r) =>
      r.descriptor.roles.limb >= HINT_MIN &&
      r.descriptor.roles.limb >= r.descriptor.roles.head &&
      r.descriptor.roles.limb >= r.descriptor.roles.body,
  );
  const plain = descs.find(
    (r) => Math.max(r.descriptor.roles.limb, r.descriptor.roles.head, r.descriptor.roles.body) < HINT_MIN,
  );
  assert.ok(limby && plain, 'fixtures: a limb-like and a nothing-like shape exist');
  const c = shapeCard(limby);
  assert.deepEqual(
    c.roles.map((r) => r.role),
    [...ROLES],
    'a bar for every role, in the role order',
  );
  assert.deepEqual(
    c.roles.map((r) => r.fit),
    ROLES.map((r) => limby.descriptor.roles[r]),
    'the bars are the descriptor’s fits',
  );
  assert.equal(c.hint.role, 'limb');
  assert.match(c.hint.text, /limb/);
  assert.equal(shapeCard(plain).hint, null, 'no hint where nothing clearly fits');
  const flat = c.tags.map((t) => `${t.facet}:${t.term}`).sort();
  const eff = limby.descriptor.tags.effective;
  const want = Object.entries(eff)
    .flatMap(([f, ts]) => ts.map((t) => `${f}:${t}`))
    .sort();
  assert.deepEqual(flat, want, 'the card lists the effective tags');
  // an artist's own tag shows up on the card (descriptorOf reads the edits)
  const asset = ASSETS.find((a) => a.id === limby.id);
  const edited = descriptorOf(asset, { [asset.id]: { add: { free: ['mine'] } } });
  assert.ok(shapeCard(edited).tags.some((t) => t.facet === 'free' && t.term === 'mine'));
}

// ---- filters: exactly assetsWhere over the bodies, then the kit
const bodies = [
  'org_blob_01',
  'org_blob_02',
  'flora_flower_01',
  'geo_hex_01',
  'org_petal_01',
  'line_squiggle_03',
].filter((id) => ASSETS.some((a) => a.id === id));
const creatures = bodies
  .map((b, i) =>
    assembleCreature({
      assetId: b,
      points: [
        { x: 50, y: 6, role: 'H' },
        { x: 12, y: 70, role: 'L' },
        { x: 88, y: 70, role: 'L' },
      ],
      seed: 100 + i,
    }),
  )
  .filter(Boolean);
{
  assert.ok(creatures.length >= 4, 'fixtures: several banked creatures');
  const bodyRecs = new Map(creatures.map((c) => [c.body, recOf(c.body)]));
  const opts = facetOptions([...bodyRecs.values()]);
  assert.ok(opts.length > 0 && opts.every((o) => o.key === `${o.facet}:${o.term}`));
  for (const o of opts.slice(0, 12)) {
    const facets = { [o.facet]: [o.term] };
    const got = filterParents(creatures, bodyRecs, { facets }).map((c) => c.id);
    const direct = new Set(assetsWhere([...bodyRecs.values()], { facets }));
    assert.deepEqual(
      got,
      creatures.filter((c) => direct.has(c.body)).map((c) => c.id),
      `${o.key}: exactly assetsWhere's answer`,
    );
  }
  assert.deepEqual(
    filterParents(creatures, bodyRecs, {}).map((c) => c.id),
    creatures.map((c) => c.id),
    'no filter keeps everyone',
  );
  const k = new Set(resolveKit(kit('big-shapes'), descs).ids);
  const inKit = filterParents(creatures, bodyRecs, { kitIds: k }).map((c) => c.id);
  assert.deepEqual(
    inKit,
    creatures.filter((c) => k.has(c.body)).map((c) => c.id),
    'a kit keeps only bodies in its pool',
  );
}

// ---- kit body
{
  for (const id of ['big-shapes', 'botanica', 'kanji']) {
    const a = kitBody(kit(id), 7, descs);
    assert.equal(kitBody(kit(id), 7, descs), a, `${id}: deterministic per seed`);
    assert.ok(resolveKit(kit(id), descs).ids.includes(a), `${id}: the body is in the kit`);
  }
  const fit = (id) => recOf(id).descriptor.roles.body;
  for (const id of ['big-shapes', 'botanica', 'kanji']) {
    const top = new Set(topBodies(resolveKit(kit(id), descs).ids, fit));
    assert.equal(top.size, KIT_BODY_TOP);
    const floor = Math.min(...[...top].map(fit));
    for (let seed = 1; seed <= 60; seed++) {
      const b = kitBody(kit(id), seed, descs);
      assert.ok(top.has(b), `${id} seed ${seed}: the body is one of the kit's top body fits (${b})`);
      assert.ok(fit(b) >= floor);
    }
    const distinct = new Set(Array.from({ length: 60 }, (_, i) => kitBody(kit(id), i + 1, descs)));
    assert.ok(distinct.size >= 2, `${id}: the seed varies the body (${distinct.size})`);
    // nothing outside the top is ever drawn, however many seeds
    const outside = resolveKit(kit(id), descs).ids.filter((x) => !top.has(x) && fit(x) > floor);
    assert.deepEqual(outside, [], 'fixture: the top is the top');
  }
  const empty = { id: 'void', name: 'Void', where: { categories: ['creature'] }, weights: {}, cap: 4 };
  assert.equal(kitBody(empty, 1, descs), null, 'an empty kit supplies no body');
}

// ---- preview ≡ the contract's deal
{
  const bodyAsset = ASSETS.find((a) => a.id === 'org_blob_01');
  const rec = assembleCreature({
    assetId: bodyAsset.id,
    points: [
      { x: 50, y: 6, role: 'H' },
      { x: 12, y: 70, role: 'L' },
      { x: 88, y: 70, role: 'L' },
    ],
    seed: 1946,
  });
  const [tile] = sanitizeOverlay([creatureTile(rec, bodyAsset)]);
  const stage = [
    'geo_hex_01',
    'org_petal_01',
    'flora_flower_01',
    'line_squiggle_03',
    'geo_tri_02',
    'dot_field_01',
    'mrk_sun_01',
  ].filter((id) => ASSETS.some((a) => a.id === id));
  const contractDeal = (seed, extra = {}) => {
    const its = [tile.id, ...stage].map((assetId, i) => ({
      assetId,
      x: 50 + i * 80,
      y: 200,
      scale: 1,
      rotation: 0,
      key: i === 0 ? 'preview' : `s${i}`,
      color: '#111',
      accent: '#e33',
      alpha: 100,
      seedOffset: 0,
    }));
    const c = buildSceneContract({
      doc: { seed, customAssets: [tile], kinemeTime: 0, reducedMotion: true, ...extra },
      resolvedLayers: [{ id: 'L', isFx: false, items: its }],
    });
    return c.instances
      .filter((i) => i.key.startsWith('preview#'))
      .map((i) => ({ bone: i.key.slice(8), asset: i.asset }));
  };
  for (const seed of [1, 7, 42, 1946]) {
    const p = previewDeal(rec, bodyAsset, stage, { seed }).map(({ bone, asset }) => ({ bone, asset }));
    assert.ok(p.length >= 3, 'a part per bone');
    assert.deepEqual(p, contractDeal(seed), `seed ${seed}: the preview is the contract's deal`);
    const kitPool = new Set(['geo_hex_01', 'org_petal_01']);
    const pk = previewDeal(rec, bodyAsset, stage, { seed, pileOnly: kitPool }).map(({ bone, asset }) => ({
      bone,
      asset,
    }));
    assert.deepEqual(
      pk,
      contractDeal(seed, { kitPool: [...kitPool] }),
      `seed ${seed}: and with a kit pool, the contract's kit deal`,
    );
    assert.ok(
      pk.every((x) => kitPool.has(x.asset)),
      'the kit narrows what is dealt',
    );
  }
  assert.deepEqual(
    previewDeal(rec, bodyAsset, [], { seed: 1 })
      .map((x) => x.asset)
      .filter((a) => a !== bodyAsset.id),
    [],
    'an empty stage deals from the body itself',
  );
}
// ---- #2034 (the Big Lab): the surface is the drawer-class room — rail, centered stage, bank rail — and
// the standing instruction prose is gone from the wall (what teaching remains is hover help)
{
  const wet = readFileSync(new URL('./WetLab.jsx', import.meta.url), 'utf8');
  const genome = readFileSync(new URL('../components/GenomeTimeline.jsx', import.meta.url), 'utf8');
  const lineage = readFileSync(new URL('../components/LineageTree.jsx', import.meta.url), 'utf8');
  assert.match(wet, /width: 1180/, 'the sheet is drawer-class (~1180px), not the 620px popup');
  for (const id of ['lab-rail', 'tool-point', 'tool-head', 'tool-limb', 'creature-stage', 'bank-rail', 'bank-tile'])
    assert.ok(wet.includes(`data-testid="${id}"`), `the big lab carries ${id}`);
  assert.ok(wet.includes('data-testid={`lab-mode-${m}`}'), 'the rail renders a mode button per mode');
  for (const m of ['assemble', 'breed', 'genome', 'lineage'])
    assert.ok(wet.includes(`['${m}', '${m}']`), `the rail carries the ${m} mode`);
  assert.ok(
    wet.includes("from '../components/CreatureMiniature.jsx'"),
    'the creature stage is the shared #1872 miniature, scaled up — not a second stage',
  );
  // the named prose blocks do not stand on the wall anymore (the attach teaching survives as hover help)
  for (const prose of [
    'Build the creature from named strands',
    'Pick three parents — banked creatures, or this shape in a Look and a Voice',
    'every asset has attach points from its shape',
  ])
    assert.ok(!wet.includes(prose), `standing prose gone from the lab: ${prose.slice(0, 32)}…`);
  assert.ok(!genome.includes('The creature’s genes, in order'), 'the timeline explainer is gone');
  assert.ok(!genome.includes('source {gene.source}</span>'), 'the readout prints the source once, not words + raw');
  assert.ok(!lineage.includes('Pick an ancestor to read what changed in it'), 'the tree explainer is gone');
  assert.ok(lineage.includes('deltaGroups'), 'the tree groups deltas by source — no source printed per gene');
}

console.log('wetLab.selfcheck: ok');
