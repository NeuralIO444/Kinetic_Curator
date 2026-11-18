// constructHouse.selfcheck.mjs — #2108 (constructs, slice 5a): the house set, measured against the ruling.
//
//   1. six per style, eleven styles, 66 in all, every one honest (the bank's own door keeps it whole)
//   2. a pure function: the same set, byte for byte, every time; ids unique
//   3. every record draws a tile; the tile is an ordinary pool asset with its own id shape
//   4. the set moves when its recipe moves: another vocabulary is another id, never the same id for a new shape
//   5. only the catalogue reads the house set (5b); every dealing surface excludes it
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { houseConstructs, houseConstructTiles, houseSeed, HOUSE_PER_STYLE } from './constructHouse.js';
import { sanitizeConstructRecord, isConstructTileId, isConstructTile } from './constructAssembler.js';
import { CONSTRUCT_STYLE_IDS } from './constructRules.js';
import { COST_WARNING_THRESHOLD } from '../assets/ingest.js';
import { ASSETS } from '../data/assets/index.js';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const find = (id) => byId.get(id);

// 1 — six per style, honest.
{
  const set = houseConstructs(find);
  assert.equal(set.length, CONSTRUCT_STYLE_IDS.length * HOUSE_PER_STYLE);
  assert.equal(set.length, 66);
  for (const style of CONSTRUCT_STYLE_IDS)
    assert.equal(set.filter((r) => r.style === style).length, HOUSE_PER_STYLE, style);
  for (const rec of set) assert.equal(JSON.stringify(sanitizeConstructRecord(rec)), JSON.stringify(rec), rec.id);
  assert.deepEqual([...new Set(set.map((r) => r.style))], [...CONSTRUCT_STYLE_IDS], 'Canon order, every style present');
  ok('66 records, six per style in Canon order, every one passes the bank door unchanged');
}

// 2 — pure, and unique.
{
  const a = JSON.stringify(houseConstructs(find));
  assert.equal(a, JSON.stringify(houseConstructs(find)));
  assert.equal(a, JSON.stringify(houseConstructs((id) => byId.get(id))));
  const ids = houseConstructs(find).map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate id');
  assert.equal(houseSeed('bauhaus', 0), houseSeed('bauhaus', 0));
  assert.notEqual(houseSeed('bauhaus', 0), houseSeed('bauhaus', 1));
  assert.notEqual(houseSeed('bauhaus', 0), houseSeed('memphis', 0));
  // Project-free: a hand-edited ATTACH map is opt-in, so the default set does not depend on one.
  assert.equal(a, JSON.stringify(houseConstructs(find, null)));
  ok('the set is a pure function: identical every time, 66 distinct ids, project-free by default');
}

// 3 — tiles.
{
  const tiles = houseConstructTiles(find);
  assert.equal(tiles.length, 66);
  let worst = 0;
  for (const t of tiles) {
    assert.ok(isConstructTileId(t.id) && isConstructTile(t), t.id);
    assert.ok(t.svg.length > 0 && t.cost.score < COST_WARNING_THRESHOLD, `${t.id} under the cost line`);
    worst = Math.max(worst, t.cost.score);
  }
  assert.equal(new Set(tiles.map((t) => t.id)).size, 66);
  // A pool missing a primitive shrinks the vocabulary: the set is still whole, and never names the missing piece.
  const gone = 'geo_circle_01';
  const gap = houseConstructs((id) => (id === gone ? undefined : find(id)));
  assert.equal(gap.length, 66);
  assert.ok(gap.every((r) => r.parts.every((p) => p.asset !== gone)));
  // A pool with none of a style's vocabulary contributes none of that style (the set only shrinks to what draws).
  const noSwiss = new Set(['geo_square_01', 'line_solid_01', 'geo_cross_01', 'geo_diamond_01']);
  const less = houseConstructs((id) => (noSwiss.has(id) ? undefined : find(id)));
  assert.ok(!less.some((r) => r.style === 'swiss'));
  ok(`66 tiles, every one an ordinary pool asset under the cost line (worst ${worst} of ${COST_WARNING_THRESHOLD})`);
}

// 4 — the id moves with the recipe.
{
  const base = houseConstructs(find);
  // The same vocabulary with an edited primitive's POINTS: another set of ids for bauhaus, the rest unchanged.
  const edited = houseConstructs(find, {
    geo_circle_01: [
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ],
  });
  const bauhausBase = new Set(base.filter((r) => r.style === 'bauhaus').map((r) => r.id));
  const bauhausEdit = edited.filter((r) => r.style === 'bauhaus').map((r) => r.id);
  assert.ok(
    bauhausEdit.every((id) => !bauhausBase.has(id)),
    'edited points: no bauhaus id survives',
  );
  const rest = (s) =>
    s
      .filter((r) => r.style !== 'bauhaus')
      .map((r) => r.id)
      .join();
  assert.equal(rest(base), rest(edited), 'the other styles are untouched');
  ok('an edited vocabulary changes the ids of its style alone: the same name never means a new shape');
}

// 5 — only the catalogue reads it.
{
  const root = join(here, '..');
  const importers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules') walk(p);
      } else if (/\.(mjs|js|jsx)$/.test(name) && !/^constructHouse\.(selfcheck\.mjs|js)$/.test(name)) {
        if (/from\s+['"][^'"]*constructHouse/.test(readFileSync(p, 'utf8'))) importers.push(p.slice(root.length + 1));
      }
    }
  };
  walk(root);
  // #2328: the gait suite reads the house set as real constructs to derive join trees from (a test, not a stage path)
  assert.deepEqual(
    importers.filter((f) => f !== 'engine/gait.selfcheck.mjs'),
    ['data/assets/index.js'],
    'only the catalogue reads the house set',
  );
  ok('only the catalogue (data/assets/index.js) reads the house set');
}

console.log(`constructHouse.selfcheck: OK (${checks} checks)`);
