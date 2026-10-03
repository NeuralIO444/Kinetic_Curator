// recipeUrls.selfcheck.mjs — #534: kc-r/1 recipe URL codec invariants.
//
// Node-only: the URL is the distribution format, so encode -> decode must be
// lossless for seed, sub-seed offsets, palette id + dirty overrides, and
// every layout param shape the app emits. Delta-vs-defaults keeps links
// short; hostile input fails closed with a plain-language error, never a
// throw.
import assert from 'node:assert';
import {
  RECIPE_URL_VERSION,
  RECIPE_URL_PREFIX,
  RECIPE_URL_HASH_KEY,
  encodeRecipeUrl,
  decodeRecipeUrl,
  buildShareHref,
  extractRecipePayload,
} from './recipeUrls.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { recipeFieldsFromKept } from './recipes.js';

// A realistic composition: a few params off default, two offset channels hot.
const FIELDS = {
  seed: 0xa17e9b21,
  seedOffsets: { spatial: 0, color: 7, asset: 0, noise: 123456 },
  paletteId: 'praystation',
  paletteOverrides: null,
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 500,
    mode: 'grid',
    scale: [0.2, 2.4],
    accumulation: true,
  },
};

const changedKeys = ['count', 'mode', 'scale', 'accumulation'];

// --- round-trip: decode(encode(f)) === render params -----------------------
{
  const url = encodeRecipeUrl(FIELDS);
  assert.ok(url.startsWith(RECIPE_URL_PREFIX), 'cleartext version prefix first');
  const back = decodeRecipeUrl(url);
  assert.ok(back.ok, `decode ok: ${back.error || ''}`);
  const r = back.recipe;
  assert.strictEqual(r.version, RECIPE_URL_VERSION);
  assert.strictEqual(r.seed, FIELDS.seed >>> 0);
  assert.deepStrictEqual(r.seedOffsets, { spatial: 0, color: 7, asset: 0, noise: 123456 });
  assert.strictEqual(r.paletteId, 'praystation');
  assert.strictEqual(r.paletteOverrides, null);
  // recipe-equivalence: the decoded render params equal the originals
  assert.deepStrictEqual(r.layoutParams, FIELDS.layoutParams);
}

// --- minimality: only deltas ride ------------------------------------------
{
  const url = encodeRecipeUrl(FIELDS);
  const payload = url.slice(RECIPE_URL_PREFIX.length);
  const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.deepStrictEqual(Object.keys(json.l).sort(), [...changedKeys].sort(), 'only non-default params encoded');
  assert.deepStrictEqual(json.o, { color: 7, noise: 123456 }, 'only nonzero offsets encoded');
  assert.ok(!('po' in json), 'null overrides omitted');
  // A near-default composition stays in the hundreds of chars.
  assert.ok(url.length < 600, `link stays short, got ${url.length}`);
  const tiny = encodeRecipeUrl({
    seed: 1,
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
    paletteId: null,
    paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  });
  assert.ok(tiny.length < 120, `minimal link tiny, got ${tiny.length}`);
}

// --- alphabet: base64url, no padding, no +/= --------------------------------
{
  const url = encodeRecipeUrl(FIELDS);
  const payload = url.slice(RECIPE_URL_PREFIX.length);
  assert.ok(/^[A-Za-z0-9-_]+$/.test(payload), 'payload is pure base64url alphabet');
}

// --- dirty palette overrides ride ------------------------------------------
{
  const overrides = { swatches: ['#ff0000', '#00ff00'], bg: '#000000' };
  const url = encodeRecipeUrl({ ...FIELDS, paletteOverrides: overrides });
  const back = decodeRecipeUrl(url);
  assert.ok(back.ok);
  assert.deepStrictEqual(back.recipe.paletteOverrides, overrides);
}

