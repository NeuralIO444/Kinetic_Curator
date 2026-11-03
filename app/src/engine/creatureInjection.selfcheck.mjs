// creatureInjection.selfcheck.mjs — #1850 (slice 2 of #1848): assembled creatures enter stages through the normal
// asset placement path (Matt, 2026-11-02: pool tiles; the moth / dish spawn channel stays as it is).
//
//   process   a stage dealt a creature tile is indistinguishable in PROCESS from one dealt an ordinary asset: the real
//             resolver places it by the same rules — same positions, scales, rotations, colours — only the id differs
//   seeding   same seed, same stage, same creature in the same place; a different seed moves it
//   citizen   the tile is an ordinary overlay asset: it passes the overlay's own door, round-trips save / load with its
//             record, and leaves with its record (tile + pool switch)
//   undealt   no library pool ever deals a creature tile (dealableRecords; 60 real KINETIC rolls)
//   dressing  the tile is drawn in the stage's own var(--ink) / var(--accent) — the stage overrides the creature's look
//   limits    a full pool refuses (no record without a tile); a body the overlay door refuses is refused up front
//   old paths the creature citizen and its never-dealt rule are untouched
import assert from 'node:assert/strict';
import {
  assembleCreature,
  creatureTile,
  creatureTileId,
  isCreatureTileId,
  creatureTileSvg,
  TILE_BODY_SCALE,
} from './creatureAssembler.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay, OVERLAY_CAP } from '../assets/overlay.js';
import { dealableRecords, NEVER_DEALT } from '../state/rollPool.mjs';
import { useStore } from '../state/store.js';
import { buildProjectPayload } from '../hooks/useProjectPayload.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const body = ASSETS.find((a) => a.id === 'org_blob_01');
const points = [
  { x: 50, y: 8, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
];
const record = assembleCreature({ assetId: body.id, points, seed: 1850 });
const tile = creatureTile(record, body);

ok('citizen: the tile is an ordinary overlay asset that passes the overlay door unchanged', () => {
  assert.equal(tile.id, creatureTileId(record.id));
  assert.ok(isCreatureTileId(tile.id) && tile.id.startsWith('user:'));
  assert.equal(tile.category, 'creature');
  assert.deepEqual(sanitizeOverlay([tile]), [tile], 'the door keeps it byte for byte');
  let drawable = 0;
  for (const a of ASSETS.filter((x) => x.id !== 'creature')) {
    const r = assembleCreature({ assetId: a.id, points, seed: 3 });
    if (sanitizeOverlay([creatureTile(r, a)]).length === 1) drawable++;
  }
  assert.ok(drawable >= ASSETS.length - 3, `almost every library shape can be a body (${drawable})`);
  assert.equal(creatureTile(record, null), null, 'no body, no tile');
});

ok('dressing: the body scaled into the box, head and limbs drawn in the stage colours only', () => {
  const svg = creatureTileSvg(record, body.svg);
  assert.ok(svg.includes(`scale(${TILE_BODY_SCALE})`) && svg.includes(body.svg), 'the body is the shape itself');
  const added = svg.slice(svg.indexOf('</g>') + 4);
  assert.equal((added.match(/<path /g) || []).length, record.limbs.length, 'one limb per L point');
  assert.equal((added.match(/<circle /g) || []).length, 2, 'the head ring on the H point');
  const fills = [...added.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    fills.every((f) => f === 'var(--ink)' || f === 'var(--accent)'),
    'stage colours only — the stage dresses it',
  );
  const bare = assembleCreature({ assetId: body.id, points: [], seed: 1 });
  assert.equal(
    creatureTileSvg(bare, body.svg),
    `<g transform="translate(15 15) scale(${TILE_BODY_SCALE})">${body.svg}</g>`,
  );
});

// The LIVE resolver (gl/liveResolve.mjs — what the instrument plays and takes record) over a one-layer stage whose pool
// is the given imports. (The studio still path pools library assets only and never reads imports — predates #1850.)
const resolve = (customAssets, enabledIds, seed = 1850) => {
  const r = createLiveResolver();
  const input = {
    layers: [{ id: 'lyr-a', name: 'A', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 40, lifeDrift: 0 },
    caGrid: null,
    enabledAssets: Object.fromEntries(enabledIds.map((id) => [id, true])),
    assetWeightOverrides: {},
    customAssets,
    quality: 'balanced',
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    loopTimeMs: 0,
    perfClampOverride: null,
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    scaleMul: 1,
    alphaBoost: 0,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    phraseWrapGen: 0,
    attractor: null,
  };
  return r.resolveLayers(input).find((l) => !l.isFx).items;
};

ok('process: a stage with a creature tile is placed by exactly the rules an ordinary asset gets', () => {
  // the control: an ordinary import with the same weight, drawn as the plain body
  const control = {
    ...tile,
    id: 'user:plainbody',
    category: 'fragments',
    tags: ['overlay'],
    source: 'overlay',
    svg: body.svg,
  };
  const withCreature = resolve([tile], [tile.id]);
  const withAsset = resolve([control], [control.id]);
  assert.ok(withCreature.length > 10, `the stage places the creature (${withCreature.length} marks)`);
  assert.ok(
    withCreature.every((it) => it.assetId === tile.id),
    'every mark is the creature',
  );
  const strip = (items) => JSON.stringify(items.map(({ assetId, key, ...rest }) => rest));
  assert.equal(strip(withCreature), strip(withAsset), 'same positions, scales, rotations and colours as any asset');
});

ok('seeding: same seed, same stage, same creature in the same place; another seed moves it', () => {
  assert.equal(JSON.stringify(resolve([tile], [tile.id])), JSON.stringify(resolve([tile], [tile.id])));
  assert.notEqual(JSON.stringify(resolve([tile], [tile.id], 1851)), JSON.stringify(resolve([tile], [tile.id])));
});

ok('undealt: no library pool deals a creature tile — dealableRecords and 60 real KINETIC rolls', () => {
  assert.ok(!dealableRecords(ASSETS, [tile]).some((r) => r.id === tile.id));
  assert.ok(NEVER_DEALT.includes('creature'), 'the creature citizen is still never dealt (old path untouched)');
  useStore.setState({ customAssets: [tile], creatureRecords: [record] });
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 0) S().kineticRoll();
    else S().kineticLookPass();
    assert.ok(!S().enabledAssets[tile.id], `roll ${i} never dealt the creature tile`);
  }
});

