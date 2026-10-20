// poolCitizenship.selfcheck.mjs — #1694 slice 2: the creature citizen.
//
// One pool entry (`creature`) stands for both live creature families, and
// every citizen mechanism binds through the GENERIC pool machinery — the
// same store actions, maps and resolver inputs the marks use. This suite
// pins, in order:
//   1. the pool shape (one citizen, declared family option, not authored
//      canon — the region bake never sees it);
//   2. tile semantics against the store actions (enable / solo / weight /
//      pin-still / family option), including the written-only-when-set law;
//   3. the document round-trip (family rides the project; the shed doesn't);
//   4. the resolver strip test: a creature-bearing scene resolved with the
//      citizen keys ABSENT is byte-identical to the same scene with the
//      citizen at its explicit defaults — citizenship changes nothing at
//      rest (the creatureGate fixture is the recorded form of this proof);
//   5. the gates themselves (citizen off births nothing; family selects);
//   6. the weight semantics on the home choice (spawn.js chooseHomes);
//   7. pin-still (Q1): the anchor holds, the animal keeps living.
import assert from 'node:assert';
import { useStore } from './store.js';
import { serializeProject, parseProject } from './projectDocument.js';
import { sanitizeAssetOptions } from './projectNormalize.js';
import { ASSETS, ASSETS_AUTHORED } from '../data/assets/index.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import { creatureEnabled, creatureFamily, mothsAllowed, dishAllowed } from '../curator/creatureCitizen.js';
import { chooseHomes } from '../curator/spawn.js';
import { hoverPose } from '../engine/creature.js';
import { createLiveResolver, getLastSpawnDecisions } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── 1. the pool shape ────────────────────────────────────────────────────────
ok('the pool holds exactly one citizen entry, with the family declared as a tile option', () => {
  const citizens = ASSETS.filter((a) => a.id === 'creature');
  assert.equal(citizens.length, 1);
  assert.equal(citizens[0].category, 'creature');
  assert.deepEqual(citizens[0].options, [{ key: 'family', choices: ['both', 'moth', 'dish'], default: 'both' }]);
  assert.ok(ALL_CATEGORIES.includes('creature'), 'the panel gets its CREATURE filter chip');
  assert.ok(!ASSETS_AUTHORED.some((a) => a.id === 'creature'), 'not authored canon — the region bake never sees it');
  assert.ok(!('regions' in citizens[0]), 'no baked regions ride the citizen');
});

// ── 2. tile semantics against the store actions ─────────────────────────────
ok('the default document enables the citizen (creatures were never gated by the map)', () => {
  assert.equal(S().enabledAssets.creature, true);
});

ok('toggle / solo / toggle-all speak for the citizen like any asset', () => {
  S().toggleAsset('creature');
  assert.equal(S().enabledAssets.creature, false);
  assert.equal(creatureEnabled({ enabledAssets: S().enabledAssets }), false);
  S().toggleAsset('creature');
  assert.equal(S().enabledAssets.creature, true);
  S().soloAsset('creature');
  assert.equal(S().enabledAssets.creature, true);
  assert.ok(Object.entries(S().enabledAssets).every(([id, on]) => id === 'creature' || on === false), 'soloing the citizen leaves it alone on');
  S().soloAsset('org_blob_01');
  assert.equal(S().enabledAssets.creature, false, 'soloing a mark switches the citizen off, explicitly');
  S().toggleAllAssets(true);
  assert.equal(S().enabledAssets.creature, true, 'all-on includes the citizen');
  S().toggleAllAssets(false);
  assert.equal(S().enabledAssets.creature, false, 'all-off includes the citizen');
});

ok('absence reads enabled; only an explicit false disables (the pre-citizenship world)', () => {
  assert.equal(creatureEnabled({}), true);
  assert.equal(creatureEnabled({ enabledAssets: null }), true);
  assert.equal(creatureEnabled({ enabledAssets: {} }), true);
  assert.equal(creatureEnabled({ enabledAssets: { creature: true } }), true);
  assert.equal(creatureEnabled({ enabledAssets: { creature: false } }), false);
  assert.equal(creatureFamily({}), 'both');
  assert.equal(creatureFamily({ assetOptions: { creature: { family: 'moth' } } }), 'moth');
  assert.equal(creatureFamily({ assetOptions: { creature: { family: 'bogus' } } }), 'both');
  assert.equal(mothsAllowed({ assetOptions: { creature: { family: 'dish' } } }), false);
  assert.equal(dishAllowed({ assetOptions: { creature: { family: 'dish' } } }), true);
  assert.equal(dishAllowed({ enabledAssets: { creature: false } }), false);
});

