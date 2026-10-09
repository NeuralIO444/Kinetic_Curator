// node src/engine/kernel/bake/bake.accent.selfcheck.mjs
// #1237 — bake accents must agree with the live path on duplicate-hex palettes.
//
// bakeSwarmItems() used to derive the accent with swatches.indexOf(item.color),
// which silently returns the FIRST slot for a repeated hex — every duplicate
// got the first duplicate's accent. The live path (kernel/color assignColor)
// derives from the placement's own palette slot. This suite bakes a swarm on a
// fixture with two identical hexes in different slots and asserts
// bake accent === live accent on that fixture.
import assert from 'node:assert';
import { bakeSwarmItems } from './index.js';
import { assignColor, ACCENT_OFFSET } from '../color/index.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

// Two identical hexes in different slots: slot 0 and slot 2 share '#ff0000'.
const DUP = '#ff0000';
const SWATCHES = [DUP, '#00ff00', DUP, '#0000ff'];
const palette = { swatches: SWATCHES };
const assets = [{ id: 'a' }, { id: 'b' }];
const base = {
  seed: 0x1237,
  count: 24,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  activeAssets: assets,
  palette,
  canvasW: 1000,
  canvasH: 700,
  steps: 20,
  engine: 'js', // JS integrator: deterministic on this machine, no wasm preload
};

const items = bakeSwarmItems(base);
assert.ok(items.length > 0, 'fixture must bake items');

// Every non-grazer item's accent must equal the live-path slot derivation:
// swatches[(slot + ACCENT_OFFSET) % len].
for (const it of items) {
  if (it.graze) continue;
  assert.ok(
    Number.isInteger(it.colorSlot),
    'baked items must carry their palette slot (colorSlot)',
  );
  const expected = SWATCHES[(it.colorSlot + ACCENT_OFFSET) % SWATCHES.length];
  assert.strictEqual(
    it.accent,
    expected,
    `slot ${it.colorSlot} (${it.color}) must accent from its own slot, not indexOf(color)`,
  );
}

// The duplicate slot: particles sitting in slot 2 share the hex of slot 0.
// The old indexOf derivation gave them slot 0's accent (swatches[3]);
// the slot derivation gives swatches[(2 + 3) % 4] = swatches[1].
const dupSlotItems = items.filter((it) => !it.graze && it.colorSlot === 2);
assert.ok(dupSlotItems.length > 0, 'fixture must include particles in the duplicate slot');
for (const it of dupSlotItems) {
  assert.strictEqual(it.color, DUP, 'slot 2 must hold the duplicated hex');
  assert.strictEqual(
    it.accent,
    SWATCHES[1],
    'duplicate-slot accent must come from slot 2, not from indexOf(first match)',
  );
}

// Agreement with the live path: assignColor on the same slot must produce
// the same accent. 'band' with t = 0.625 lands the placement in slot 2.
const live = assignColor(
  { seed: 0x1237, index: 7, t: 0.625, seedOffsets: {} },
  palette,
  'band',
);
assert.strictEqual(live.slot, 2, 'live fixture setup: placement must land in slot 2');
assert.strictEqual(live.color, DUP, 'live fixture setup: slot 2 must hold the duplicated hex');
for (const it of dupSlotItems) {
  assert.strictEqual(
    it.accent,
    live.accent,
    'bake accent must equal live accent on the duplicate-hex slot',
  );
}

// Determinism: accents are a pure function of the bake inputs.
const again = bakeSwarmItems(base);
assert.deepStrictEqual(
  again.map((i) => i.accent),
  items.map((i) => i.accent),
  'accents must be deterministic across bakes',
);

console.log(
  `bake.accent.selfcheck: ok (${items.length} items, ${dupSlotItems.length} in duplicate slot 2)`,
);
