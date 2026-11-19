// node src/gl/liveResolve.constructCap.selfcheck.mjs
// #2327 (last item, Matt's ruling 2026-11-18 19:06 PT) — creature pieces count against the shared piece cap. The
// creatures are appended AFTER the layers deal their constructs, so the resolver takes their count first, as the pure
// upper bound the builders give for the frame's input (mothItemBound / dishCreatureItemBound), and passes it to the
// construct stage as `taken`:
//   1. the bound is never below what the builders actually append (moths, a second wing pair, the dish creature)
//   2. with creatures on stage, construct pieces + creature items never exceed the cap (HIER_GLOBAL_BUDGET); with
//      enough moths to fill it, every construct stays its tile; with none, the constructs deal as before
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS, ASSETS_CONSTRUCTS } from '../data/assets/index.js';
import { canonGaits } from '../data/canon/gaits.js';
import { gaitInputStamp } from '../engine/gaitAssign.js';
import { HIER_GLOBAL_BUDGET } from '../engine/hierarchy.js';
import { mothItemBound, MOTH_ITEMS_MAX } from '../engine/creature.js';
import { dishCreatureItemBound } from '../engine/dishCreature.js';
import { mergePool } from '../assets/overlay.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TILE = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const L = { id: 'lyr-a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
const STABLE = {
  canvasW: 1000,
  canvasH: 700,
  layers: [L],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 7,
  paletteId: 'bone',
  userPalettes: [],
  enabledAssets: { [TILE]: true, creature: true },
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  scaleMul: 1,
  alphaBoost: 0,
  assetAttach: {},
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 40, kinemeBreath: 0, kinemePulse: 0, kinemeDrift: 0 },
  constructPieces: true,
  gaits: gaitInputStamp({ [TILE]: { gaitId: canonGaits('organic').performing.id } }, 120),
};
const POOL = mergePool(ASSETS, []);

/** Run `frames` frames with `pins` formed moths (`hosted` of them the dish creature's, `limbs` wing pairs each). */
function run({ pins = 0, hosted = 0, limbs = 1, frames = 100 } = {}) {
  const r = createLiveResolver();
  const at = Array.from({ length: pins }, (_, i) => ({ x: 80 + (i % 9) * 105, y: 90 + Math.floor(i / 9) * 160 }));
  const rows = [];
  for (let f = 0; f < frames; f++) {
    const input = {
      ...STABLE,
      loopTimeMs: (f + 1) * (1000 / 60),
      dtSec: 1 / 60,
      ...(pins
        ? {
            dishPins: at,
            dishFormed: at.map(() => true),
            dishHosted: at.map((_, i) => i < hosted),
            dishLimbs: at.map(() => limbs),
          }
        : {}),
    };
    const items = r.resolveLayers(input).flatMap((e) => e.items || []);
    rows.push({
      moth: items.filter((i) => i._creature && String(i.key).startsWith('creature:')).length,
      dish: items.filter((i) => i._creature && String(i.key).startsWith('dish:')).length,
      pieces: items.filter((i) => typeof i.key === 'string' && i.key.includes('#p')).length,
      tiles: items.filter((i) => i.assetId === TILE).length,
      mothBound: mothItemBound(input),
      dishBound: dishCreatureItemBound(input, POOL),
    });
  }
  r.dispose();
  return rows;
}

ok('the creatures’ bound is never below what they append (moths, the second wing pair, the dish creature)', () => {
  for (const rows of [run({ pins: 6 }), run({ pins: 6, limbs: 2 }), run({ pins: 6, hosted: 2, limbs: 2 })]) {
    assert.ok(
      rows.some((r) => r.moth > 0),
      'moths on stage',
    );
    for (const r of rows) {
      assert.ok(r.moth <= r.mothBound, `moths ${r.moth} ≤ bound ${r.mothBound}`);
      assert.ok(r.dish <= r.dishBound, `dish ${r.dish} ≤ bound ${r.dishBound}`);
    }
  }
  assert.ok(
    run({ pins: 6, hosted: 2 }).some((r) => r.dish > 0),
    'the dish creature on stage',
  );
});

ok('with creatures on stage the cap holds: construct pieces + creature items never exceed it', () => {
  const none = run({ frames: 10 });
  assert.ok(none[9].pieces > 0 && none[9].moth === 0, 'no creatures: the constructs deal as pieces');
  const full = Math.ceil(HIER_GLOBAL_BUDGET / MOTH_ITEMS_MAX);
  for (const pins of [4, full - 2, full - 1, full]) {
    const rows = run({ pins, hosted: 1, limbs: 2, frames: 60 });
    for (const r of rows) {
      assert.ok(
        r.pieces + r.moth + r.dish <= HIER_GLOBAL_BUDGET,
        `${pins} pins: ${r.pieces} pieces + ${r.moth + r.dish} creature items ≤ ${HIER_GLOBAL_BUDGET}`,
      );
      assert.ok(r.pieces <= Math.max(0, HIER_GLOBAL_BUDGET - r.mothBound - r.dishBound), 'pieces fit the room left');
    }
    if (pins === full)
      assert.ok(
        rows.every((r) => r.pieces === 0 && r.tiles > 0),
        'a full cap: every construct a tile',
      );
  }
});

console.log(`liveResolve.constructCap.selfcheck: ${n} checks ok`);
