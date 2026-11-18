// constructStage.selfcheck — #2327 slice 2. Run: node src/engine/constructStage.selfcheck.mjs
import assert from 'node:assert/strict';
import { constructPieceItems } from './constructStage.js';
import { flatPiecePlacements, pieceMark } from './constructPieces.js';
import { ASSETS_CONSTRUCTS, HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const recordOf = (seed, n) => {
  const r = lcg(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      asset: `prim_${Math.floor(r() * 6)}`,
      x: Math.round(r() * 8000) / 100,
      y: Math.round(r() * 8000) / 100,
      r: [0, 90, 180, 270][Math.floor(r() * 4)],
      s: Math.round((0.35 + r() * 0.45) * 100) / 100,
    });
  }
  return { id: `cn-${seed.toString(16).padStart(8, '0')}`, style: 'swiss', parts };
};
const RECORDS = new Map([1, 2, 3, 4, 5].map((k) => [`user:cn-${k.toString(16).padStart(8, '0')}`, recordOf(k, 16)]));
const recordFor = (id) => RECORDS.get(id) || null;
const tile = (k, extra = {}) => ({
  assetId: `user:cn-${k.toString(16).padStart(8, '0')}`,
  x: 300 + k * 10,
  y: 200,
  scale: 1.5,
  scaleY: 1.5,
  rotation: 20 * k,
  alpha: 80,
  color: '#abc',
  accent: '#def',
  zTier: 1,
  key: `m${k}`,
  ...extra,
});
const plain = (n) => ({ assetId: 'geo_circle_01', x: n, y: n, scale: 1, rotation: 0, alpha: 100, key: `g${n}` });
const on = { enabled: true, recordOf: recordFor, moving: () => true }; // in motion: pieces (at rest: the tile, check 0)

// 1 — the hard gate: off, no resolver, no constructs, or an empty stage return THE SAME ARRAY.
{
  const items = Object.freeze([plain(1), tile(1), plain(2)]);
  assert.equal(constructPieceItems(items, { recordOf: recordFor }), items, 'off by default');
  assert.equal(constructPieceItems(items, { enabled: true }), items, 'no resolver');
  const none = [plain(1), plain(2)];
  assert.equal(constructPieceItems(none, on), none, 'no construct on stage: the same array');
  const empty = [];
  assert.equal(constructPieceItems(empty, on), empty);
  assert.equal(constructPieceItems(null, on), null);
  ok('switch off, no resolver, no constructs, or nothing on stage: the same array comes back untouched');
}

