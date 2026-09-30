// node src/data/light.selfcheck.mjs — #594 the ONE CHIAROSCURO sun.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sanitizeLight, lightColor, contractLight, LIGHT_DEFAULT, LIGHT_SLOTS } from './light.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { QUAD_VS, QUAD_FS } from '../gl/shaders.mjs';
import { createLayoutSlice } from '../state/slices/layoutSlice.js';
import { DEFAULT_LAYOUT_PARAMS } from './layout-modes.js';

// ── sanitize: fail-closed, clamped, fixed vocabulary ─────────────────────
for (const off of [null, undefined, 0, 'sun', [], true]) assert.strictEqual(sanitizeLight(off), null, `${off} → off`);
const d = sanitizeLight({});
assert.deepStrictEqual(d, { ...LIGHT_DEFAULT }, 'empty object → the default sun');
const h = sanitizeLight({ x: 1e9, y: -1e9, height: 0, intensity: 7, ambient: -1, slot: 'rim' });
assert.deepStrictEqual([h.x, h.y, h.height, h.intensity, h.ambient, h.slot], [1500, -500, 20, 1, 0, 'white']);
assert.strictEqual(sanitizeLight({ x: NaN }).x, LIGHT_DEFAULT.x, 'NaN → default');

// ── colour: palette slots only ────────────────────────────────────────────
const pal = { ink: '#ff0000', swatches: ['#00ff00', '#0000ff'] };
assert.deepStrictEqual(lightColor('white', pal), [1, 1, 1]);
assert.deepStrictEqual(lightColor('ink', pal), [1, 0, 0]);
assert.deepStrictEqual(lightColor('swatch1', pal), [0, 0, 1]);
assert.deepStrictEqual(lightColor('swatch7', pal), [1, 1, 1], 'missing swatch → white, never NaN');
assert.strictEqual(LIGHT_SLOTS.length, 10);
assert.strictEqual(contractLight(null, pal), null);

// ── ONE sun, structurally: a single object, never a list, never per layer ──
assert.strictEqual(sanitizeLight([LIGHT_DEFAULT, LIGHT_DEFAULT]), null, 'a list of lights is not a light');

// ── project document: omitted when off, round-trips when on ───────────────
const base = {
  seed: 7, seedOffsets: {}, paletteId: 'praystation', layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  enabledAssets: {}, quality: 'balanced', autoQuality: true,
};
const offDoc = serializeProject({ ...base, light: null });
assert.ok(!('light' in offDoc), 'unlit piece: no light key (byte-identical export)');
assert.strictEqual(parseProject(JSON.parse(JSON.stringify(offDoc))).doc.light, null, 'no key → off');
const onDoc = serializeProject({ ...base, light: { x: 900, y: 50, height: 120, intensity: 0.6, ambient: 0.2, slot: 'ink' } });
const back = parseProject(JSON.parse(JSON.stringify(onDoc)));
assert.ok(back.ok);
assert.deepStrictEqual(back.doc.light, { x: 900, y: 50, height: 120, intensity: 0.6, ambient: 0.2, slot: 'ink' });

// ── scene contract: key omitted when off; colour resolved when on ─────────
const c0 = buildSceneContract({ doc: { seed: 1 }, resolvedLayers: [] });
assert.ok(!('light' in c0), 'unlit contract: no light key (hash stable)');
const c1 = buildSceneContract({ doc: { seed: 1, light: { slot: 'ink' }, palette: pal }, resolvedLayers: [] });
assert.deepStrictEqual(c1.light.color, [1, 0, 0], 'live path: pre-resolved palette');
assert.strictEqual(c1.light.x, LIGHT_DEFAULT.x);
const c2 = buildSceneContract({ doc: { seed: 1, light: { slot: 'white' }, paletteId: 'praystation' }, resolvedLayers: [] });
assert.deepStrictEqual(c2.light.color, [1, 1, 1], 'export path: resolves from paletteId');
assert.deepStrictEqual(JSON.parse(JSON.stringify(c1.light)), c1.light, 'JSON-safe');

// ── shader: off path is exactly 1.0 and the FS never touches unlit pixels ──
assert.match(QUAD_VS, /ONE sun, never three-point/, 'the rule is written where the next person looks');
assert.match(QUAD_VS, /v_light = vec3\(1\.0\);/, 'sun off → exactly 1.0');
assert.match(QUAD_FS, /if \(u_sun\.w > 0\.5\) o\.rgb = min\(o\.rgb \* v_light, vec3\(o\.a\)\);/,
  'lighting gated on the uniform (unlit pixels are not even clamped)');
const here = dirname(fileURLToPath(import.meta.url));
assert.match(readFileSync(join(here, 'light.js'), 'utf8'), /ONE sun, never three-point/);

// ── store: one undoable scene-level sun ──────────────────────────────────
{
  let state = {};
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = { ...createLayoutSlice(set), activeLayerId: 'layer-1' };
  assert.strictEqual(state.light, null, 'starts off');
  state.setLight(true);
  assert.deepStrictEqual(state.light, { ...LIGHT_DEFAULT }, 'on at the default sun');
  state.setLight({ x: 800, slot: 'swatch2' });
  assert.strictEqual(state.light.x, 800);
  assert.strictEqual(state.light.y, LIGHT_DEFAULT.y, 'patch keeps the rest');
  assert.strictEqual(state.light.slot, 'swatch2');
  state.setLight(false);
  assert.strictEqual(state.light, null, 'off');
}

console.log('light.selfcheck: OK');
