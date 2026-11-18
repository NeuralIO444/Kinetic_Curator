// constructPieces.selfcheck — #2327 (pure half). Run: node src/engine/constructPieces.selfcheck.mjs
//
// The contract: a construct at rest is the SAME drawing as pieces and as the flat tile. Two routes to one picture —
// the hierarchy walk and the tile's own composition — must agree at every corner of every piece, for any placement.
import assert from 'node:assert/strict';
import {
  constructJoinTree,
  expandConstructPieces,
  flatPiecePlacements,
  pieceCorners,
  pieceMark,
  maxPieceDelta,
  canCollapse,
  planConstructPieces,
  REST_EPSILON,
} from './constructPieces.js';
import { HIER_GLOBAL_BUDGET } from './hierarchy.js';
import { CONSTRUCT_MAX_PARTS } from './constructAssembler.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

// A seeded little generator: the check owns its records, so it cannot drift with the Canon data.
const lcg = (seed) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
function recordOf(seed, n) {
  const r = lcg(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      asset: `prim_${Math.floor(r() * 6)}`,
      x: Math.round((r() * 120 - 10) * 100) / 100,
      y: Math.round((r() * 120 - 10) * 100) / 100,
      r: [0, 90, 180, 270, 37.5][Math.floor(r() * 5)],
      s: Math.round((0.35 + r() * 0.45) * 100) / 100,
    });
  }
  return { id: `cn-${seed.toString(16).padStart(8, '0')}`, style: 'swiss', parts };
}
const placeOf = (seed) => {
  const r = lcg(seed ^ 0x9e3779b9);
  return { centre: { x: r() * 1600 - 200, y: r() * 900 - 100 }, rot: r() * 720 - 360, unit: 0.2 + r() * 6 };
};

// 1 — the join tree: piece 0 is the root, every later piece hangs off an EARLIER one, deterministically.
{
  const rec = recordOf(11, 14);
  const tree = constructJoinTree(rec);
  assert.equal(tree.length, 14);
  assert.deepEqual(tree[0], { id: 'p0', parent: null, depth: 0 });
  tree.slice(1).forEach((n, i) => {
    const pi = Number(n.parent.slice(1));
    assert.ok(pi < i + 1, `${n.id} hangs off an earlier piece`);
    assert.equal(n.depth, tree[pi].depth + 1);
  });
  assert.deepEqual(constructJoinTree(recordOf(11, 14)), tree, 'same record, same tree');
  assert.equal(constructJoinTree({ parts: [] }), null);
  assert.equal(constructJoinTree({ parts: [{ asset: 'a', x: NaN, y: 0, r: 0, s: 1 }] }), null);
  assert.equal(constructJoinTree(recordOf(3, CONSTRUCT_MAX_PARTS + 1)), null, 'more than the cap is no construct');
  ok('the join tree is derived once, parent before child, deterministic; a dishonest record has none');
}

// 2 — THE REST CONTRACT: pieces down the hierarchy land exactly where the flat tile draws them, over many shapes
// and placements (a deep chain, a wide fan, turned, tiny, huge).
{
  let worst = 0;
  let pieceTotal = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const n = 12 + (seed % 5); // 12..16
    const rec = recordOf(seed, n);
    const place = placeOf(seed);
    const { pieces, truncated, problems } = expandConstructPieces(rec, place);
    assert.equal(truncated, false);
    assert.deepEqual(problems, []);
    assert.equal(pieces.length, n);
    const flat = flatPiecePlacements(rec, place);
    const d = maxPieceDelta(pieces, flat);
    // relative: huge placements carry proportionally more float dust
    const rel = d / Math.max(1, place.unit * 100);
    worst = Math.max(worst, rel);
    assert.ok(rel <= REST_EPSILON, `seed ${seed}: pieces ≠ tile by ${d} (rel ${rel})`);
    pieceTotal += pieces.length;
  }
  ok(
    `60 shapes × random placements: pieces and tile agree at every corner (worst relative gap ${worst.toExponential(1)})`,
  );
  assert.ok(pieceTotal >= 60 * 12);
}

// 3 — a forced deep chain (each piece's nearest earlier piece is the one before): depth reaches n-1 and still agrees.
{
  const parts = [];
  for (let i = 0; i < 16; i++) parts.push({ asset: 'prim_0', x: i * 30, y: 0, r: i * 11, s: 0.5 });
  const rec = { id: 'cn-00000001', style: 'swiss', parts };
  const tree = constructJoinTree(rec);
  assert.equal(
    Math.max(...tree.map((n) => n.depth)),
    15,
    'a chain is 16 deep: the hierarchy depth cap does not clip it',
  );
  const place = { centre: { x: 400, y: 300 }, rot: 33, unit: 2 };
  const { pieces, truncated } = expandConstructPieces(rec, place);
  assert.equal(truncated, false);
  assert.equal(pieces.length, 16);
  assert.ok(maxPieceDelta(pieces, flatPiecePlacements(rec, place)) < 1e-6);
  ok('a 16-deep chain is not clipped by the creature depth cap and still rests on the tile');
}