ok('the weight cycle treats the citizen as a native medium (override written only when set)', () => {
  S().cycleAssetWeight('creature');
  assert.equal(S().assetWeightOverrides.creature, 'heavy');
  S().cycleAssetWeight('creature');
  assert.equal(S().assetWeightOverrides.creature, 'light');
  S().cycleAssetWeight('creature');
  assert.ok(!('creature' in S().assetWeightOverrides), 'back at the native weight the override is removed');
});

ok('pin-still toggles the citizen through the generic assetStill map', () => {
  S().toggleAssetStill('creature');
  assert.deepEqual(S().assetStill, { creature: true });
  S().toggleAssetStill('creature');
  assert.deepEqual(S().assetStill, {});
});

ok('the family option cycles both → moth → dish → both, written only when set', () => {
  S().cycleAssetOption('creature', 'family');
  assert.deepEqual(S().assetOptions, { creature: { family: 'moth' } });
  S().cycleAssetOption('creature', 'family');
  assert.deepEqual(S().assetOptions, { creature: { family: 'dish' } });
  S().cycleAssetOption('creature', 'family');
  assert.deepEqual(S().assetOptions, {}, 'cycling back to the default removes the key');
  S().cycleAssetOption('org_blob_01', 'family');
  assert.deepEqual(S().assetOptions, {}, 'an asset that declares no options is a no-op');
  S().cycleAssetOption('creature', 'nope');
  assert.deepEqual(S().assetOptions, {}, 'an undeclared key is a no-op');
});

ok('sanitizeAssetOptions keeps only declared options at non-default values', () => {
  assert.deepEqual(sanitizeAssetOptions({ creature: { family: 'moth' } }), { creature: { family: 'moth' } });
  assert.equal(sanitizeAssetOptions({ creature: { family: 'both' } }), null, 'the default is not stored');
  assert.equal(sanitizeAssetOptions({ creature: { family: 'bogus' } }), null);
  assert.equal(sanitizeAssetOptions({ org_blob_01: { family: 'moth' } }), null, 'undeclared asset');
  assert.equal(sanitizeAssetOptions(null), null);
});

// ── 3. the document round-trip ──────────────────────────────────────────────
ok('the family option and the citizen switch ride the project document; the governor shed does not', () => {
  useStore.setState({ assetOptions: { creature: { family: 'dish' } }, creatureShed: 2, creatureCount: 3 });
  const doc = serializeProject(S());
  assert.deepEqual(doc.assetOptions, { creature: { family: 'dish' } });
  assert.ok(!('creatureShed' in doc), 'the shed is a governor overlay — never serialized');
  const parsed = parseProject(clone(doc));
  assert.ok(parsed.ok);
  S().applyProject(parsed.doc);
  assert.deepEqual(S().assetOptions, { creature: { family: 'dish' } });
  assert.equal(S().creatureCount, 3);
  assert.equal(S().creatureShed, 0, 'a fresh document ends any governor shed claim');
  useStore.setState({ assetOptions: {}, creatureCount: 0 });
  const clean = parseProject(clone(serializeProject(S())));
  S().applyProject(clean.doc);
  assert.deepEqual(S().assetOptions, {}, 'a doc without options applies as all-defaults');
});

// ── 4–5. the resolver: strip test + gates ───────────────────────────────────
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const PINS = [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 400, y: 450 }, { x: 600, y: 450 }];
const ALL_ON = Object.fromEntries(ASSETS.filter((a) => a.id !== 'creature').map((a) => [a.id, true]));
const baseInput = {
  canvasW: 1000, canvasH: 700, layers: [L('a')], activeLayerId: 'a', layerSnapshots: {}, seed: 4242, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], caGrid: null, assetWeightOverrides: {}, customAssets: [],
  quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, perfTier1: false, assetThin: false,
  slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
  assetAttach: {}, creatureCount: 4,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 300, particleCount: 150 },
};
const scene = (over) => ({
  ...baseInput,
  dishPins: PINS, dishFormed: [true, true, true, true], dishLimbs: [2, 2, 2, 2],
  dishHosted: [true, false, false, false], dishPressure: [1, 1, 1, 1], dishTraits: [],
  ...over,
});
const runScene = (input, frames = 90) => {
  const r = createLiveResolver();
  let out = null;
  for (let f = 0; f < frames; f++) out = r.resolveLayers({ ...input, loopTimeMs: f * 16.7, dtSec: 1 / 60 });
  const items = out[0].items;
  const result = { items, creatureItems: items.filter((it) => it._creature).length, decisions: clone(getLastSpawnDecisions()) };
  r.dispose();
  return result;
};

