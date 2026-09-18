// recipes.selfcheck.mjs — #307: kc-recipe/1 round-trip invariants.
//
// Node-only: the recipe text is the interchange format, so encode -> parse
// must be lossless for seeds, sub-seed offsets (defensive pre-#305), palette
// ids, and every layout param shape the app emits (numbers, booleans,
// strings, 2-element range arrays). Garbage in -> plain-language error, never
// a throw.
import assert from 'node:assert';
import {
  RECIPE_VERSION,
  RECIPE_OFFSET_CHANNELS,
  readSeedOffsets,
  recipeFieldsFromKept,
  encodeRecipe,
  parseRecipe,
  recipeToProjectDoc,
  copyTextToClipboard,
} from './recipes.js';

const LAYOUT = {
  mode: 'fibonacci',
  composition: 'praystation',
  count: 240,
  scale: [0.4, 1.6],
  rotate: [-180, 180],
  alpha: [40, 100],
  zTiers: 4,
  jitter: 24,
  density: 78,
  bleed: false,
  mirror: true,
  overlap: true,
  blendMode: 'normal',
  hueRotate: 0,
  paletteShift: 'auto',
  accumulation: true,
  accumulationFade: 5.4,
  noiseFreq: 0.005,
  symmetry: 'none',
  behave: 'cruise',
};

const FIELDS = {
  seed: 0x1a2b3c4d,
  seedOffsets: { spatial: 3, color: -1, asset: 0, noise: 42 },
  paletteId: 'praystation',
  layoutParams: LAYOUT,
};

// ── 1. The version tag is the first line, always ──────────────────────────
{
  const text = encodeRecipe(FIELDS);
  const first = text.split('\n')[0];
  assert.strictEqual(first, RECIPE_VERSION, 'first line must be the version tag');
  assert.strictEqual(first, 'kc-recipe/1');
  console.log('version tag: kc-recipe/1');
}

// ── 2. Full round-trip is lossless ─────────────────────────────────────────
{
  const text = encodeRecipe(FIELDS);
  const parsed = parseRecipe(text);
  assert.strictEqual(parsed.ok, true, `round-trip parse failed: ${parsed.error}`);
  const r = parsed.recipe;
  assert.strictEqual(r.seed, 0x1a2b3c4d >>> 0);
  assert.deepStrictEqual(r.seedOffsets, FIELDS.seedOffsets);
  assert.strictEqual(r.paletteId, 'praystation');
  assert.deepStrictEqual(r.layoutParams, LAYOUT);
  console.log('round-trip: lossless across seed, offsets, palette, layout');
}

// ── 3. Offsets are defensive: no field anywhere -> all zeros ───────────────
{
  assert.deepStrictEqual(readSeedOffsets(undefined), { spatial: 0, color: 0, asset: 0, noise: 0 });
  assert.deepStrictEqual(readSeedOffsets(null), { spatial: 0, color: 0, asset: 0, noise: 0 });
  assert.deepStrictEqual(readSeedOffsets({}), { spatial: 0, color: 0, asset: 0, noise: 0 });
  // Junk values collapse to 0, never NaN into the text.
  assert.deepStrictEqual(
    readSeedOffsets({ seedOffsets: { spatial: 'x', color: NaN, asset: 1.9, noise: -2.2 } }),
    { spatial: 0, color: 0, asset: 1, noise: -2 },
  );
  const text = encodeRecipe({ seed: 7, paletteId: 'p', layoutParams: {} });
  for (const ch of RECIPE_OFFSET_CHANNELS) {
    assert.ok(text.includes(`seedOffset.${ch}: 0`), `missing zero default for ${ch}`);
  }
  const back = parseRecipe(text);
  assert.strictEqual(back.ok, true);
  assert.deepStrictEqual(back.recipe.seedOffsets, { spatial: 0, color: 0, asset: 0, noise: 0 });
  console.log('offsets: defensive pre-#305, exact post-#305');
}

