// node src/state/shapeMixRefusal.selfcheck.mjs
//
// #2495 (stress A17): the BUILD cast shape mixer caps at SHAPE_MIX_MAX (4)
// chips on — by design (#733). The defect was the silence: a fifth press was
// a pure no-op and nothing anywhere named the refusal. Now the refused press
// banks `shapeMixRefusal` ({ id }) and the shelf renders the one line
// shapeMixRefusalLine derives from it, while the standing mix still matches.
// The mix behaviour itself is unchanged (shapeMix.selfcheck pins it); this
// pin covers the naming: banked on refusal, exact line, cleared by any cycle
// that lands, and never readable once the state it names no longer holds.
import assert from 'node:assert';
import { useStore } from './store.js';
import { liveShapeLevels, shapeMixRefusalLine, SHAPE_MIX_MAX } from '../data/voices.js';

const S = () => useStore.getState();
const lv = () => liveShapeLevels(S().shapeLevels, S().enabledAssets);
const refusal = () => S().shapeMixRefusal;
const line = () => shapeMixRefusalLine(refusal(), lv());

// ── the filed repro: random/grid/fibonacci/radial on, press noise warp ───
S().loadShapeSet('swarm'); // a flagship pool, not a mix (the filed start)
assert.strictEqual(refusal(), null, `no refusal before any press (got ${JSON.stringify(refusal())})`);
for (const id of ['random', 'grid', 'fibonacci', 'radial']) S().cycleShapeLevel(id);
assert.deepStrictEqual(
  lv(),
  { random: 1, grid: 1, fibonacci: 1, radial: 1 },
  `four chips on at level 1 (got ${JSON.stringify(lv())})`,
);
assert.strictEqual(refusal(), null, `four landed cycles bank no refusal (got ${JSON.stringify(refusal())})`);
assert.strictEqual(line(), null, `no line while nothing is refused (got ${JSON.stringify(line())})`);

const before = { pool: { ...S().enabledAssets }, levels: { ...lv() }, undo: S().historyUndoStack.length };
S().cycleShapeLevel('noise'); // the filed fifth press
assert.deepStrictEqual(
  refusal(),
  { id: 'noise' },
  `the refused press banks the record (got ${JSON.stringify(refusal())})`,
);
assert.deepStrictEqual(lv(), before.levels, `fifth press: levels unchanged (got ${JSON.stringify(lv())})`);
assert.deepStrictEqual(S().enabledAssets, before.pool, 'fifth press: pool unchanged');
assert.strictEqual(
  S().historyUndoStack.length,
  before.undo,
  `fifth press: no undo entry (depth ${before.undo} → ${S().historyUndoStack.length})`,
);
assert.strictEqual(
  line(),
  'noise warp stays off — shapes full (4/4 on)',
  `the shelf line names the chip and the cap (got ${JSON.stringify(line())})`,
);
S().cycleShapeLevel('noise'); // pressing the refused chip again: still refused, same record
assert.deepStrictEqual(
  refusal(),
  { id: 'noise' },
  `repeat press re-banks the same record (got ${JSON.stringify(refusal())})`,
);
assert.strictEqual(
  line(),
  'noise warp stays off — shapes full (4/4 on)',
  `line stands (got ${JSON.stringify(line())})`,
);

// ── a cycle that lands clears the record ─────────────────────────────────
S().cycleShapeLevel('random'); // an on-chip still cycles at the cap: 1 → 2
assert.strictEqual(lv().random, 2, `on-chip cycles at the cap (random level ${lv().random}, want 2)`);
assert.strictEqual(refusal(), null, `a landed cycle clears the refusal (got ${JSON.stringify(refusal())})`);
assert.strictEqual(line(), null, `line clears with the record (got ${JSON.stringify(line())})`);

S().cycleShapeLevel('noise'); // cap still full (4 on) → refused again
assert.deepStrictEqual(
  refusal(),
  { id: 'noise' },
  `refusal re-banks at the standing cap (got ${JSON.stringify(refusal())})`,
);
S().cycleShapeLevel('random'); // 2 → 3
S().cycleShapeLevel('random'); // 3 → off: a slot frees
assert.strictEqual(
  Object.keys(lv()).length,
  3,
  `a freed slot leaves 3 on (got ${Object.keys(lv()).length}: ${JSON.stringify(lv())})`,
);
assert.strictEqual(refusal(), null, `the freeing cycle cleared the record (got ${JSON.stringify(refusal())})`);

// ── the line never names a state that no longer holds (pure gate) ────────
assert.strictEqual(
  shapeMixRefusalLine({ id: 'noise' }, { grid: 1, fibonacci: 1, radial: 1 }),
  null,
  'a stale record under a 3-on mix reads as no line',
);
assert.strictEqual(
  shapeMixRefusalLine({ id: 'noise' }, { noise: 1, grid: 1, fibonacci: 1, radial: 1 }),
  null,
  'a record for a chip that is on reads as no line',
);
assert.strictEqual(
  shapeMixRefusalLine(null, { random: 1, grid: 1, fibonacci: 1, radial: 1 }),
  null,
  'no record → no line',
);
assert.strictEqual(
  shapeMixRefusalLine({ id: 'not-a-chip' }, { random: 1, grid: 1, fibonacci: 1, radial: 1 }),
  null,
  'an unknown chip id → no line',
);
assert.strictEqual(
  shapeMixRefusalLine({ id: 'noise' }, { random: 1, grid: 1, fibonacci: 1, radial: 1 }),
  'noise warp stays off — shapes full (4/4 on)',
  `the gate passes exactly at the cap (${SHAPE_MIX_MAX} on)`,
);

// ── scope: only the cap refusal is banked ────────────────────────────────
// Down to one chip (grid) and walk it to 3; the never-empty refusal at 3 →
// off is a different silence (not the filed one) and banks nothing here.
for (const id of ['fibonacci', 'radial']) {
  S().cycleShapeLevel(id); // 1 → 2
  S().cycleShapeLevel(id); // 2 → 3
  S().cycleShapeLevel(id); // 3 → off
}
S().cycleShapeLevel('grid'); // 1 → 2
S().cycleShapeLevel('grid'); // 2 → 3
assert.deepStrictEqual(lv(), { grid: 3 }, `one chip stands at 3 (got ${JSON.stringify(lv())})`);
S().cycleShapeLevel('grid'); // last chip at 3: refused (never an empty pool)
assert.strictEqual(lv().grid, 3, `the last chip stays 3 (got ${lv().grid})`);
assert.strictEqual(refusal(), null, `the never-empty refusal banks no cap record (got ${JSON.stringify(refusal())})`);
S().cycleShapeLevel('swarm'); // flagship ids are not mixable
assert.strictEqual(refusal(), null, `a non-mixable press banks nothing (got ${JSON.stringify(refusal())})`);

console.log('shapeMixRefusal.selfcheck: OK');
