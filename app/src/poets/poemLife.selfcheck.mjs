// poemLife.selfcheck.mjs — #2010 (RAY GUN line, P4): POEM ↔ LIFE.
//
// Pins the slice's contract (docs/design/raygun-headroom-2026-11-06.md §5, §9 F6, rulings D3 + D4):
//   A  the record: `raygun.life` is 'bedrock' | 'seed', named (never ambient), refused whole when anything else; a
//      record without it is exactly what it was; the store's one write (setPoemLife) lands as one undo step, needs a
//      standing treatment, rides across a mode change and leaves with the treatment
//   B  the surface + the bus: `treatments.life` is the performer's tap; a held poem refuses every other caller; the
//      change is announced once as a re-arm carrying `life`, with its cause
//   C  the culture's three poems, at the stage (the boundary — deal / wake — and nowhere else):
//        unarmed → a BYSTANDER: exactly as dealt, never seeded, never consumed, blocks nothing   (D3: off by default)
//        bedrock → terrain: exactly as dealt, and no cell lives under the words
//        seed    → an ordinary mark: seeded, then consumed — the garden blooms from the words
//      and the same record, the same stage → the same frame (replay)
//   D  the seam: buildPlacements carries the record to the field items (key only when armed); the live resolver
//      stamps `held` on a HELD poem's items only, so a held poem is terrain whether or not anything was armed
import assert from 'node:assert';
import { useStore } from '../state/store.js';
import { resetDirector } from '../curator/director.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { mkRng } from '../engine/prng.js';
import { on, Events, resetEnvelope } from '../composition/eventBus.js';
import { startTreatments, treatments } from '../curator/treatmentsLive.mjs';
import { createDishLifeStage, isTerrain, isBystander } from '../engine/dishLifeStage.mjs';
import { coverageField } from '../engine/dishLifeSeed.mjs';
import { CORPUS } from '../gl/parity/corpus.mjs';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('poemLife.selfcheck');

const S = () => useStore.getState();
const BASE = S();
const form = fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3));
assert.ok(form, 'fixture: a poem deals');
const withRec = (rec) => sanitizeFieldForm({ ...form, raygun: rec });
const reset = (fieldForm = form, lockedParams = {}) => {
  resetDirector();
  useStore.setState({
    seed: 0x1918,
    layoutParams: { ...BASE.layoutParams, composition: 'raster', fieldForm },
    lockedParams,
    poemDeal: 0,
    raygunTap: 0,
    curatePress: 0,
    historyUndoStack: [],
    historyRedoStack: [],
    kineticChapterId: null,
    kineticLanding: null,
    kineticRound: null,
    kineticNotch: null,
  });
};

// ── A · the record ───────────────────────────────────────────────────────
ok('A1 the door carries `life`, names nothing else, and adds no key without it', () => {
  for (const life of ['bedrock', 'seed']) {
    const r = withRec({ mode: 'carson', seed: 9, wear: 1, life });
    assert.deepStrictEqual(r.raygun, { mode: 'carson', seed: 9, wear: 1, life });
  }
  const plain = withRec({ mode: 'carson', seed: 9, wear: 1 });
  assert.deepStrictEqual(plain.raygun, { mode: 'carson', seed: 9, wear: 1 });
  assert.ok(!('life' in plain.raygun), 'a record armed before P4 grows no key');
  for (const bad of ['', 'both', 'Bedrock', 1, true, null, {}])
    assert.equal(withRec({ mode: 'carson', seed: 9, wear: 1, life: bad }), null, `life ${JSON.stringify(bad)}`);
});

