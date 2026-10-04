// node src/state/kineticWeatherPass.selfcheck.mjs
//
// #944 — kineticWeatherPass() is the KINETIC button's WEATHER layer. A warm
// second tap must drift the atmosphere over the SAME structure: palette
// weather, light mood, atmospheric FX — while the skeleton (seed,
// composition, structural params, asset pool, layers) holds, in one undo
// step. kineticTap() routes warm taps to WEATHER and fresh taps to RULES.
import assert from 'node:assert';
import { useStore } from './store.js';
import { PALETTES } from '../data/palettes.js';
import { routeKineticTap, KINETIC_WARM_MS } from '../panels/layout/kineticWarm.mjs';

const S = () => useStore.getState();
const paletteIds = new Set(PALETTES.map((p) => p.id));

// Setup: sun on (so the mood roll is exercised), density high.
S().setLight(true);
S().setLayoutParam('density', 90);
const before = S();
const seedBefore = before.seed;
const compBefore = before.layoutParams.composition;
const paletteBefore = before.paletteId;
const assetsBefore = JSON.stringify(before.enabledAssets);
const layersBefore = before.layers.length;
const lightBefore = JSON.stringify(before.light);
const undoDepthBefore = before.historyUndoStack.length;
assert.ok(before.light, 'setup: the sun is on');

// ── 1. WEATHER pass: air changes, skeleton holds ──────────────────────────
S().kineticWeatherPass();
const s = S();

// Atmosphere moved: a different known palette, sun re-aimed, glow re-rolled.
assert.ok(paletteIds.has(s.paletteId), `palette ${s.paletteId} is a known catalog palette`);
assert.notStrictEqual(s.paletteId, paletteBefore, 'WEATHER rolls a new palette (palette weather)');
assert.notStrictEqual(JSON.stringify(s.light), lightBefore, 'WEATHER moves the sun (mood)');
assert.ok(
  s.layoutParams.accumulationOptics >= 0 && s.layoutParams.accumulationOptics <= 0.25,
  `WEATHER rolls bloom+halation in range, got ${s.layoutParams.accumulationOptics}`,
);

// Skeleton held: same seed, composition, structure, assets, layers.
assert.strictEqual(s.seed, seedBefore, 'WEATHER keeps the seed (same DNA)');
assert.strictEqual(s.layoutParams.composition, compBefore, 'WEATHER keeps the composition (skeleton holds)');
assert.strictEqual(s.layoutParams.density, 90, 'WEATHER does not touch density');
assert.strictEqual(JSON.stringify(s.enabledAssets), assetsBefore, 'WEATHER keeps the asset pool');
assert.strictEqual(s.layers.length, layersBefore, 'WEATHER does not touch layer structure');

// One undo step restores the pre-pass atmosphere.
assert.strictEqual(s.historyUndoStack.length, undoDepthBefore + 1, 'one pass = one undo entry');
S().undo();
const u = S();
assert.strictEqual(u.paletteId, paletteBefore, 'undo restores the palette');
assert.strictEqual(JSON.stringify(u.light), lightBefore, 'undo restores the sun');
assert.strictEqual(u.seed, seedBefore, 'undo keeps the seed');

// ── 2. Tap routing: fresh → RULES, warm → WEATHER, stale → RULES ──────────
// The router is pure (wall-clock-free); the button passes Date.now() at the
// tap site, so the store stays out of the #806 must-loop law.
assert.strictEqual(KINETIC_WARM_MS, 2000, 'warm window is ~2s');
assert.strictEqual(routeKineticTap(0, 1_000_000), 'rules', 'never tapped → RULES');
assert.strictEqual(routeKineticTap(1000, 1500), 'weather', 'tap 0.5s later → WEATHER (warm)');
assert.strictEqual(routeKineticTap(1000, 1000 + KINETIC_WARM_MS - 1), 'weather', 'tap just inside the window → WEATHER');
assert.strictEqual(routeKineticTap(1000, 1000 + KINETIC_WARM_MS + 1), 'rules', 'tap just outside the window → RULES (fresh)');

// End to end through the store actions the button calls: a warm second tap
// keeps the skeleton and weathers the air; a stale tap re-works the rules.
// (Drive lastTapAt here the way the button does — via the router.)
let lastTapAt = 0;
const tap = (now) => {
  const kind = routeKineticTap(lastTapAt, now);
  lastTapAt = now;
  if (kind === 'weather') S().kineticWeatherPass();
  else S().kineticRulesPass();
  return kind;
};
assert.strictEqual(tap(10_000), 'rules', 'fresh tap routes to RULES');
const compAfterRules = S().layoutParams.composition;
assert.strictEqual(tap(10_500), 'weather', 'warm tap routes to WEATHER');
assert.strictEqual(S().layoutParams.composition, compAfterRules, 'warm tap keeps the composition (skeleton holds)');
assert.strictEqual(tap(10_500 + KINETIC_WARM_MS + 100), 'rules', 'stale tap routes to RULES again');

// ── 3. Locked glow survives the pass ───────────────────────────────────────
S().toggleParamLock('accumulationOptics');
S().setLayoutParam('accumulationOptics', 0.2);
S().kineticWeatherPass();
assert.strictEqual(S().layoutParams.accumulationOptics, 0.2, 'locked glow survives the pass');
S().toggleParamLock('accumulationOptics');

console.log('kineticWeatherPass.selfcheck ok');
