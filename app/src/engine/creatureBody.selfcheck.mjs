// creatureBody.selfcheck.mjs — #1851 (slice 3 of #1848): body language. An assembled creature's limbs swing in their
// sockets and its head looks about — by the stage's OWN per-region animation (#1433 regions, #1434 family defaults),
// with no creature branch in the resolver, the renderer or the loop.
//
//   parts      the tile's drawing declares its parts (one limb per L point, a head on the H point), each cut free of
//              the body by a joint gap, in the stage's colours only, passing the overlay's door
//   islands    the real region detector (the bake's own raster) finds each limb and the head as its OWN region — the
//              moat is what makes that true (without it a limb welds to the body's outline); census over the library
//   defaults   the creature family: limbs stride, the head looks about (rock), the body is still; other families and
//              the creature citizen are untouched
//   process    the real scene contract slots the parts' kinemes and the real pack expands one placed creature into its
//              body + parts, each part pivoting on its own centre, with its own seed-hash phase (no two parts in step)
//   shed       the governor's rungs apply as to any regioned mark: budget 0 = at rest, tier-2 = frozen, collapse = one
//              quad, byte-identical to a creature that never moved
//   store      assembly queues the tile's detect through the browser's own door (queueRegionDetect, stood up in Node
//              on the bake's raster): the regions land with the defaults, a stale land is dropped, a press heals a tile
//              whose regions never landed, and a tile drawn before #1851 is redrawn in parts, keeping its pool switch
//   nesting    a creature built on another creature's tile reads only its OWN parts
//   still      placements never move (body language is pack-time only) and the drawing is deterministic in the record
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { Resvg } from '@resvg/resvg-js';
import { creatureTileSvg, creaturePartsFromSvg, creaturePartRegions, TILE_BODY_SCALE } from './creatureBody.js';
import { assembleCreature, creatureTile, creatureTileId } from './creatureAssembler.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { bakeAsset } from '../assets/regionBake.mjs';
import { tagImportedRegions, familyDefaultRegionKinemes } from '../data/regionDefaults.js';
import { getKineme, kinemePhase } from '../data/kinemes.js';
import { regionCellGeometry } from '../assets/regionPartition.js';
import { buildSceneContract, assertSceneContract } from '../gl/sceneContract.js';
import { packInstanceData } from '../gl/renderer.mjs';
import { useStore } from '../state/store.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const okA = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const body = ASSETS.find((a) => a.id === 'org_blob_01');
const points = [
  { x: 50, y: 8, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
  { x: 50, y: 92, role: 'L' },
];
const record = assembleCreature({ assetId: body.id, points, seed: 1851 });
const tile = creatureTile(record, body);
const detected = bakeAsset(tile.svg).regions; // the bake's raster + detector — the import pipeline's own
const tagged = { ...tile, ...tagImportedRegions(tile, detected) };
const roles = creaturePartRegions(tile.svg, tagged.regions);
const limbIds = Object.keys(roles).filter((id) => roles[id] === 'limb');
const headId = Object.keys(roles).find((id) => roles[id] === 'head');

ok('parts: one limb per L point and a head, cut free of the body, stage colours only, through the door', () => {
  const parts = creaturePartsFromSvg(tile.svg);
  assert.deepEqual(
    parts.map((p) => p.role),
    ['limb', 'limb', 'limb', 'head'],
  );
  assert.ok(tile.svg.includes(`scale(${TILE_BODY_SCALE})`) && tile.svg.includes(body.svg), 'the body is the shape');
  // one clip per part, namespaced by the record — two creatures never share a clip id
  assert.equal((tile.svg.match(/<clipPath id="/g) || []).length, 4);
  assert.ok([...tile.svg.matchAll(/<clipPath id="([^"]+)"/g)].every((m) => m[1].startsWith(`${record.id}-j`)));
  const fills = [...tile.svg.matchAll(/<path class="cr-[a-z]+"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fills.length === 4 && fills.every((f) => f === 'var(--accent)'), 'the stage dresses the parts');
  assert.deepEqual(sanitizeOverlay([tile]), [tile], 'the overlay door keeps it byte for byte');
  assert.equal(creatureTileSvg(record, body.svg), tile.svg, 'deterministic in the record');
  assert.deepEqual(creaturePartsFromSvg(body.svg), [], 'an ordinary drawing declares no parts');
});

ok('islands: the detector finds every limb and the head as its own region (the moat is why)', () => {
  assert.equal(limbIds.length, 3, 'all three limbs');
  assert.ok(headId, 'the head');
  // mutation: the same creature without the moat (the clip wrappers stripped) welds its limbs to the body's outline
  const welded = tile.svg.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<g clip-path="[^"]+">/g, '<g>');
  const weldedRoles = creaturePartRegions(welded, bakeAsset(welded).regions);
  assert.ok(
    Object.values(weldedRoles).filter((r) => r === 'limb').length < 3,
    'without the joint gap the limbs are not their own regions',
  );
  // census: library bodies x three point layouts — the parts are islands almost everywhere
  const layouts = [
    [
      { x: 90, y: 50 },
      { x: 10, y: 50 },
    ],
    [
      { x: 80, y: 80 },
      { x: 20, y: 80 },
      { x: 50, y: 95 },
    ],
    [
      { x: 70, y: 70 },
      { x: 30, y: 70 },
      { x: 85, y: 30 },
    ],
  ];
  let limbs = 0;
  let found = 0;
  let heads = 0;
  let tiles = 0;
  for (const a of ASSETS.filter((x) => x.id !== 'creature').filter((_, i) => i % 9 === 0)) {
    layouts.forEach((ls, k) => {
      const rec = { id: `cr-0000000${k}`, limbs: ls, head: { x: 50, y: 8 } };
      const svg = creatureTileSvg(rec, a.svg);
      const m = bakeAsset(svg);
      if (!m) return;
      const r = Object.values(creaturePartRegions(svg, tagImportedRegions({ id: 'x' }, m.regions).regions));
      tiles++;
      limbs += ls.length;
      found += r.filter((x) => x === 'limb').length;
      heads += r.includes('head') ? 1 : 0;
    });
  }
  assert.ok(found / limbs >= 0.9, `limbs are their own regions (${found}/${limbs})`);
  assert.ok(heads / tiles >= 0.95, `heads are their own regions (${heads}/${tiles})`);
});

ok('defaults: the creature family — limbs stride, the head looks about, the body is still', () => {
  const k = tagged.regionKinemes;
  for (const id of limbIds) assert.equal(k[id], 'stride');
  assert.equal(k[headId], 'rock');
  const still = tagged.regions.filter((r) => !roles[r.id]);
  assert.ok(still.length >= 1 && still.every((r) => !(r.id in k)), 'every body region is still');
  assert.deepEqual(getKineme('stride'), { id: 'stride', kind: 'osc', period: 1.5, amp: 9 });
  // the family is the creature tile's alone: the same regions under another category get that family's answer
  assert.equal(familyDefaultRegionKinemes({ ...tile, category: 'fragments' }, tagged.regions), null);
  // the citizen (category creature, no parts) and a creature tile with no parts stay still
  assert.equal(
    familyDefaultRegionKinemes(
      ASSETS.find((a) => a.id === 'creature'),
      tagged.regions,
    ),
    null,
  );
  const bare = creatureTile(assembleCreature({ assetId: body.id, points: [], seed: 1 }), body);
  assert.equal(tagImportedRegions(bare, bakeAsset(bare.svg).regions).regionKinemes, null);
});

// ── the real contract + pack, the chain the live loop and the GL stills share ──
const item = (key, x = 500) => ({
  assetId: tile.id,
  x,
  y: 350,
  scale: 2,
  rotation: 30,
  color: '#ffffff',
  accent: '#ff4444',
  alpha: 100,
  key,
  seedOffset: 0,
});
const contract = (doc, items = [item('a')]) =>
  buildSceneContract({
    doc: { seed: 1, customAssets: [tagged], ...doc },
    resolvedLayers: [{ id: 'L', isFx: false, items }],
  });
// The live baker's cells for this tile (gl/liveAtlas.mjs regionCellsLive: a remainder cell + one cell per region,
// centred on the region with regionCellGeometry's pivot) — UVs are placeholders, the geometry is the baker's own.
const cellsFor = (c) => {
  const it = c.instances[0];
  const base = `${it.asset}|${it.tint}|${it.accent}`;
  const cells = { [base]: { u0: 0, v0: 0, u1: 0.1, v1: 0.1 }, [`${base}#rem`]: { u0: 0.1, v0: 0, u1: 0.2, v1: 0.1 } };
  tagged.regions.forEach((r, i) => {
    const g = regionCellGeometry(r);
    cells[`${base}#r:${r.id}`] = {
      u0: 0.2 + i * 0.05,
      v0: 0,
      u1: 0.25 + i * 0.05,
      v1: 0.1,
      geo: { px: g.pivotX, py: g.pivotY, sx: g.scaleX, sy: g.scaleY },
    };
  });
  return cells;
};

ok('process: the contract slots the parts; the pack moves each part on its own centre, out of step', () => {
  const c = contract({ kinemeTime: 0 });
  assert.equal(assertSceneContract(c), true);
  const slots = c.regionAnim.assets[tile.id];
  const kOf = (id) => c.kinemes[slots[id] - 1];
  for (const id of limbIds)
    assert.deepEqual(
      { kind: kOf(id).kind, period: kOf(id).period, amp: kOf(id).amp },
      { kind: 2, period: 1.5, amp: 9 },
    );
  assert.deepEqual({ kind: kOf(headId).kind, amp: kOf(headId).amp }, { kind: 2, amp: 18 }, 'the head: osc ±18°');
  assert.ok(!c.regionAnim.bend, 'no part subdivides');
  const cells = cellsFor(c);
  const frame = { motionTime: 0, shed: false, regions: c.regionAnim };
  const packed = packInstanceData(c.instances, cells, 1, frame);
  assert.equal(packed.length, (1 + tagged.regions.length) * 45, 'body remainder + one instance per region');
  // each part instance sits on its region's centre, through the mark's own transform (scale 2, rotated 30°)
  const it = c.instances[0];
  const th = (it.rotation * Math.PI) / 180;
  const phases = new Set();
  tagged.regions.forEach((r, i) => {
    const o = (i + 1) * 45;
    const g = cells[`${it.asset}|${it.tint}|${it.accent}#r:${r.id}`].geo;
    const lx = (g.px - 50) * it.scaleX;
    const ly = (g.py - 50) * it.scaleY;
    assert.ok(Math.abs(packed[o] - (it.x + lx * Math.cos(th) - ly * Math.sin(th))) < 1e-3, 'pivot x');
    assert.ok(Math.abs(packed[o + 1] - (it.y + lx * Math.sin(th) + ly * Math.cos(th))) < 1e-3, 'pivot y');
    const slot = packed[o + 18];
    if (roles[r.id]) {
      assert.equal(slot, slots[r.id], `${roles[r.id]} carries its kineme slot`);
      assert.ok(Math.abs(packed[o + 19] - kinemePhase(tile.id, r.id)) < 1e-6, 'its seed-hash phase');
      phases.add(packed[o + 19].toFixed(4));
    } else assert.equal(slot, it.kineme || 0, 'a body region moves with the body');
  });
  assert.equal(phases.size, limbIds.length + 1, 'no two parts swing in step');
});

ok('shed: budget 0 rests, the tier-2 rung freezes, the collapse is one quad like a creature that never moved', () => {
  const rest = contract({ regionBudget: 0 });
  assert.ok(
    Object.values(rest.regionAnim.assets[tile.id]).every((s) => s === 0),
    'budget 0: every part at rest',
  );
  const frozen = contract({ perfTier1: true, quality: 'performance' });
  assert.ok(
    Object.values(frozen.regionAnim.assets[tile.id]).every((s) => s === 0),
    'tier-2: frozen',
  );
  const c = contract({ kinemeTime: 0 });
  const cells = cellsFor(c);
  const collapsed = packInstanceData(c.instances, cells, 1, {
    motionTime: 0,
    shed: false,
    regions: { ...c.regionAnim, shed: true },
  });
  const plain = packInstanceData(c.instances, cells);
  assert.deepEqual([...collapsed], [...plain], 'collapse: the single-quad path, byte for byte');
  assert.equal(plain.length, 45);
});

ok('still: body language never moves a placement', () => {
  const moving = contract({ kinemeTime: 0.7 }, [item('a'), item('b', 300)]);
  const tomb = Object.fromEntries(Object.keys(roles).map((id) => [id, null]));
  const asleep = contract({ kinemeTime: 0.7, regionKinemes: { [tile.id]: tomb } }, [item('a'), item('b', 300)]);
  assert.ok(!('regionAnim' in asleep), 'every part tombstoned by the artist: no motion at all');
  assert.deepEqual(
    moving.instances.map(({ x, y, scaleX, scaleY, rotation }) => ({ x, y, scaleX, scaleY, rotation })),
    asleep.instances.map(({ x, y, scaleX, scaleY, rotation }) => ({ x, y, scaleX, scaleY, rotation })),
  );
});

ok('nesting: a creature built on another creature’s tile reads only its OWN parts', () => {
  const outerPts = [
    { x: 92, y: 30, role: 'H' },
    { x: 20, y: 85, role: 'L' },
  ];
  const outer = creatureTile(assembleCreature({ assetId: tile.id, points: outerPts, seed: 7 }), tile);
  assert.deepEqual(
    creaturePartsFromSvg(outer.svg).map((p) => p.role),
    ['limb', 'head'],
    'the inner creature’s parts are body',
  );
  const o = { ...outer, ...tagImportedRegions(outer, bakeAsset(outer.svg).regions) };
  const r = creaturePartRegions(o.svg, o.regions);
  const head = o.regions.find((x) => r[x.id] === 'head');
  assert.ok(head && head.cx > 0.6 && head.cy < 0.5, 'the head that turns is the outer one, on its H point');
});

// The browser's own detect door (assets/regionRaster.js queueRegionDetect → rasterizeRegions: an <img> of the
// canonical SVG drawn to a 200px canvas, read back as straight-alpha RGBA), stood up in Node with the bake's raster —
// so the store's REAL queue, callback and stale guard run, not a stand-in for them.
const flush = () => new Promise((r) => setTimeout(r, 0));
async function settle(pred, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await flush();
  }
  return pred();
}
function installBrowserRaster() {
  globalThis.Image = class {
    set src(url) {
      resolveObjectURL(url)
        .text()
        .then(
          (svg) => {
            this.svg = svg;
            this.onload && this.onload();
          },
          (e) => this.onerror && this.onerror(e),
        );
    }
  };
  globalThis.document = {
    createElement: () => {
      let px = null;
      return {
        getContext: () => ({
          clearRect() {},
          drawImage(img) {
            const r = new Resvg(img.svg).render();
            px = new Uint8ClampedArray(r.pixels);
            for (let i = 0; i < px.length; i += 4) {
              const a = px[i + 3];
              if (a > 0 && a < 255)
                for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, Math.round((px[i + c] * 255) / a));
            }
          },
          getImageData: () => ({ data: px }),
        }),
      };
    },
  };
}

await okA(
  'store: assembly queues the tile’s detect; its regions land with the defaults; stale lands are dropped',
  async () => {
    installBrowserRaster();
    useStore.setState({ seed: 0x1851, creatureRecords: [], customAssets: [], creatureAssembleNote: null });
    S().assembleCreature(body.id, points);
    const rec = S().creatureRecords[0];
    const id = creatureTileId(rec.id);
    const tileNow = () => S().customAssets.find((a) => a.id === id);
    assert.equal(S().creatureAssembleNote.status, 'banked');
    assert.ok(!tileNow().regions, 'nothing yet: the detect is asynchronous');
    assert.ok(await settle(() => !!tileNow().regionKinemes), 'the queued detect lands');
    const landed = tileNow();
    const k = landed.regionKinemes;
    assert.equal(Object.values(k).filter((v) => v === 'stride').length, 3, 'three limbs stride');
    assert.equal(Object.values(k).filter((v) => v === 'rock').length, 1, 'the head looks about');
    // heal: a current tile whose regions never landed gets the detect again on the next press
    const bare = { ...landed };
    delete bare.regions;
    delete bare.regionKinemes;
    useStore.setState({ customAssets: [bare] });
    S().assembleCreature(body.id, points);
    assert.equal(S().creatureAssembleNote.status, 'already');
    assert.ok(await settle(() => !!tileNow().regionKinemes), 'pressed again: the regions land');
    // a tile drawn before #1851 (one solid picture, its own old regions): re-assembly redraws it in parts and keeps the
    // artist's pool switch; the old regions go with the old drawing, and the fresh detect lands on the new one
    const old = {
      ...landed,
      svg: `<g transform="translate(15 15) scale(0.7)">${body.svg}</g>`,
      regions: landed.regions.slice(0, 1),
    };
    delete old.regionKinemes;
    useStore.setState({ customAssets: [old], enabledAssets: { ...S().enabledAssets, [id]: true } });
    S().assembleCreature(body.id, points);
    assert.equal(S().creatureAssembleNote.status, 'redrawn');
    assert.equal(tileNow().svg, landed.svg, 'drawn in parts');
    assert.ok(!tileNow().regions && !tileNow().regionKinemes, 'the old drawing’s regions are gone');
    assert.equal(S().enabledAssets[id], true, 'the pool switch stays');
    assert.ok(await settle(() => !!tileNow().regionKinemes), 'fresh regions follow');
    S().assembleCreature(body.id, points);
    assert.equal(S().creatureAssembleNote.status, 'already', 'a current tile is left alone');
    // stale: the drawing changes before the detect lands — the late result is dropped, never pasted onto it
    useStore.setState({ seed: 0x1852, creatureRecords: [], customAssets: [], creatureAssembleNote: null });
    S().assembleCreature(body.id, points);
    const id2 = creatureTileId(S().creatureRecords[0].id);
    useStore.setState({ customAssets: S().customAssets.map((a) => (a.id === id2 ? { ...a, svg: body.svg } : a)) });
    for (let i = 0; i < 50; i++) await flush();
    assert.ok(!S().customAssets.find((a) => a.id === id2).regions, 'a stale land is dropped');
  },
);

console.log(`creatureBody.selfcheck: ${n} checks passed`);