ok('A2 setPoemLife: one undo step, needs a standing treatment, no seed drawn, nothing moved', () => {
  reset();
  S().setPoemLife('bedrock');
  assert.equal(S().layoutParams.fieldForm.raygun, undefined, 'no treatment standing → refused');
  assert.equal(S().historyUndoStack.length, 0);
  S().setPoemRaygun('carson');
  const armed = S().layoutParams.fieldForm.raygun;
  const undoAt = S().historyUndoStack.length;
  const tapAt = S().raygunTap;
  S().setPoemLife('bedrock');
  const r = S().layoutParams.fieldForm.raygun;
  assert.deepStrictEqual(r, { ...armed, life: 'bedrock' }, 'the same treatment, now with its life');
  assert.equal(S().historyUndoStack.length, undoAt + 1, 'one undo step');
  assert.equal(S().raygunTap, tapAt, 'no seed drawn: the ray-gun stream did not advance');
  assert.deepStrictEqual(S().layoutParams.fieldForm.stamps, form.stamps, 'the stored stamps never move');
  S().setPoemLife('bedrock');
  assert.equal(S().historyUndoStack.length, undoAt + 1, 'the value already standing changes nothing');
  S().setPoemLife('moss');
  assert.equal(S().layoutParams.fieldForm.raygun.life, 'bedrock', 'an unknown value is refused');
  S().setPoemLife(null);
  assert.ok(!('life' in S().layoutParams.fieldForm.raygun), 'null takes it off');
});

ok('A3 life rides a mode change and leaves with the treatment; a plate is never touched', () => {
  reset();
  S().setPoemRaygun('carson');
  S().setPoemLife('seed');
  S().cyclePoemRaygun(); // carson → greiman
  assert.equal(S().layoutParams.fieldForm.raygun.mode, 'greiman');
  assert.equal(S().layoutParams.fieldForm.raygun.life, 'seed', 'the performer’s choice about THIS poem survives the cycle');
  S().setPoemRaygun(null);
  assert.equal(S().layoutParams.fieldForm.raygun, undefined, 'disarm drops the record whole — life with it');
  S().setPoemRaygun('shot');
  assert.ok(!('life' in S().layoutParams.fieldForm.raygun), 'a re-arm starts plain');
  const plate = { ...form, plate: { kind: 'rule' } };
  reset(plate);
  S().setPoemLife('bedrock');
  assert.deepStrictEqual(S().layoutParams.fieldForm, plate, 'a plate stands untouched');
});

// ── B · the surface + the bus ────────────────────────────────────────────
let heard = [];
const offs = [Events.TREATMENT_ARM, Events.TREATMENT_DISARM].map((ev) => on(ev, (p, meta) => heard.push({ ev, p, meta })));
const stop = startTreatments({ getState: useStore.getState, subscribe: (fn) => useStore.subscribe(fn) });

ok('B1 treatments.life: the performer’s tap; announced once as a re-arm carrying `life`; read reports it', () => {
  reset();
  resetEnvelope();
  assert.equal(treatments.life('poem', { life: 'bedrock', by: 'performer' }), false, 'no treatment standing → refused');
  assert.equal(treatments.arm('poem', { mode: 'carson', by: 'performer' }), true);
  heard = [];
  assert.equal(treatments.life('poem', { life: 'bedrock', by: 'performer' }), true);
  assert.equal(heard.length, 1, 'announced once');
  assert.equal(heard[0].ev, Events.TREATMENT_ARM);
  assert.equal(heard[0].p.life, 'bedrock');
  assert.equal(heard[0].p.mode, 'carson');
  assert.equal(heard[0].p.from, 'carson', 'a re-arm of the same mode');
  assert.equal(heard[0].meta.cause, 'performer');
  assert.ok(Object.isFrozen(heard[0].p), 'payloads are frozen copies');
  assert.deepStrictEqual(treatments.read('poem'), { ...treatments.read('poem'), life: 'bedrock' });
  assert.equal(treatments.life('poem', { life: 'bedrock', by: 'performer' }), false, 'nothing to change, nothing announced');
  assert.equal(heard.length, 1);
  treatments.life('poem', { life: null, by: 'performer' });
  assert.equal(treatments.read('poem').life, undefined);
  assert.equal(treatments.life('poem', { life: 'seed', by: 'nobody' }), false, 'an unnamed caller is refused');
});

ok('B2 HOLD is sovereign: a held poem refuses every caller but the performer', () => {
  reset();
  treatments.arm('poem', { mode: 'carson', by: 'performer' });
  useStore.setState({ lockedParams: { fieldForm: true } });
  for (const by of ['davis', 'director', 'lois']) assert.equal(treatments.life('poem', { life: 'seed', by }), false, by);
  assert.equal(treatments.read('poem').life, undefined);
  assert.equal(treatments.life('poem', { life: 'seed', by: 'performer' }), true, 'the hand that holds it may');
});

