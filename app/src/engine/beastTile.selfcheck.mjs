// beastTile.selfcheck.mjs — #1962 (BEAST S3b step 2): ASSEMBLE A BEAST makes a Strandbeest a pool tile.
//
//   deal        every dealt beast is feasible (never a stillbirth), deterministic, varied; the nth press is the nth animal
//   tile        a wet-lab creature tile that passes the overlay door with its linkage intact; the thumbnail is the linkage
//   store       the action banks the next beast, never twice; a full pool refuses with a note; it never evicts
//   stage       a placed beast tile walks the REAL scene contract: 12 bars × legs + the beam, and the crank turns
//   untouched   a stage with no beast tile is the same contract it always was
import assert from 'node:assert/strict';
import { dealBeastMeasures, beastTile, beastTileSvg, isBeastTileId } from './beastTile.js';
import { mkRng } from './prng.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { isStillborn } from './jansenSolver.js';
import { sanitizeOverlay, OVERLAY_CAP } from '../assets/overlay.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { useStore } from '../state/store.js';

const S = () => useStore.getState();

// ---- deal
{
  const legs = new Set();
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const m = dealBeastMeasures(99, n);
    assert.ok(!isStillborn(m, m.scale), `beast ${n} is alive`);
    assert.deepEqual(dealBeastMeasures(99, n), m, 'deterministic');
    legs.add(m.legCount);
    seen.add(JSON.stringify(m));
  }
  assert.ok(legs.size >= 4, `legCount varies (${legs.size})`);
  assert.ok(seen.size === 60, 'every ordinal is a different animal');
  assert.notDeepEqual(dealBeastMeasures(99, 0), dealBeastMeasures(100, 0), 'a new seed deals new animals');
}

// ---- tile
const m0 = dealBeastMeasures(7, 0);
const tile = beastTile(m0);
{
  assert.ok(isBeastTileId(tile.id) && tile.category === 'creature' && tile.source === 'wetlab');
  const [clean] = sanitizeOverlay([tile]);
  assert.ok(clean, 'passes the overlay door');
  assert.equal(clean.rig.linkage.measures.legCount, m0.legCount, 'the linkage survives the door');
  assert.equal(clean.rig.bones.length, 0);
  assert.match(beastTileSvg(m0), /^<path d="M/, 'the thumbnail is the linkage drawn');
  assert.ok(!isBeastTileId('user:cr-00000000') && !isBeastTileId('user:beast-xyz'));
}

// ---- a stillbirth is never a tile
{
  let dead = null;
  for (let i = 1; i < 4000 && !dead; i++) {
    const rng = mkRng(i * 7919);
    const m = sanitizeMeasures({
      ...m0,
      ...Object.fromEntries('abcdefghijl'.split('').map((c) => [c, m0[c] * (0.5 + 1.5 * rng())])),
    });
    if (isStillborn(m, m.scale)) dead = m;
  }
  assert.ok(dead && beastTile(dead) === null, 'a stillbirth mints no tile');
}

// ---- store
{
  useStore.setState({ seed: 7, customAssets: [], beastAssembleNote: null });
  S().assembleBeast();
  const first = S().customAssets.map((a) => a.id);
  assert.equal(first.length, 1);
  assert.equal(first[0], tile.id, 'the first press on seed 7 is the first animal');
  assert.deepEqual(S().beastAssembleNote, { id: tile.id, status: 'banked' });
  S().assembleBeast();
  const two = S().customAssets.map((a) => a.id);
  assert.equal(new Set(two).size, 2, 'the next press is the next animal, never a duplicate');
  // a reload re-runs the door: nothing lost
  assert.equal(sanitizeOverlay(S().customAssets).length, 2);
  // a full pool refuses and evicts nothing
  const filler = Array.from({ length: OVERLAY_CAP - 2 }, (_, i) => ({
    id: `user:fill-${i}`,
    category: 'fragments',
    svg: '<circle cx="5" cy="5" r="3"/>',
  }));
  useStore.setState({ customAssets: [...S().customAssets, ...filler] });
  const before = S().customAssets.length;
  S().assembleBeast();
  assert.equal(S().customAssets.length, before, 'a full pool takes no beast');
  assert.equal(S().beastAssembleNote.status, 'pool-full');
}

// ---- the stage
{
  const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
  const items = [
    { assetId: tile.id, x: 300, y: 270, scale: 3, rotation: 0, key: 'b' },
    ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 150, y: 470, scale: 0.6, rotation: 0, key: `s${i}` })),
  ].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
  const contract = (doc, its = items) =>
    buildSceneContract({
      doc: { seed: 7, customAssets: [tile], ...doc },
      resolvedLayers: [{ id: 'L', isFx: false, items: its }],
    });
  const a = contract({ kinemeTime: 0.4 });
  const parts = a.instances.filter((i) => i.key.startsWith('b#'));
  assert.equal(parts.length, 1 + m0.legCount * 12, 'beam + 12 bars on every leg');
  assert.ok(!a.instances.some((i) => i.key === 'b'), 'the tile mark is not drawn');
  const b = contract({ kinemeTime: 1.4 });
  assert.notDeepEqual(
    a.instances.map((i) => i.x),
    b.instances.map((i) => i.x),
    'the crank turns with the kineme clock',
  );
  assert.deepEqual(contract({ kinemeTime: 0.4 }).instances, a.instances, 'deterministic');
  const none = items.filter((i) => i.assetId !== tile.id);
  assert.equal(contract({}, none).instances.length, STAGE.length, 'no beast on stage: untouched');
}

console.log('beastTile.selfcheck: ok');
