// constructCatalogue.selfcheck.mjs — #2108 (constructs, slice 5b): the house constructs are in the catalogue and
// dealt by no one. The proof that existing rolls, deals and takes do not move.
//   1. the catalogue holds all 66, unique, ordinary tiles; the library before them is untouched
//   2. every dealing surface excludes them (KINETIC roll, chapter decks, pool panel, dice, placeable pool)
//   3. the dealable set is exactly what it was without them
//   4. a take records no house tile (the recorded pool is the resolver's input, never the catalogue)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, ASSETS_CONSTRUCTS } from './assets/index.js';
import { NEVER_DEALT, dealableRecords } from '../state/rollPool.mjs';
import { CHAPTER_UNDEALT } from './chapters.js';
import { poolDescriptors } from '../panels/assetPoolLogic.mjs';
import { isConstructTileId, isConstructTile } from '../engine/constructAssembler.js';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const ids = new Set(ASSETS_CONSTRUCTS.map((a) => a.id));

// 1
{
  assert.equal(ASSETS_CONSTRUCTS.length, 66);
  assert.equal(ids.size, 66);
  assert.ok(ASSETS_CONSTRUCTS.every((a) => isConstructTileId(a.id) && isConstructTile(a)));
  const inLib = ASSETS.filter((a) => ids.has(a.id));
  assert.equal(inLib.length, 66, 'all 66 are catalogue members');
  assert.equal(new Set(ASSETS.map((a) => a.id)).size, ASSETS.length, 'no id collides with the library');
  const rest = ASSETS.filter((a) => !ids.has(a.id));
  assert.equal(rest.length, 985, 'the library before the house set is 985, as it was');
  ok('66 construct tiles in the catalogue, unique; the other 985 are untouched');
}

// 2
{
  for (const id of ids) {
    assert.ok(NEVER_DEALT.includes(id), `rollPool ${id}`);
    assert.ok(CHAPTER_UNDEALT.includes(id), `chapters ${id}`);
  }
  assert.equal(poolDescriptors(ASSETS).filter((d) => ids.has(d.id)).length, 0, 'pool panel shows none');
  const read = (rel) => readFileSync(join(here, rel), 'utf8');
  for (const rel of ['../curator/dice.js', '../gl/liveResolve.mjs']) {
    assert.match(read(rel), /\.\.\.ASSETS_CONSTRUCTS/, `${rel} excludes the house set`);
  }
  ok('KINETIC roll, chapter decks, pool panel, dice and placeable pool all exclude the house set');
}

// 3
{
  const dealable = dealableRecords(ASSETS);
  assert.equal(dealable.filter((r) => ids.has(r.id)).length, 0);
  const without = dealableRecords(ASSETS.filter((a) => !ids.has(a.id)));
  assert.deepEqual(
    dealable.map((r) => r.id),
    without.map((r) => r.id),
    'the dealable set is identical with or without the house set',
  );
  ok(`${dealable.length} dealable records, identical with or without the 66`);
}

// 4
{
  const src = readFileSync(join(here, '../gl/liveLoop.mjs'), 'utf8');
  assert.ok(!/ASSETS_CONSTRUCTS|constructHouse/.test(src), 'the live loop never reads the house set');
  ok('the live loop does not read the house set, so no take records one');
}

console.log(`constructCatalogue.selfcheck: OK (${checks} checks)`);