// ── C · the stage ────────────────────────────────────────────────────────
const W = 1920;
const H = 1080;
const poemOf = (ls) => ls.flatMap((l) => l.items ?? []).filter((it) => String(it.key ?? '').startsWith('field-'));
const sceneWith = (rec, extra = {}) => {
  const doc = structuredClone(CORPUS[0].doc);
  doc.layoutParams = {
    ...doc.layoutParams,
    composition: 'raster',
    fieldForm: rec ? sanitizeFieldForm({ ...form, raygun: rec }) : form,
  };
  return resolveLayers(doc, { caps: getRenderCaps(doc.quality || 'balanced', false), ...extra });
};
const woken = (layers, gen = 30) => {
  const st = createDishLifeStage();
  const ls = layers.map((l) => ({ ...l, items: [...l.items] }));
  const applied = st.apply({ wakeMs: 1, gen, shed: 0 }, ls, W, H);
  return { st, ls, applied };
};
const sameAsDealt = (before, after) => {
  const was = new Map(before.map((it) => [it.key, it]));
  return after.filter((it) => {
    const b = was.get(it.key);
    return b && b.x === it.x && b.y === it.y && b.alpha === it.alpha && b.scale === it.scale && b.assetId === it.assetId;
  }).length;
};

ok('C1 the stage’s three poems: bystander and bedrock stand as dealt, seed is consumed', () => {
  const cases = [
    ['unarmed', null, true],
    ['bedrock', { mode: 'carson', seed: 9, wear: 1, life: 'bedrock' }, true],
    ['seed', { mode: 'carson', seed: 9, wear: 1, life: 'seed' }, false],
  ];
  for (const [name, rec, stands] of cases) {
    const layers = sceneWith(rec);
    const before = poemOf(layers);
    assert.ok(before.length > 5, `${name}: a poem stands`);
    const { applied, ls } = woken(layers);
    assert.ok(applied, `${name}: the culture runs on the rest of the scene`);
    const kept = sameAsDealt(before, poemOf(ls));
    if (stands) assert.equal(kept, before.length, `${name}: every stamp exactly as dealt`);
    else assert.equal(kept, 0, `${name}: the garden ate the words`);
  }
  assert.ok(isBystander({ key: 'field-a-b-0' }) && !isBystander({ key: 'field-a-b-0', life: 'seed' }));
  assert.ok(!isBystander({ key: 'life:3' }), 'the culture’s own cells are not poems');
  assert.ok(isTerrain({ key: 'field-a-b-0', life: 'bedrock' }) && !isTerrain({ key: 'field-a-b-0', life: 'seed' }));
});

ok('C2 BEDROCK blocks: no cell lives where the words stand; a bystander is grown over', () => {
  const live = (rec) => {
    const layers = sceneWith(rec);
    const poem = poemOf(layers);
    const { ls } = woken(layers, 60);
    const cells = ls.flatMap((l) => l.items).filter((it) => String(it.key).startsWith('life:'));
    const cols = 96;
    const rows = 54;
    const cov = coverageField(poem, { canvasW: W, canvasH: H, cols, rows });
    // a cell item is centred on its grid cell: count those whose grid cell the words cover
    const under = cells.filter((c) => cov[(c.index | 0)] > 0).length;
    return { cells: cells.length, under };
  };
  const bedrock = live({ mode: 'carson', seed: 9, wear: 1, life: 'bedrock' });
  const plain = live(null);
  assert.ok(bedrock.cells > 0 && plain.cells > 0, 'the culture lives in both');
  assert.equal(bedrock.under, 0, 'bedrock: nothing grows under the words');
  assert.ok(plain.under > 0, 'a bystander blocks nothing: the colonies grow over its ground');
});