ok('store: ASSEMBLE puts the tile in the pool; remove takes the tile and its pool switch with the record', () => {
  useStore.setState({ seed: 0x1850, creatureRecords: [], customAssets: [], creatureAssembleNote: null });
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'banked');
  const rec = S().creatureRecords[0];
  const t = S().customAssets.find((a) => a.id === creatureTileId(rec.id));
  assert.ok(t, 'the tile is in the pool');
  assert.deepEqual(t, creatureTile(rec, body));
  assert.ok(!S().enabledAssets[t.id], 'joining the pool is not dealing: the artist turns it on');
  useStore.setState({ enabledAssets: { ...S().enabledAssets, [t.id]: true } });
  S().removeCreatureRecord(rec.id);
  assert.equal(S().creatureRecords.length, 0);
  assert.ok(!S().customAssets.some((a) => a.id === t.id), 'the tile left');
  assert.ok(!(t.id in S().enabledAssets), 'its pool switch left');
});

ok('limits: a full pool refuses (no record without a tile); a body the door refuses is refused up front', () => {
  const imports = Array.from({ length: OVERLAY_CAP }, (_, i) => ({ ...tile, id: `user:imp${i}`, source: 'overlay' }));
  useStore.setState({ seed: 7, creatureRecords: [], customAssets: imports });
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'pool-full');
  assert.equal(S().creatureRecords.length, 0, 'nothing banked');
  assert.equal(S().customAssets, imports, 'nothing evicted');
  useStore.setState({ creatureRecords: [], customAssets: [] });
  S().assembleCreature('stamp_arrow_01', points); // drawn with a character entity (&#8594;): the overlay door refuses it
  assert.equal(S().creatureAssembleNote.status, 'nobody');
  assert.equal(S().creatureRecords.length, 0);
});

