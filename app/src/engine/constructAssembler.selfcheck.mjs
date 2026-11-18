// constructAssembler.selfcheck.mjs — #2108 (constructs, slice 1; spec docs/design/constructs-spec.md): the assembler, measured against the spec.
//
//   1. a construct assembles from a style's vocabulary: 12–16 pieces, every piece from the vocabulary
//   2. the same seed + style + vocabulary assembles the identical record, byte for byte; the seed varies it
//   3. every piece after the first sits on a join, facing out: shapes abut and grow outward, never pile up
//   4. the whole composition stays inside the box, and the record's own points are honest ATTACH points
//   5. the deal rides its own registered channel and no other
//   6. nothing to join at is refused: no style, or no primitive carrying a point, assembles nothing
//   7. not on stage yet: only the project document and the store's bank read the assembler
//   8. (slice 2) the tile is a pure function of the record: one group per piece, each drawn where it was joined
//   9. (slice 2) no tile without every piece; the tile passes the pool's own door; the bake declares its cost
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleConstruct,
  constructPartPoint,
  constructTileId,
  isConstructTileId,
  CONSTRUCT_KIND,
  CONSTRUCT_CHANNEL,
  CONSTRUCT_MIN_PARTS,
  CONSTRUCT_MAX_PARTS,
  constructTileSvg,
  constructTile,
  constructCost,
  isConstructTile,
} from './constructAssembler.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { assetCostScore, COST_WARNING_THRESHOLD } from '../assets/ingest.js';
import { isCreatureTile } from './creatureTileId.js';
import { sanitizeAttachPoints, ATTACH_BOX, MAX_ATTACH } from './assetAttach.js';
import { autoAttachPoints } from './autoAttach.js';
import { isCreatureTileId } from './creatureTileId.js';
import { STRING_CHANNEL_GROUPS, startStringChannelObservation, endStringChannelObservation } from './kernel/rng.js';
import { ASSETS } from '../data/assets/index.js';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

// A real vocabulary: bauhaus's named simple shapes (spec §3), with the points worked out from each shape.
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const BAUHAUS = ['geo_circle_01', 'geo_square_01', 'geo_halfcircle_01', 'geo_quartercircle_01'];
const vocabulary = BAUHAUS.map((id) => {
  const asset = byId.get(id);
  assert.ok(asset, `the pool carries ${id}`);
  return { id, points: autoAttachPoints(asset.svg) };
});
assert.ok(
  vocabulary.some((v) => v.points.length > 1),
  'at least one real primitive carries two points (the shape can grow)',
);
const rule = { style: 'bauhaus', vocabulary };
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761) >>> 0);

// 1 — 12–16 pieces, all from the vocabulary; the record names its kind, style and seed.
{
  const ids = new Set(BAUHAUS);
  const counts = new Set();
  for (const seed of SEEDS) {
    const rec = assembleConstruct({ ...rule, seed });
    assert.ok(rec, `seed ${seed} assembles`);
    assert.equal(rec.kind, CONSTRUCT_KIND);
    assert.equal(rec.style, 'bauhaus');
    assert.equal(rec.seed, seed);
    assert.ok(rec.parts.length >= CONSTRUCT_MIN_PARTS && rec.parts.length <= CONSTRUCT_MAX_PARTS);
    counts.add(rec.parts.length);
    for (const part of rec.parts) assert.ok(ids.has(part.asset), `${part.asset} is in the vocabulary`);
    assert.ok(/^cn-[0-9a-f]{8}$/.test(rec.id));
  }
  assert.deepEqual([...counts].sort(), [12, 13, 14, 15, 16], 'the deal reaches every count from 12 to 16');
  ok('200 seeds assemble 12–16 pieces, every piece from the style vocabulary');
}

// 2 — determinism: byte for byte; the seed is what varies a deal.
{
  for (const seed of SEEDS.slice(0, 40)) {
    const a = JSON.stringify(assembleConstruct({ ...rule, seed }));
    const b = JSON.stringify(assembleConstruct({ ...rule, seed }));
    assert.equal(a, b);
    // Survives a round trip through JSON unchanged (it will live in the project document).
    assert.equal(JSON.stringify(JSON.parse(a)), a);
  }
  const distinct = new Set(SEEDS.map((seed) => JSON.stringify(assembleConstruct({ ...rule, seed }).parts)));
  assert.ok(distinct.size > 190, `seeds vary the deal (${distinct.size} distinct of 200)`);
  const ids = new Set(SEEDS.map((seed) => assembleConstruct({ ...rule, seed }).id));
  assert.equal(ids.size, SEEDS.length, 'every seed takes its own record id');
  // The vocabulary is part of the identity: another style's rule is another record.
  const other = assembleConstruct({ ...rule, style: 'memphis', seed: 7 });
  assert.notEqual(other.id, assembleConstruct({ ...rule, seed: 7 }).id);
  ok('the same seed + style + vocabulary is the identical record; seed and style vary it');
}