// ── 4. Carrier normalization: live state, snapshot, favorite ───────────────
{
  // Live store shape.
  const live = recipeFieldsFromKept({
    seed: 99, seedOffsets: undefined, paletteId: 'ember', layoutParams: { mode: 'swarm' },
  });
  assert.deepStrictEqual(live, {
    seed: 99,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    paletteId: 'ember',
    layoutParams: { mode: 'swarm' },
  });
  // Snapshot shape (config.layout + config.palette.id), offsets at top level.
  const snap = recipeFieldsFromKept({
    seed: 0xabcd,
    seedOffsets: { spatial: 5, color: 0, asset: 0, noise: 0 },
    config: { layout: { ...LAYOUT }, palette: { id: 'praystation' } },
  });
  assert.strictEqual(snap.seed, 0xabcd);
  assert.strictEqual(snap.seedOffsets.spatial, 5);
  assert.strictEqual(snap.paletteId, 'praystation');
  assert.deepStrictEqual(snap.layoutParams, LAYOUT);
  // Offsets tucked inside config (whichever place #305's writer uses).
  const tucked = recipeFieldsFromKept({
    seed: 1,
    config: { layout: {}, palette: { id: 'x' }, seedOffsets: { noise: 9 } },
  });
  assert.strictEqual(tucked.seedOffsets.noise, 9);
  assert.strictEqual(tucked.seedOffsets.spatial, 0);
  // Hostile input never throws.
  assert.doesNotThrow(() => recipeFieldsFromKept(null));
  assert.doesNotThrow(() => recipeFieldsFromKept('junk'));
  console.log('carriers: live state, snapshot, favorite, hostile input');
}

// ── 5. Seed formats: emitted 0x… hex round-trips; decimal accepted ─────────
{
  const t = encodeRecipe({ seed: 0xdeadbeef, paletteId: null, layoutParams: {} });
  assert.ok(t.includes('seed: 0xdeadbeef'), 'seed must emit as 0x hex');
  assert.strictEqual(parseRecipe(t).recipe.seed, 0xdeadbeef >>> 0);
  assert.strictEqual(parseRecipe('kc-recipe/1\nseed: 1234').recipe.seed, 1234);
  assert.strictEqual(parseRecipe('kc-recipe/1\nseed: 0x10').recipe.seed, 16);
  console.log('seed: hex emit, hex + decimal parse');
}

// ── 6. Garbage in -> plain-language error, never a throw ───────────────────
{
  const bad = [
    ['', 'empty'],
    ['   ', 'blank'],
    ['seed: 0x1', 'missing version tag'],
    ['kc-recipe/2\nseed: 0x1', 'wrong version'],
    ['kc-recipe/1', 'no seed line'],
    ['kc-recipe/1\nno colon here', 'line without colon'],
    ['kc-recipe/1\nseed: xyz!', 'bad seed'],
    ['kc-recipe/1\nseed: 0x1\nbogus: 1', 'unknown key'],
    ['kc-recipe/1\nseed: 0x1\nseedOffset.bogus: 1', 'unknown channel'],
    ['kc-recipe/1\nseed: 0x1\nseedOffset.spatial: many', 'non-numeric offset'],
    ['kc-recipe/1\nseed: 0x1\nlayout.a.b: 1', 'nested layout key'],
  ];
  for (const [text, why] of bad) {
    const r = parseRecipe(text);
    assert.strictEqual(r.ok, false, `should reject (${why})`);
    assert.ok(typeof r.error === 'string' && r.error.length > 0, `needs a message (${why})`);
  }
  assert.doesNotThrow(() => parseRecipe(null));
  assert.doesNotThrow(() => parseRecipe(42));
  console.log(`rejections: ${bad.length} hostile inputs, all with messages`);
}

// ── 7. Hand-editing stays friendly: comments + bare words ──────────────────
{
  const text = [
    '# a kept render, hand-copied',
    'kc-recipe/1',
    '',
    'seed: 0x2a',
    'palette: praystation',
    'seedOffset.spatial: 0',
    'seedOffset.color: 0',
    'seedOffset.asset: 0',
    'seedOffset.noise: 0',
    'layout.mode: swarm',
    'layout.count: 60',
    'layout.mirror: true',
  ].join('\n');
  const r = parseRecipe(text);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.recipe.seed, 42);
  assert.strictEqual(r.recipe.paletteId, 'praystation');
  assert.deepStrictEqual(r.recipe.layoutParams, { mode: 'swarm', count: 60, mirror: true });
  console.log('hand-edit: comments, blank lines, bare words all parse');
}

// ── 8. Project doc for the existing load path ─────────────────────────────
{
  const { recipe } = parseRecipe(encodeRecipe(FIELDS));
  const doc = recipeToProjectDoc(recipe);
  assert.strictEqual(doc.version, 1);
  assert.strictEqual(doc.seed, 0x1a2b3c4d >>> 0);
  assert.strictEqual(doc.paletteId, 'praystation');
  assert.deepStrictEqual(doc.layoutParams, LAYOUT);
  assert.deepStrictEqual(doc.seedOffsets, FIELDS.seedOffsets);
  console.log('project doc: seed/palette/layout/offsets, load-path ready');
}

// ── 9. Clipboard helper is node-safe ──────────────────────────────────────
{
  const ok = await copyTextToClipboard('kc-recipe/1\nseed: 0x1');
  assert.strictEqual(ok, false, 'no DOM in node -> resolves false, never throws');
  console.log('clipboard: node-safe no-op');
}

console.log('recipes.selfcheck OK');