ok('strip test: citizen keys absent ≡ citizen at explicit defaults (byte-identical frames)', () => {
  const absent = runScene(scene({ enabledAssets: { ...ALL_ON } }));
  const explicit = runScene(scene({
    enabledAssets: { ...ALL_ON, creature: true },
    assetOptions: { creature: { family: 'both' } },
  }));
  assert.ok(absent.creatureItems > 0, 'the scene really bears creatures');
  assert.equal(JSON.stringify(absent.items), JSON.stringify(explicit.items), 'placements + creature items identical');
  assert.deepEqual(absent.decisions, explicit.decisions, 'spawn decisions identical');
});

ok('citizen off: nothing is born and no homes are sought', () => {
  const off = runScene(scene({ enabledAssets: { ...ALL_ON, creature: false }, dishPins: [], dishFormed: [], dishHosted: [], dishLimbs: [], dishPressure: [] }));
  assert.equal(off.creatureItems, 0);
  assert.deepEqual(off.decisions.dishPins, [], 'the spawn half seeks no homes while the citizen is off');
});

ok('family selects: moth-only and dish-only partition the full stage', () => {
  // Two pins: pin 0 hosts the dish creature, pin 1 grows a moth (a hosted pin is the dish
  // creature's alone — the families partition by pin, so the stage must offer both kinds).
  const twoPins = { dishPins: [PINS[0], PINS[1]], dishFormed: [true, true], dishLimbs: [2, 2], dishHosted: [true, false], dishPressure: [1, 1] };
  const both = runScene(scene({ ...twoPins, enabledAssets: { ...ALL_ON } }));
  const moth = runScene(scene({ ...twoPins, enabledAssets: { ...ALL_ON }, assetOptions: { creature: { family: 'moth' } } }));
  const dish = runScene(scene({ ...twoPins, enabledAssets: { ...ALL_ON }, assetOptions: { creature: { family: 'dish' } } }));
  assert.ok(moth.creatureItems > 0 && dish.creatureItems > 0, 'each family appears alone');
  assert.equal(both.creatureItems, moth.creatureItems + dish.creatureItems, 'both = moth + dish, nothing else');
});

// ── 6. the weight semantics on the home choice ──────────────────────────────
ok('weight biases NEW home choice by fertility; unweighted is the legacy centre-first pick', () => {
  const marks = [];
  for (let y = 0; y <= 700; y += 10) for (let x = 0; x <= 1000; x += 10) marks.push(x, y);
  // Fertility peaks at x=800 (the stage-1 region's right edge) and falls off to the left;
  // the NORMAL bar (+margin) is 0.57, so ground qualifies from x≈389 rightward: the
  // centre-first pick lands mid-field (≈494), heavy takes the peak, light the margin.
  const field = (x) => 1 - Math.abs(x - 800) / 1000;
  const args = { count: 1, existing: [], marks, field, band: null, canvasW: 1000, canvasH: 700 };
  const plain = chooseHomes(args);
  const medium = chooseHomes({ ...args, weight: 'medium' });
  const heavy = chooseHomes({ ...args, weight: 'heavy' });
  const light = chooseHomes({ ...args, weight: 'light' });
  assert.equal(plain.length, 1);
  assert.deepEqual(medium, plain, "'medium' (the native weight) is the unweighted pick, exactly");
  assert.ok(heavy[0].x > plain[0].x, 'heavy claims the strongest (rightmost) ground first');
  assert.ok(light[0].x < plain[0].x, 'light takes the marginal (leftmost qualifying) ground first');
  const standing = chooseHomes({ ...args, count: 2, existing: plain, weight: 'heavy' });
  assert.deepEqual(standing[0], plain[0], 'a standing home is never re-ranked by the weight');
});

// ── 7. pin-still (Q1) ───────────────────────────────────────────────────────
ok('pin-still: the anchor holds (no drift), the animal keeps living (breath intact)', () => {
  const motion = (still) => ({
    driverSec: 1.3, amounts: { drift: 1, breath: 1 }, canvasW: 1000, canvasH: 700,
    ...(still ? { stillAssets: new Set(['creature']) } : {}),
  });
  const free = hoverPose(motion(false), 4242, 0);
  const held = hoverPose(motion(true), 4242, 0);
  assert.ok(free.dx !== 0 || free.dy !== 0, 'the un-pinned home drifts (the control case)');
  assert.equal(held.dx, 0); assert.equal(held.dy, 0); assert.equal(held.rot, 0);
  assert.equal(held.scale, free.scale, 'the breath scale is untouched — the animal keeps living');
});

console.log(`poolCitizenship.selfcheck: ok (#1694 S2 — ${n} checks)`);
