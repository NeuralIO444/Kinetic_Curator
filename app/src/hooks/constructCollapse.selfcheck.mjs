// node src/hooks/constructCollapse.selfcheck.mjs
// #2327 slice 3 (gait ruling 5): the governor's construct collapse and the stage switch. Constructs draw as live pieces
// while the CONSTRUCTS gate is on; the governor's last rung (cut 6.5) collapses them to their flat tiles, only after the
// freeze, so the swap never pops; recovery brings the pieces back first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextGovernorCut, GOVERNOR_RESTORE_CUTS, watchdogMayTrip } from './governorCuts.js';
import { constructPieceItems } from '../engine/constructStage.js';
import { canCollapse, expandConstructPieces } from '../engine/constructPieces.js';
import { HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// A snapshot where every earlier rung has already been taken (the ladder's floor, frozen).
const floor = (over = {}) => ({
  fxaa: false,
  renderScale: 0.33,
  quality: 'performance',
  assetThin: true,
  perfClampOverride: { count: 80 },
  effectiveCount: 80,
  creatureCount: 0,
  creatureShed: 0,
  slowRender: true,
  ...over,
});

ok('the collapse is the rung after the freeze, only when the CONSTRUCTS gate is on', () => {
  assert.equal(nextGovernorCut(floor()), null, 'gate off: the ladder ends at the freeze, as before');
  const cut = nextGovernorCut(floor({ constructPiecesActive: true }));
  assert.equal(cut.kind, 'constructCollapse');
  assert.equal(cut.constructCollapse, true);
  assert.equal(
    nextGovernorCut(floor({ constructPiecesActive: true, constructCollapse: true })),
    null,
    'then exhausted',
  );
});

ok('never before the freeze: with motion still live, the freeze comes first', () => {
  const cut = nextGovernorCut(floor({ constructPiecesActive: true, slowRender: false }));
  assert.equal(cut.kind, 'slowRender');
});

ok('the watchdog waits while the collapse rung stands (ladder-first, #1919)', () => {
  assert.equal(watchdogMayTrip(floor({ constructPiecesActive: true }), { effFps: 10, shedFps: 40 }), false);
  assert.equal(
    watchdogMayTrip(floor({ constructPiecesActive: true, constructCollapse: true }), { effFps: 10, shedFps: 40 }),
    true,
  );
});

ok('recovery: the collapse is the last shed and the first restored', () => {
  const kinds = GOVERNOR_RESTORE_CUTS.map((c) => c.kind);
  assert.equal(kinds.at(-1), 'constructCollapse');
  const cut = GOVERNOR_RESTORE_CUTS.at(-1);
  assert.equal(cut.needsRestore({ constructCollapse: true }, { healthy: true }), true);
  assert.equal(cut.needsRestore({ constructCollapse: true }, { healthy: false }), false);
  assert.equal(cut.needsRestore({}, { healthy: true }), false);
});

ok('the switch: liveLoop stamps constructPieces only with the gate on and no collapse (absent otherwise)', () => {
  const loop = src('../gl/liveLoop.mjs');
  assert.match(
    loop,
    /\.\.\.\(s\.constructLead === true && !s\.constructCollapse \? \{ constructPieces: true \} : \{\}\)/,
  );
  const gov = src('./usePerformanceGovernor.js');
  assert.match(gov, /case 'constructCollapse':\s*setConstructCollapse\(true\)/);
  assert.match(gov, /case 'constructCollapse':\s*setConstructCollapse\(false\)/);
  assert.match(src('../state/slices/globalSlice.js'), /constructCollapse: false,/);
});

ok('no pop at the swap frame: the pieces at rest are exactly the tile, for every house construct', () => {
  let checked = 0;
  for (const [tileId, record] of HOUSE_CONSTRUCT_RECORDS) {
    const item = { assetId: tileId, x: 400, y: 300, scale: 1.7, rotation: 30, color: '#123456', key: 'm1' };
    const pieces = constructPieceItems([item], {
      enabled: true,
      recordOf: (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null,
    });
    assert.equal(pieces.length, record.parts.length, `${tileId}: dealt as its pieces`);
    // collapsing (the switch off) hands back the tile item itself: the same array, the same object
    const off = [item];
    assert.equal(constructPieceItems(off, { enabled: false, recordOf: () => record }), off);
    // and the pieces rest exactly where the tile draws them: max piece delta 0 (within REST_EPSILON) at the swap
    const place = { centre: { x: 400, y: 300 }, rot: 30, unit: 1.7 };
    const { pieces: p } = expandConstructPieces(record, place);
    const at = canCollapse(p, record, place);
    assert.equal(at.ok, true, `${tileId}: canCollapse at rest (delta ${at.delta})`);
    checked++;
  }
  assert.ok(checked >= 30, 'the house set is checked');
});

ok('the cap ladder holds with 4 constructs on stage', () => {
  const ids = [...HOUSE_CONSTRUCT_RECORDS.keys()].slice(0, 4);
  const items = ids.map((assetId, i) => ({ assetId, x: 100 * i, y: 50, scale: 1, rotation: 0 }));
  const out = constructPieceItems(items, { enabled: true, recordOf: (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null });
  const want = ids.reduce((s, id) => s + HOUSE_CONSTRUCT_RECORDS.get(id).parts.length, 0);
  assert.equal(out.length, want, 'all four dealt as pieces');
  assert.ok(want <= 64);
  // a budget too small for the fourth: it stays a tile, whole
  const tight = constructPieceItems(items, {
    enabled: true,
    recordOf: (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null,
    budget: want - 1,
  });
  assert.ok(
    tight.some((it) => it.assetId === ids[3]),
    'the one over budget stays its tile',
  );
});

console.log(`constructCollapse.selfcheck: ${n} checks passed`);