ok('C3 replay: generation g is the same culture however it was reached — straight there, or by a long run and a seek back', () => {
  for (const life of ['bedrock', 'seed', undefined]) {
    const rec = { mode: 'shot', seed: 4, wear: 1, ...(life ? { life } : {}) };
    const layers = () => sceneWith(rec).map((l) => ({ ...l, items: [...l.items] }));
    const stamp = (gen) => ({ wakeMs: 1, gen, shed: 0 });
    const direct = createDishLifeStage();
    for (let g = 0; g <= 12; g++) direct.apply(stamp(g), layers(), W, H);
    const lsA = layers();
    direct.apply(stamp(12), lsA, W, H);
    const trip = createDishLifeStage();
    for (const g of [5, 25, 9, 30, 12]) for (let k = 0; k < 8; k++) trip.apply(stamp(g), layers(), W, H);
    const lsB = layers();
    trip.apply(stamp(12), lsB, W, H);
    assert.equal(trip.generation, 12, `${life}: seeked back to 12`);
    assert.equal(JSON.stringify(lsA), JSON.stringify(lsB), `${life}: generation 12 is the same culture`);
    // …and a fresh stage on the same record deals the same frame (the record is the whole contribution)
    const again = createDishLifeStage();
    for (let g = 0; g <= 12; g++) again.apply(stamp(g), layers(), W, H);
    const lsC = layers();
    again.apply(stamp(12), lsC, W, H);
    assert.equal(JSON.stringify(lsA), JSON.stringify(lsC), `${life}: same record, same frame`);
  }
});

// ── D · the seam ─────────────────────────────────────────────────────────
ok('D1 buildPlacements carries the record to the field items — the key exists only when armed', () => {
  assert.ok(poemOf(sceneWith(null)).every((it) => !('life' in it)), 'unarmed: no key, no hash drift');
  assert.ok(poemOf(sceneWith({ mode: 'carson', seed: 9, wear: 1 })).every((it) => !('life' in it)), 'treated but not armed');
  for (const life of ['bedrock', 'seed'])
    assert.ok(
      poemOf(sceneWith({ mode: 'carson', seed: 9, wear: 1, life })).every((it) => it.life === life),
      `${life}: every stamp carries it`,
    );
});

const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const liveInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, count: 40, particleCount: 40, mode: 'random', fieldForm: form },
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
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
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});

ok('D2 the live resolver: a HELD poem is terrain — stamped `held` on its own items only, and it stands under a culture', () => {
  const plainRes = createLiveResolver();
  const heldRes = createLiveResolver();
  const free = poemOf(plainRes.resolveLayers(liveInput()));
  const held = poemOf(heldRes.resolveLayers(liveInput({ lockedParams: { fieldForm: true } })));
  assert.ok(free.length > 5 && held.length === free.length, 'the same poem stands either way');
  assert.ok(free.every((it) => !('held' in it)), 'an unheld poem’s items are untouched');
  assert.ok(held.every((it) => it.held === true && isTerrain(it)), 'a held poem’s stamps are terrain');
  const rest = heldRes.resolveLayers(liveInput({ lockedParams: { fieldForm: true } })).flatMap((l) => l.items);
  assert.ok(rest.filter((it) => !String(it.key).startsWith('field-')).every((it) => !('held' in it)), 'nothing else is stamped');
  plainRes.dispose();
  heldRes.dispose();

  // under a culture: the held poem stands exactly as dealt AND blocks growth (bedrock), where the unheld one does not
  const run = (lockedParams) => {
    const r = createLiveResolver();
    const dealt = poemOf(r.resolveLayers(liveInput({ lockedParams })));
    const out = r.resolveLayers(liveInput({ lockedParams, dishLife: { wakeMs: 0, gen: 40, shed: 0 }, loopTimeMs: 16 }));
    const after = poemOf(out);
    const cells = out.flatMap((l) => l.items).filter((it) => String(it.key).startsWith('life:'));
    const cov = coverageField(dealt, { canvasW: 1280, canvasH: 720, cols: 96, rows: 54 });
    r.dispose();
    return { stands: sameAsDealt(dealt, after) === dealt.length, cells: cells.length, under: cells.filter((c) => cov[c.index | 0] > 0).length };
  };
  const heldRun = run({ fieldForm: true });
  const freeRun = run({});
  assert.ok(heldRun.stands && freeRun.stands, 'neither poem is eaten (D3: unarmed is untouched)');
  assert.ok(heldRun.cells > 0, 'the culture runs');
  assert.equal(heldRun.under, 0, 'a held poem is bedrock');
  assert.ok(freeRun.under > 0, '…where an unheld, unarmed one is grown over (the test discriminates)');
});

stop();
for (const off of offs) off();
console.log(`poemLife.selfcheck: ok (${passed} checks)`);