// 3 — joins: each later piece's own point lands on a point of an earlier piece.
{
  const pts = new Map(vocabulary.map((v) => [v.id, sanitizeAttachPoints(v.points)]));
  const MID = { x: ATTACH_BOX / 2, y: ATTACH_BOX / 2 };
  let joins = 0;
  let worst = 0;
  let faced = 0;
  let outward = 0;
  for (const seed of SEEDS) {
    const rec = assembleConstruct({ ...rule, seed });
    rec.parts.forEach((part, i) => {
      assert.ok(part.own >= 0 && part.own < pts.get(part.asset).length, 'own names a real point');
      if (i === 0) return;
      const mine = constructPartPoint(part, pts.get(part.asset)[part.own]);
      let best = Infinity;
      let host = null;
      for (const earlier of rec.parts.slice(0, i)) {
        for (const p of pts.get(earlier.asset)) {
          const q = constructPartPoint(earlier, p);
          const d = Math.hypot(q.x - mine.x, q.y - mine.y);
          if (d < best) {
            best = d;
            host = earlier;
          }
        }
      }
      worst = Math.max(worst, best);
      joins++;
      // Facing out: the piece's body lies on the far side of the join from the piece it joins (quarter turns
      // snap within 45° of straight out, so the two directions never oppose). A point at a box centre has no
      // outward side and is skipped.
      const centre = constructPartPoint(part, MID);
      const hostCentre = constructPartPoint(host, MID);
      const out = { x: mine.x - hostCentre.x, y: mine.y - hostCentre.y };
      const body = { x: centre.x - mine.x, y: centre.y - mine.y };
      if (Math.hypot(out.x, out.y) > 0.5 && Math.hypot(body.x, body.y) > 0.5) {
        faced++;
        if (out.x * body.x + out.y * body.y > 0) outward++;
      }
    });
  }
  // Two pieces can offer the same join, so the nearest-point host is occasionally not the dealt one; the rule
  // must hold for nearly all of them, and a random turn would hold for about half.
  assert.ok(outward / faced > 0.98, `pieces join facing out (${outward} of ${faced})`);
  // The record rounds positions to 2 decimals and scale to 4; a join holds well inside a tenth of a box unit.
  assert.ok(worst < 0.1, `every join holds (worst gap ${worst.toFixed(4)} box units)`);
  ok(`${joins} joins: every piece sits on a point of an earlier piece, facing out (${outward}/${faced})`);
}

// 4 — the box: nothing leaves it; the record's own points are honest.
{
  const corners = [
    { x: 0, y: 0 },
    { x: ATTACH_BOX, y: 0 },
    { x: 0, y: ATTACH_BOX },
    { x: ATTACH_BOX, y: ATTACH_BOX },
  ];
  let withPoints = 0;
  for (const seed of SEEDS) {
    const rec = assembleConstruct({ ...rule, seed });
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const part of rec.parts) {
      assert.ok(part.s > 0 && part.s <= 1, 'a piece is never larger than the box');
      for (const c of corners) {
        const q = constructPartPoint(part, c);
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y);
        y1 = Math.max(y1, q.y);
      }
    }
    assert.ok(x0 > 0 && y0 > 0 && x1 < ATTACH_BOX && y1 < ATTACH_BOX, `seed ${seed} stays inside the box`);
    // Fitted, not shrunk: the long side fills the box up to its margin.
    assert.ok(Math.max(x1 - x0, y1 - y0) > ATTACH_BOX - 10, 'the composition fills the box');
    assert.ok(rec.points.length <= MAX_ATTACH);
    assert.deepEqual(rec.points, sanitizeAttachPoints(rec.points), 'the points pass the ATTACH door unchanged');
    assert.ok(
      rec.points.every((p) => !p.role),
      'a construct carries plain points only',
    );
    if (rec.points.length) withPoints++;
  }
  assert.ok(withPoints > 0, 'constructs leave free joins (a construct can join again, or be a body)');
  ok(`every composition fits the box; ${withPoints} of 200 leave free ATTACH points`);
}