ok('save / load: the record and its tile come back together', () => {
  useStore.setState({ seed: 0x1850, creatureRecords: [], customAssets: [] });
  S().assembleCreature(body.id, points);
  const before = { recs: S().creatureRecords, tiles: S().customAssets };
  const parsed = parseProject(JSON.parse(JSON.stringify(serializeProject(S()))));
  assert.ok(parsed.ok, parsed.error);
  useStore.setState({ creatureRecords: [], customAssets: [] });
  S().applyProject(parsed.doc);
  assert.deepEqual(S().creatureRecords, before.recs);
  assert.deepEqual(sanitizeOverlay(S().customAssets), before.tiles);
});

ok(
  'the pool panel cannot part a creature from its tile: delete removes the creature; rename / duplicate / swap refuse',
  () => {
    useStore.setState({
      seed: 0x1850,
      creatureRecords: [],
      customAssets: [],
      creatureAssembleNote: null,
      ingestError: null,
    });
    S().assembleCreature(body.id, points);
    const rec = S().creatureRecords[0];
    const id = creatureTileId(rec.id);
    for (const act of [
      () => S().renameCustomAsset(id, 'mybug'),
      () => S().duplicateAsset(id),
      () => S().replaceCustomAsset(id, body.svg),
    ]) {
      const before = S().customAssets;
      act();
      assert.equal(S().customAssets, before, 'the tile is unchanged');
      assert.match(S().ingestError || '', /creature tile/i, 'and the panel says why');
    }
    useStore.setState({
      enabledAssets: { ...S().enabledAssets, [id]: true },
      assetWeightOverrides: { [id]: 'light' },
      assetStill: { [id]: true },
      assetOptions: { [id]: { family: 'x' } },
    });
    S().removeCustomAsset(id); // the pool panel's delete
    assert.equal(S().creatureRecords.length, 0, 'the record went with its tile');
    assert.ok(!S().customAssets.some((a) => a.id === id));
    for (const k of ['enabledAssets', 'assetWeightOverrides', 'assetStill', 'assetOptions']) {
      assert.ok(!(id in (S()[k] || {})), `${k}: no dead id survives (#134)`);
    }
  },
);

ok('a record whose tile went missing (an older document or bundle) is healed by assembling it again', () => {
  useStore.setState({ seed: 0x1850, creatureRecords: [], customAssets: [] });
  S().assembleCreature(body.id, points);
  useStore.setState({ customAssets: [] }); // the tile is gone, the record stays
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'restored');
  assert.equal(S().customAssets.length, 1, 'the tile is back');
  assert.equal(S().creatureRecords.length, 1, 'and still one record');
});

ok('an import that only shares the tile id is never evicted', () => {
  useStore.setState({ seed: 0x1850, creatureRecords: [], customAssets: [] });
  const rec = assembleCreature({ assetId: body.id, points, seed: 0x1850 });
  const impostor = {
    id: creatureTileId(rec.id),
    category: 'fragments',
    weight: 'medium',
    tags: ['overlay'],
    compound: false,
    source: 'ingest',
    svg: body.svg,
  };
  useStore.setState({ customAssets: [impostor] });
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'id-taken');
  assert.equal(S().customAssets[0], impostor, 'the import stands');
  assert.equal(S().creatureRecords.length, 0);
});

ok('undealt by what it IS, not by its id: a tile under any id is still never dealt', () => {
  const moved = { ...tile, id: 'user:mybug' };
  assert.ok(!dealableRecords(ASSETS, [moved]).some((r) => r.id === moved.id));
  const plainImport = { ...tile, id: 'user:plain', category: 'fragments', source: 'ingest' };
  assert.ok(
    dealableRecords(ASSETS, [plainImport]).some((r) => r.id === plainImport.id),
    'ordinary imports still deal',
  );
});

ok('the one-file bundle carries the records with their tiles', () => {
  useStore.setState({ seed: 0x1850, creatureRecords: [], customAssets: [] });
  S().assembleCreature(body.id, points);
  const payload = buildProjectPayload(S());
  assert.equal(payload.creatureRecords.length, 1, 'records ride the bundle');
  assert.ok(
    payload.customAssets.some((a) => isCreatureTileId(a.id)),
    'with their tiles',
  );
});

console.log(`creatureInjection.selfcheck: ${n} checks passed`);