// --- favorite-as-link: one shared function ----------------------------------
// Favorites carry { seed, seedOffsets, config: { layout, palette: { id } } } —
// recipeFieldsFromKept normalizes both carriers, so a favorite encodes
// through the identical path as live state.
{
  const favorite = {
    seed: 0xdeadbeef,
    seedOffsets: { spatial: 3, color: 0, asset: 0, noise: 0 },
    config: {
      layout: { ...DEFAULT_LAYOUT_PARAMS, jitter: 99 },
      palette: { id: 'inkwash' },
    },
  };
  const url = encodeRecipeUrl(recipeFieldsFromKept(favorite));
  const back = decodeRecipeUrl(url);
  assert.ok(back.ok);
  assert.strictEqual(back.recipe.seed, 0xdeadbeef);
  assert.strictEqual(back.recipe.paletteId, 'inkwash');
  assert.strictEqual(back.recipe.layoutParams.jitter, 99);
  assert.strictEqual(back.recipe.layoutParams.count, DEFAULT_LAYOUT_PARAMS.count);
}

// --- hostile battery: fail closed, never throw ------------------------------
{
  const bad = [
    '',
    '   ',
    'not-a-url',
    '#r=abc',                    // missing version prefix
    'kc-r/1.',                   // empty payload
    'kc-r/1.!!!',                // bad alphabet
    'kc-r/1.A',                  // truncated (length % 4 === 1)
    'kc-r/2.e30',                // unknown version
    'kc-r/9.e30',
    'kc-recipe/1.e30',           // wrong codec entirely
    null,
    undefined,
    42,
    {},
  ];
  for (const input of bad) {
    const r = decodeRecipeUrl(input);
    assert.ok(!r.ok, `refuses ${JSON.stringify(input)}`);
    assert.ok(typeof r.error === 'string' && r.error.length > 0, 'plain-language error');
  }
  // Valid prefix + corrupt payload: truncated JSON, wrong shapes.
  const corrupt = (json) =>
    RECIPE_URL_PREFIX + Buffer.from(json, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  for (const json of ['{', '[1,2', '"str"', '42', 'null', '{"v":1}', '{"v":1,"s":"nope"}', '{"v":2,"s":1}']) {
    const r = decodeRecipeUrl(corrupt(json));
    assert.ok(!r.ok, `refuses payload ${json}`);
  }
  // Unknown version with otherwise-valid payload refuses distinctly.
  const r = decodeRecipeUrl(corrupt('{"v":99,"s":1}'));
  assert.ok(!r.ok && /version/i.test(r.error), 'unknown version refused');
}

// --- share href + paste extraction (slice 2 pure helpers) -------------------
{
  const payload = encodeRecipeUrl(FIELDS);
  const href = buildShareHref(payload, 'https://example.com/Kinetic_Curator/#r=old');
  assert.ok(href.startsWith('https://example.com/Kinetic_Curator/'), 'base kept');
  assert.ok(href.includes(`#${RECIPE_URL_HASH_KEY}=${payload}`), 'fragment carries the payload');
  assert.ok(!href.includes('#r=old'), 'stale fragment stripped');

  // extractRecipePayload finds the payload in every paste shape.
  assert.strictEqual(extractRecipePayload(payload), payload, 'bare payload');
  assert.strictEqual(extractRecipePayload(`  ${payload}\n`), payload, 'padded payload');
  assert.strictEqual(extractRecipePayload(href), payload, 'full share URL');
  assert.strictEqual(extractRecipePayload('have a look:\n' + href + '\n!'), payload, 'URL in prose');
  assert.strictEqual(extractRecipePayload('kc-recipe/1\nseed: 0x1'), null, 'text recipe is not a link');
  assert.strictEqual(extractRecipePayload(''), null, 'empty');
  assert.strictEqual(extractRecipePayload(null), null, 'non-string');

  // Paste routing: payload present -> URL path, else text path.
  const classify = (t) => (extractRecipePayload(t) ? 'url' : 'text');
  assert.strictEqual(classify(href), 'url');
  assert.strictEqual(classify('kc-recipe/1\nseed: 0x1a2b3c4d'), 'text');

  // End-to-end paste: the extracted payload decodes to the same recipe.
  const back = decodeRecipeUrl(extractRecipePayload(href));
  assert.ok(back.ok);
  assert.deepStrictEqual(back.recipe.layoutParams, FIELDS.layoutParams);
}

console.log('recipeUrls.selfcheck: OK');