// 5 — its own channel: registered, and the only one it draws on (so it can never re-key a creature deal).
{
  assert.equal(STRING_CHANNEL_GROUPS[CONSTRUCT_CHANNEL], 'asset');
  startStringChannelObservation();
  assembleConstruct({ ...rule, seed: 444 });
  assert.deepEqual(endStringChannelObservation(), [CONSTRUCT_CHANNEL]);
  // The tile id is its own shape: a construct is never mistaken for a creature tile, nor the reverse.
  const rec = assembleConstruct({ ...rule, seed: 444 });
  assert.ok(isConstructTileId(constructTileId(rec.id)));
  assert.ok(!isCreatureTileId(constructTileId(rec.id)));
  assert.ok(!isConstructTileId('user:cr-0123abcd'));
  ok("draws ride the registered 'construct' channel alone; the tile id is its own shape");
}

// 6 — refusals, and a dishonest rule is read honestly rather than trusted.
{
  assert.equal(assembleConstruct({ vocabulary, seed: 1 }), null, 'no style');
  assert.equal(assembleConstruct({ style: 'bauhaus', vocabulary: [], seed: 1 }), null, 'no vocabulary');
  assert.equal(
    assembleConstruct({ style: 'bauhaus', vocabulary: [{ id: 'geo_circle_01', points: [] }], seed: 1 }),
    null,
    'no primitive carries a point',
  );
  assert.equal(assembleConstruct(), null);
  // Out-of-box points, duplicate ids and creature roles are cleaned at the door, never carried in.
  const messy = [
    {
      id: 'a',
      points: [
        { x: 50, y: 0, role: 'H' },
        { x: 50, y: 100, role: 'L' },
        { x: 900, y: 5 },
      ],
    },
    { id: 'a', points: [{ x: 1, y: 1 }] },
    { id: '', points: [{ x: 1, y: 1 }] },
    null,
  ];
  const rec = assembleConstruct({
    style: 'bauhaus',
    vocabulary: messy,
    seed: 3,
    rotations: ['x', 45, 405],
    scale: { min: 9 },
  });
  assert.ok(rec && rec.parts.every((p) => p.asset === 'a' && p.own < 2 && p.r === 45));
  // A one-point vocabulary still joins at real points (every piece meets at the one join).
  const leaf = assembleConstruct({
    style: 'memphis',
    vocabulary: [{ id: 'dot', points: [{ x: 50, y: 50 }] }],
    seed: 9,
  });
  assert.ok(leaf && leaf.parts.length >= CONSTRUCT_MIN_PARTS);
  ok('a missing style or an unjoinable vocabulary assembles nothing; a messy rule is cleaned');
}

// 7 — not on stage yet: only the document and the store's bank read the assembler (records are saved and
// loaded); no render, curator or stage deal path does. The WetLab ladder's CONSTRUCT and CREATURE rungs read it
// (wetlab-ladder-spec §13, §14): the WetLab is not the stage, and each file is named here, so anything else still trips.
{
  const root = join(here, '..');
  const allowed = new Set([
    'state/projectDocument.js',
    'state/slices/globalSlice.js',
    'state/recipeUrls.v3.selfcheck.mjs', // #2324: the v3 recipe suite assembles one real construct to dress a scene with (a test)
    'state/sceneApply.js', // #2322: the scene half of the project load moved here from globalSlice; it only sanitizes the doc's records
    'deal/constructAdapter.mjs', // the WetLab CONSTRUCT rung's deal adapter (#2299)
    'panels/constructSettle.mjs', // the WetLab construct tile's settle drawing (#2300)
    'panels/ladderPools.mjs', // the WetLab CREATURE rung's body pool and parts pile (#2303)
    'panels/ladderPools.selfcheck.mjs', // its suite builds real constructs to test against
    'engine/gait.selfcheck.mjs', // #2328: its suite derives join trees from real house constructs (a test)
    'engine/gait.js', // #2328 (gait M2): the join-tree adapter reads where a piece's own point lands (constructPartPoint) — geometry only, no stage path
  ]);
  const importers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules') walk(p);
      } else if (/\.(mjs|js|jsx)$/.test(name) && !/^construct\w+\.(selfcheck\.mjs|js)$/.test(name)) {
        const rel = p.slice(root.length + 1);
        if (allowed.has(rel)) continue;
        if (/from\s+['"][^'"]*constructAssembler/.test(readFileSync(p, 'utf8'))) importers.push(rel);
      }
    }
  };
  walk(root);
  assert.deepEqual(importers, [], 'no stage path reads the construct assembler in this slice');
  ok('only the project document and the bank read the assembler (nothing on stage yet)');
}