// 4 — a piece mark is the centre of its primitive's box, turned and sized with the piece.
{
  const rec = recordOf(5, 12);
  const place = { centre: { x: 100, y: 100 }, rot: 0, unit: 1 };
  const { pieces } = expandConstructPieces(rec, place);
  for (const p of pieces) {
    const m = pieceMark(p);
    const c = pieceCorners(p);
    assert.ok(Math.abs(m.x - (c[0].x + c[3].x) / 2) < 1e-9 && Math.abs(m.y - (c[0].y + c[3].y) / 2) < 1e-9);
    assert.equal(m.rotation, p.rot);
    assert.equal(m.scale, p.scale);
    assert.equal(m.assetId, p.asset);
  }
  ok('a piece draws as a mark at its box centre, with its own turn and size');
}

// 5 — the collapse never pops: at rest it is allowed with a delta of exactly 0; a piece off its rest holds it.
{
  const rec = recordOf(21, 13);
  const place = placeOf(21);
  const { pieces } = expandConstructPieces(rec, place);
  const at = canCollapse(pieces, rec, place);
  assert.equal(at.ok, true);
  assert.ok(at.delta <= REST_EPSILON * Math.max(1, place.unit * 100), 'delta at the swap frame is zero');
  const nudged = pieces.map((p, i) => (i === 4 ? { ...p, origin: { x: p.origin.x + 0.01, y: p.origin.y } } : p));
  const held = canCollapse(nudged, rec, place);
  assert.equal(held.ok, false, 'a piece still moving holds the collapse a frame');
  assert.ok(held.delta > 0.005);
  assert.equal(canCollapse(null, rec, place).ok, false);
  ok('collapse is allowed at rest with no positional jump, and holds while any piece is off its rest');
}

// 6 — the cap ladder: pieces count against the hierarchy's own budget; whole constructs, earliest first.
{
  const four = [1, 2, 3, 4].map((k) => ({ key: `c${k}`, record: recordOf(k, 16) }));
  const full = planConstructPieces(four);
  assert.deepEqual(full.pieces, ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(full.tiles, []);
  assert.equal(full.used, 64, '4 constructs × 16 pieces');
  assert.ok(full.used <= HIER_GLOBAL_BUDGET);
  const tight = planConstructPieces(four, { budget: 40 }); // room for two whole constructs, not a third
  assert.deepEqual(tight.pieces, ['c1', 'c2']);
  assert.deepEqual(tight.tiles, ['c3', 'c4']);
  assert.equal(tight.used, 32);
  const taken = planConstructPieces(four, { budget: 100, taken: 80 }); // creatures already hold 80 of 100
  assert.deepEqual(taken.pieces, ['c1']);
  const bad = planConstructPieces([{ key: 'x', record: { parts: [] } }, ...four], { budget: 16 });
  assert.deepEqual(bad.tiles, ['x', 'c2', 'c3', 'c4'], 'an undrawable record never takes pieces');
  assert.deepEqual(planConstructPieces(null), { pieces: [], tiles: [], used: 0 });
  // the budget inside the walk too: a construct is never half-built by it
  const cut = expandConstructPieces(recordOf(8, 16), placeOf(8), { budget: 5 });
  assert.equal(cut.truncated, true);
  assert.ok(cut.pieces.length <= 5);
  ok(
    'the cap ladder holds: 4 constructs = 64 pieces under the global budget; over it, whole constructs fall back to tiles',
  );
}

// 7 — pure: no input is touched, same inputs give the same pieces.
{
  const rec = Object.freeze(recordOf(31, 14));
  Object.freeze(rec.parts);
  rec.parts.forEach(Object.freeze);
  const place = Object.freeze({ centre: Object.freeze({ x: 5, y: 6 }), rot: 12, unit: 1.5 });
  const a = expandConstructPieces(rec, place);
  const b = expandConstructPieces(rec, place);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(expandConstructPieces(rec, { ...place, unit: 0 }).pieces, null, 'a zero size draws nothing');
  assert.equal(expandConstructPieces(rec, null).pieces, null);
  ok('pure and deterministic; a bad placement draws nothing');
}

console.log(`constructPieces.selfcheck: OK (${checks} checks)`);
