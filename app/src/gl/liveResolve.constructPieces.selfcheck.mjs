// node src/gl/liveResolve.constructPieces.selfcheck.mjs — #2327: the REAL resolver deals constructs as pieces behind the switch.
// No GL: the resolver is pure up to its items. The pool is one house construct only, so every mark on stage is that tile.
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS_CONSTRUCTS, HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};

const tile = ASSETS_CONSTRUCTS[0];
const record = HOUSE_CONSTRUCT_RECORDS.get(tile.id);
assert.ok(tile && record, 'a house construct exists');

const input = (over = {}) => ({
  canvasW: 1000,
  canvasH: 700,
  layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
  activeLayerId: 'a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: { [tile.id]: true },
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
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
  assetAttach: {},
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 4, particleCount: 4 },
  loopTimeMs: 1000,
  dtSec: 1 / 60,
  dishPins: [],
  dishFormed: [],
  dishLimbs: [],
  dishTraits: [],
  ...over,
});
const itemsOf = (over) => {
  const r = createLiveResolver();
  try {
    let out;
    for (let f = 0; f < 3; f++) out = r.resolveLayers(input({ ...over, loopTimeMs: 1000 + f * 17 }));
    return out.flatMap((e) => e.items || []);
  } finally {
    r.dispose();
  }
};

const off = itemsOf({});
const offFalse = itemsOf({ constructPieces: false });
const on = itemsOf({ constructPieces: true });

// 1 — the hard gate: no key, and a false key, are the same stage.
assert.ok(off.length > 0, 'the stage has marks');
assert.ok(
  off.every((it) => it.assetId === tile.id),
  'every mark is the construct tile',
);
assert.equal(JSON.stringify(offFalse), JSON.stringify(off), 'off = absent');
ok('switch absent or false: every mark is still the flat tile, byte for byte');

// 2 — on: each tile became exactly its record's pieces; no tile is left; the pieces are the record's primitives.
{
  const n = record.parts.length;
  assert.equal(on.length, off.length * n, `${off.length} tiles × ${n} pieces`);
  assert.ok(
    on.every((it) => it.assetId !== tile.id),
    'no flat tile remains',
  );
  const prims = new Set(record.parts.map((p) => p.asset));
  assert.ok(
    on.every((it) => prims.has(it.assetId)),
    "every item is one of the record's primitives",
  );
  ok(`switch on: ${off.length} tiles deal as ${on.length} pieces (${n} each), none left flat`);
}

// 3 — the pieces keep the tile's mark: same colour, alpha and z tier as the tile they came from.
{
  const n = record.parts.length;
  for (let t = 0; t < off.length; t++) {
    for (let k = 0; k < n; k++) {
      const piece = on[t * n + k];
      assert.equal(piece.color, off[t].color);
      assert.equal(piece.alpha, off[t].alpha);
      assert.equal(piece.zTier, off[t].zTier);
    }
  }
  ok('pieces inherit the tile mark (colour, alpha, z tier), in the tile’s place in the order');
}

console.log(`liveResolve.constructPieces.selfcheck: OK (${checks} checks)`);