// 8 — the tile: a pure function of the record; one group per piece; each piece drawn where it was joined.
{
  const svgOf = (id) => byId.get(id)?.svg;
  const pts = new Map(vocabulary.map((v) => [v.id, sanitizeAttachPoints(v.points)]));
  const GROUP = /<g transform="translate\((\S+) (\S+)\) rotate\((\S+)\) scale\((\S+)\)">/g;
  for (const seed of SEEDS.slice(0, 60)) {
    const rec = assembleConstruct({ ...rule, seed });
    const svg = constructTileSvg(rec, svgOf);
    assert.equal(svg, constructTileSvg(JSON.parse(JSON.stringify(rec)), svgOf), 'the same record is the same tile');
    const groups = [...svg.matchAll(GROUP)];
    assert.equal(groups.length, rec.parts.length, 'one group per piece');
    // Read each transform back out of the markup and apply it the way SVG does (right to left: size, turn, move):
    // the piece's own point must land on a point of an earlier piece — the join, as drawn.
    const drawn = groups.map((g) => ({ x: Number(g[1]), y: Number(g[2]), r: Number(g[3]), s: Number(g[4]) }));
    const apply = (t, p) => {
      const a = (t.r * Math.PI) / 180;
      const sx = t.s * p.x;
      const sy = t.s * p.y;
      return { x: t.x + sx * Math.cos(a) - sy * Math.sin(a), y: t.y + sx * Math.sin(a) + sy * Math.cos(a) };
    };
    rec.parts.forEach((part, i) => {
      if (i === 0) return;
      const mine = apply(drawn[i], pts.get(part.asset)[part.own]);
      let best = Infinity;
      for (let j = 0; j < i; j++) {
        for (const p of pts.get(rec.parts[j].asset)) {
          const q = apply(drawn[j], p);
          best = Math.min(best, Math.hypot(q.x - mine.x, q.y - mine.y));
        }
      }
      assert.ok(best < 0.1, `seed ${seed} piece ${i} is drawn on its join (gap ${best.toFixed(4)})`);
    });
    // Every piece's own markup is inside its group, untouched.
    rec.parts.forEach((part) => assert.ok(svg.includes(`">${svgOf(part.asset)}</g>`)));
  }
  ok('the tile draws one group per piece, each on its join, and the same record bakes the same tile');
}

// 9 — the pool entry: refused without every piece; passes the pool's door; declares its cost.
{
  const svgOf = (id) => byId.get(id)?.svg;
  const rec = assembleConstruct({ ...rule, seed: 2108 });
  const tile = constructTile(rec, svgOf);
  assert.ok(tile);
  assert.ok(isConstructTileId(tile.id) && isConstructTile(tile) && !isCreatureTile(tile));
  assert.deepEqual(tile.tags, ['construct']);
  assert.equal(tile.style, 'bauhaus');
  assert.deepEqual(tile.points, rec.points);
  // The pool's own trust boundary keeps the tile's drawing byte for byte (nothing hostile, no disallowed tag).
  const [kept] = sanitizeOverlay([tile]);
  assert.ok(kept && kept.svg === tile.svg && kept.id === tile.id && kept.category === 'construct');
  // The cost is the house score of the composed drawing, with the house warning line.
  assert.equal(tile.cost.score, assetCostScore(tile.svg));
  assert.equal(tile.cost.over, tile.cost.score > COST_WARNING_THRESHOLD);
  assert.ok(tile.cost.score >= rec.parts.length, 'at least one subpath per piece');
  assert.equal(constructCost(tile.svg).score, tile.cost.score);
  // No tile without every piece: a primitive the pool no longer carries refuses the whole tile.
  const gone = rec.parts[3].asset;
  assert.equal(
    constructTile(rec, (id) => (id === gone ? undefined : svgOf(id))),
    null,
  );
  assert.equal(
    constructTileSvg(rec, () => ''),
    null,
  );
  assert.equal(constructTileSvg({ ...rec, parts: [] }, svgOf), null);
  assert.equal(constructTileSvg({ ...rec, parts: [{ ...rec.parts[0], s: 0 }] }, svgOf), null);
  assert.equal(constructTileSvg({ ...rec, parts: [{ ...rec.parts[0], x: NaN }] }, svgOf), null);
  assert.equal(constructTileSvg(rec, null), null);
  assert.equal(constructTile({ ...rec, id: 'cr-0123abcd' }, svgOf), null, 'a creature id is not a construct');
  ok(`the tile is an ordinary pool asset (cost ${tile.cost.score}); a missing piece refuses the whole tile`);
}

console.log(`constructAssembler.selfcheck: OK (${checks} checks)`);
