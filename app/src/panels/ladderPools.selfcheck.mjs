// ladderPools.selfcheck.mjs — the CREATURE rung's body pool and parts pile (issue #2303; spec §14).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ladderBodyPool, ladderPartIds, ladderOverlay, LADDER_BODY_FLOOR } from './ladderPools.mjs';
import { houseConstructs } from '../engine/constructHouse.js';
import { attachPointsFor } from '../engine/autoAttach.js';
import { founderRoles, creatureAdapter } from '../deal/creatureAdapter.mjs';
import { press } from '../deal/kineticEngine.mjs';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const svgOf = (id) => (byId.get(id) || {}).svg;
const records = houseConstructs((id) => byId.get(id) || null);
const library = ASSETS.slice(0, 40);
const shelf = [
  { style: records[0].style, asset: records[0].parts[0].asset },
  { style: records[0].style, asset: records[0].parts[1].asset },
];

ok('the floor is three', () => assert.equal(LADDER_BODY_FLOOR, 3));

ok('below the floor the body pool is the library itself; at the floor it is only construct tiles', () => {
  assert.equal(ladderBodyPool({ library, constructRecords: records.slice(0, 2), svgOf }), library);
  const pool = ladderBodyPool({ library, constructRecords: records.slice(0, 3), svgOf });
  assert.equal(pool.length, 3);
  assert.ok(pool.every((a) => /^user:cn-[0-9a-f]{8}$/.test(a.id) && a.svg));
});

ok('kept shapes never enter the body pool', () => {
  const pool = ladderBodyPool({ library, constructRecords: records.slice(0, 5), svgOf });
  const shapeIds = new Set(shelf.map((s) => s.asset));
  assert.ok(pool.every((a) => !shapeIds.has(a.id)));
});

ok('a construct that cannot draw is left out, and does not count toward the floor', () => {
  const broken = { ...records[0], parts: [{ ...records[0].parts[0], asset: 'gone' }] };
  assert.deepEqual(ladderOverlay({ constructRecords: [broken], svgOf }), []);
  assert.equal(ladderBodyPool({ library, constructRecords: [broken, ...records.slice(0, 2)], svgOf }), library);
  assert.deepEqual(ladderOverlay({ constructRecords: records, svgOf: null }), []);
});

ok('the parts pile: stage first, then constructs, then kept shapes, no duplicates', () => {
  const tiles = ladderOverlay({ constructRecords: records.slice(0, 2), svgOf }).map((t) => t.id);
  const ids = ladderPartIds({ stageIds: ['a', 'b', tiles[0]], constructTileIds: tiles, shelf: [...shelf, shelf[0]] });
  assert.deepEqual(ids, ['a', 'b', tiles[0], tiles[1], shelf[0].asset, shelf[1].asset]);
  assert.deepEqual(ladderPartIds({}), []);
});

ok('checked: a construct tile reads as a body, and KIN deals construct-bodied creatures from it', () => {
  const tiles = ladderOverlay({ constructRecords: records, svgOf });
  const skeletal = tiles.filter((t) => {
    const pts = founderRoles(attachPointsFor(t, null));
    return pts.some((p) => p.role === 'H') && pts.some((p) => p.role === 'L');
  });
  assert.equal(skeletal.length, tiles.length, 'every house construct has a head and limbs');
  const pool = ladderBodyPool({ library, constructRecords: records.slice(0, 6), svgOf });
  const hand = press(creatureAdapter, { scope: 'weak', seed: 0x2303, press: 0, ctx: { library: pool, bank: [] } }).hand;
  assert.ok(hand.length > 0);
  assert.ok(
    hand.every((r) => pool.some((a) => a.id === r.body)),
    'every body is a construct',
  );
});

ok('pure: inputs not mutated; no clock, no Math.random, no store, no React', () => {
  const before = JSON.stringify(records.slice(0, 3));
  ladderBodyPool({ library, constructRecords: records.slice(0, 3), svgOf });
  assert.equal(JSON.stringify(records.slice(0, 3)), before);
  const src = readFileSync(new URL('./ladderPools.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'useStore', "from 'react'"])
    assert.ok(!src.includes(bad), `ladderPools.mjs has no ${bad}`);
});

console.log(`ladderPools selfcheck: ${n} ok`);