// 2 — a construct tile becomes its 16 pieces in place; neighbours and their order are untouched.
{
  const a = plain(1);
  const t = tile(2);
  const b = plain(3);
  const items = [a, t, b];
  const out = constructPieceItems(items, on);
  assert.equal(out.length, 1 + 16 + 1);
  assert.equal(out[0], a, 'the neighbour is the same object');
  assert.equal(out[17], b);
  const pieces = out.slice(1, 17);
  for (const p of pieces) {
    assert.equal(p.color, t.color);
    assert.equal(p.accent, t.accent);
    assert.equal(p.alpha, t.alpha);
    assert.equal(p.zTier, t.zTier);
    assert.equal(p.scale, p.scaleY, 'a piece is square');
    assert.ok(/^m2#p\d+$/.test(p.key), 'the key names the tile, then the piece');
  }
  assert.equal(new Set(pieces.map((p) => p.key)).size, 16, 'every piece has its own key');
  assert.deepEqual(items, [a, t, b], 'the input list is never written');
  ok('a construct tile becomes its pieces in place, inheriting the mark, neighbours untouched, keys stable');
}

// 3 — at rest the piece items ARE the flat tile's pieces under the item's own placement.
{
  const t = tile(3, { x: 512.5, y: 288.25, scale: 2.2, scaleY: 2.2, rotation: 47 });
  const out = constructPieceItems([t], on);
  const flat = flatPiecePlacements(recordFor(t.assetId), {
    centre: { x: t.x, y: t.y },
    rot: t.rotation,
    unit: t.scale,
  });
  assert.equal(out.length, flat.length);
  flat.forEach((f, i) => {
    const m = pieceMark(f);
    assert.equal(out[i].assetId, f.asset);
    for (const k of ['x', 'y', 'rotation', 'scale']) assert.ok(Math.abs(out[i][k] - m[k]) < 1e-9, `${k} of piece ${i}`);
  });
  ok('piece items sit exactly where the flat tile draws the same pieces');
}

// 4 — a stretched tile (scaleY ≠ scale) and an unreadable one stay as tiles; so does an unknown asset.
{
  const stretched = tile(1, { scaleY: 2 });
  const bad = tile(2, { x: NaN });
  const ghost = tile(9);
  const items = [stretched, bad, ghost];
  assert.equal(constructPieceItems(items, on), items, 'nothing to expand: the same array');
  const noY = tile(4);
  delete noY.scaleY;
  assert.equal(constructPieceItems([noY], on).length, 16, 'an item with no scaleY is square');
  ok('stretched, unreadable and unknown tiles stay tiles');
}

// 4b — review of #2374: a mirrored copy and a blended tile stay tiles (pieces would land off a reflected tile, and a
// blend applied per piece is not the blend of the whole mark).
{
  const items = [tile(1, { _mirrored: true }), tile(3, { blend: 'screen' })];
  assert.equal(constructPieceItems(items, on), items, 'mirrored / blended: the same array');
  assert.equal(constructPieceItems([tile(5, { alpha: 100, blend: 'normal' })], on).length, 16, 'opaque + normal deals');
  ok('mirrored and blended tiles stay tiles');
}

// 5 — the cap ladder: whole constructs while the budget holds, earliest on stage first; `taken` counts against it.
{
  const items = [1, 2, 3, 4].map((k) => tile(k));
  const full = constructPieceItems(items, on);
  assert.equal(full.length, 64, '4 constructs × 16 pieces');
  const tight = constructPieceItems(items, { ...on, budget: 40 });
  assert.equal(tight.length, 32 + 2, 'two whole constructs as pieces, two stay tiles');
  assert.equal(tight[32], items[2]);
  assert.equal(tight[33], items[3]);
  const crowded = constructPieceItems(items, { ...on, budget: 100, taken: 90 });
  assert.equal(crowded, items, 'no room: the same array');
  ok('the cap ladder holds with 4 constructs on stage; over budget, whole constructs fall back to tiles');
}

// 6 — deterministic.
{
  const items = [tile(1), plain(1), tile(5)];
  assert.equal(JSON.stringify(constructPieceItems(items, on)), JSON.stringify(constructPieceItems(items, on)));
  ok('same stage, same pieces');
}

// 7 — the real house set: every house tile has its record, and a tile on stage deals as exactly its record's pieces.
{
  assert.ok(ASSETS_CONSTRUCTS.length > 0);
  assert.equal(HOUSE_CONSTRUCT_RECORDS.size, ASSETS_CONSTRUCTS.length, 'one record per tile');
  for (const t of ASSETS_CONSTRUCTS) assert.ok(HOUSE_CONSTRUCT_RECORDS.has(t.id), `${t.id} has its record`);
  const house = { enabled: true, recordOf: (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null, moving: () => true };
  for (const t of ASSETS_CONSTRUCTS.slice(0, 12)) {
    const rec = HOUSE_CONSTRUCT_RECORDS.get(t.id);
    const out = constructPieceItems([{ assetId: t.id, x: 640, y: 360, scale: 1.2, scaleY: 1.2, rotation: 15 }], house);
    assert.equal(out.length, rec.parts.length, `${t.id} deals ${rec.parts.length} pieces`);
    assert.ok(rec.parts.length >= 12 && rec.parts.length <= 16);
  }
  ok('every house tile has its record, and deals as its 12–16 pieces');
}

console.log(`constructStage.selfcheck: OK (${checks} checks)`);
