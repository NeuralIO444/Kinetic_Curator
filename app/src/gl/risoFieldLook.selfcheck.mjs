// risoFieldLook.selfcheck.mjs — #2008 wiring (option 1, Matt 2026-11-09):
// the Riso field Look. The field dealer (engine/risoField.mjs) had zero
// callers; this suite proves its live tenant end to end —
//   1. the Look is a citizen of the catalogue (registered, pickable);
//   2. picking it deals the field through buildPlacements, in place of the
//      layer's pool marks, at the anchored rest when no breath input rides;
//   3. through the live resolver the field is a pure function of the
//      recorded conversation — two fresh resolvers byte-identical, the
//      breathing driven by recorded time inputs only, and a snapshot /
//      restore continuation byte-identical to the uninterrupted run;
//   4. the standing exclusions hold AFTER wiring: the Look is in no
//      dealing deck (KINETIC scopes, chapters), never dealt by the
//      creature dice, and the riso assets stay out of the dealable pool.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const { buildPlacements } = await import('../engine/buildPlacements.js');
const { createLiveResolver, checkResolverSnapshot } = await import('./liveResolve.mjs');
const { COMPOSITION_PRESETS, PRESET_GROUPS, getPreset, getPresetsByGroup } = await import('../data/presets.js');
const { STYLE_LOOKS } = await import('../data/styleLooks.js');
const { COMPOSITION_IDS } = await import('../data/layout-modes.js');
const { RISO_FIELD_LOOK_ID, dealRisoField, createBreathState, breatheFieldAt } =
  await import('../engine/risoField.mjs');
const { risoIconId, RISO_CANON_SEED, RISO_ICON_SET_SIZE } = await import('../engine/risoGrammar.mjs');
const { ASSETS_RISO } = await import('../data/assets/assets-riso.js');
const { ASSETS } = await import('../data/assets/index.js');
const { dealableRecords } = await import('../state/rollPool.mjs');
const { scopeDecks } = await import('../state/kineticScope.mjs');
const { chapterScopeDeck } = await import('../state/chapterWalk.mjs');
const { CHAPTERS } = await import('../data/chapters.js');
const { lookPass } = await import('../state/kineticSweep.mjs');
const { mkRng } = await import('../engine/prng.js');
const { assembleCreature } = await import('../engine/creatureAssembler.js');
const { handMutateValue } = await import('../engine/creatureBreed.js');
const { DEFAULT_LAYOUT_PARAMS } = await import('../data/layout-modes.js');

const CANON_IDS = new Set(ASSETS_RISO.map((a) => a.id));
const LOOK = getPreset(RISO_FIELD_LOOK_ID);

// ── 1. Catalogue citizenship ─────────────────────────────────────────────
ok('the Look is registered: resolvable, in the id list, last in the catalogue, in its own picker group', () => {
  assert.equal(LOOK.id, RISO_FIELD_LOOK_ID);
  assert.equal(LOOK.name, 'RISO FIELD');
  assert.equal(LOOK.group, 'riso');
  assert.ok(COMPOSITION_IDS.includes(RISO_FIELD_LOOK_ID), 'the id is a valid composition');
  assert.equal(
    COMPOSITION_PRESETS[COMPOSITION_PRESETS.length - 1].id,
    RISO_FIELD_LOOK_ID,
    'appended last (the append-only growth the dice exclusions rely on)',
  );
  assert.ok(
    PRESET_GROUPS.some((g) => g.id === 'riso' && g.label === 'Riso'),
    'the Riso group exists',
  );
  assert.ok(
    !STYLE_LOOKS.some((p) => p.id === RISO_FIELD_LOOK_ID),
    'an authored preset, not a style look (the style groups are 4+ recipe families)',
  );
  const pickerGroup = getPresetsByGroup().find((g) => g.id === 'riso');
  assert.ok(pickerGroup, 'the picker carries a Riso group');
  assert.deepEqual(
    pickerGroup.presets.map((p) => p.id),
    [RISO_FIELD_LOOK_ID],
    'the picker offers exactly this Look under Riso',
  );
});

// ── 2. The placement gate ────────────────────────────────────────────────
const CAPS = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const POOL = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const risoParams = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  ...LOOK.params,
  composition: RISO_FIELD_LOOK_ID,
  kinemeBreath: 0,
  kinemeDrift: 0,
  kinemePulse: 0,
  kinemeBrushWobble: 0,
  kinemePaletteBreath: 0,
  ...over,
});
const build = (layoutParams, extra = {}) =>
  buildPlacements({
    layoutParams,
    seed: 4242,
    activeAssets: POOL,
    palette: PALETTE,
    caps: CAPS,
    canvasW: 1000,
    canvasH: 700,
    ...extra,
  }).items;

ok('picked: the layer deals the riso field — every item a canon catalogue icon, keys riso:*', () => {
  const items = build(risoParams());
  assert.equal(items.length, LOOK.params.count, 'the recipe count is the field count');
  for (const it of items) {
    assert.ok(CANON_IDS.has(it.assetId), `${it.assetId} is a baked catalogue icon`);
    assert.ok(String(it.key).startsWith('riso:'), `${it.key} carries the dealer key`);
  }
});

ok('anchored rest: with no breath input the field stands exactly where the dealer dealt it', () => {
  const items = build(risoParams());
  const dealt = dealRisoField({ seed: 4242, count: LOOK.params.count, w: 1000, h: 700 });
  const atRest = breatheFieldAt(dealt, createBreathState());
  assert.deepEqual(
    items.map((i) => [i.x, i.y]),
    atRest.map((p) => [p.x, p.y]),
    'byte-identical to the anchored deal',
  );
  const again = build(risoParams());
  assert.deepEqual(
    JSON.stringify(again),
    JSON.stringify(items),
    'two identical builds are byte-identical (the stills/bake path)',
  );
});

ok('not picked: any other Look deals zero riso items', () => {
  for (const other of ['default', 'dot-song', 'lithograph-grid']) {
    const items = build(risoParams({ composition: other }));
    assert.equal(items.filter((i) => CANON_IDS.has(i.assetId)).length, 0, `${other}: no riso leakage`);
  }
});

ok(
  'the field re-addresses icons through the canon seed: a different layer seed deals a different arrangement of the same catalogue',
  () => {
    const a = build(risoParams());
    const b = buildPlacements({
      layoutParams: risoParams(),
      seed: 777,
      activeAssets: POOL,
      palette: PALETTE,
      caps: CAPS,
      canvasW: 1000,
      canvasH: 700,
    }).items;
    assert.ok(
      b.every((i) => CANON_IDS.has(i.assetId)),
      'every icon still addresses the canon catalogue',
    );
    assert.notDeepEqual(
      b.map((i) => i.assetId),
      a.map((i) => i.assetId),
      'the arrangement is the layer seed’s own',
    );
    assert.equal(RISO_CANON_SEED, 2008);
    assert.equal(risoIconId(RISO_CANON_SEED, 0), ASSETS_RISO[0].id);
    assert.equal(ASSETS_RISO.length, RISO_ICON_SET_SIZE);
  },
);

// ── 3. Through the resolver: determinism, breathing, snapshot ───────────
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const resolverInput = (over = {}) => ({
  canvasW: 1000,
  canvasH: 700,
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'lithograph',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: risoParams(),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  dtSec: 1 / 20,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  phraseWrapGen: 0,
  attractor: null,
  ...over,
});
// The recorded conversation: 60 frames at 50 ms; the beat drive is silent
// for 10 frames, then full. Everything the breath reads rides this input.
const FRAMES = 60;
const frameInput = (f) => resolverInput({ loopTimeMs: 16 + f * 50, beatDrive: f < 10 ? 0 : 1 });
const hashOut = (out) =>
  createHash('sha256')
    .update(JSON.stringify(out.map((l) => (l.items || []).map((i) => [i.x, i.y, i.assetId, i.scale, i.key]))))
    .digest('hex');
const runHashes = (resolver, from, to) => {
  const hashes = [];
  let out = null;
  for (let f = from; f < to; f++) {
    out = resolver.resolveLayers(frameInput(f));
    hashes.push(hashOut(out));
  }
  return { hashes, out };
};

ok('determinism: two fresh resolvers replay the recorded conversation byte-identically', () => {
  const a = runHashes(createLiveResolver(), 0, FRAMES);
  const b = runHashes(createLiveResolver(), 0, FRAMES);
  assert.deepEqual(a.hashes, b.hashes, 'same recorded inputs → byte-identical field, frame for frame');
  const items = a.out.find((l) => l.id === 'lyr-a').items;
  assert.ok(items.length > 0 && items.every((i) => CANON_IDS.has(i.assetId)), 'the stage carries the field');
});

ok('breathing: frame 0 is the anchored deal; driven frames move the field off it', () => {
  const r = createLiveResolver();
  const first = r.resolveLayers(frameInput(0)).find((l) => l.id === 'lyr-a').items;
  const dealt = dealRisoField({ seed: 4242, count: LOOK.params.count, w: 1000, h: 700 });
  assert.deepEqual(
    first.map((i) => [i.x, i.y]),
    dealt.placements.map((p) => [p.x, p.y]),
    'the first presented frame is anchored (recorded time starts at zero)',
  );
  let last = first;
  for (let f = 1; f < FRAMES; f++) last = r.resolveLayers(frameInput(f)).find((l) => l.id === 'lyr-a').items;
  const moved = last.filter((it, k) => !Object.is(it.x, first[k].x) || !Object.is(it.y, first[k].y)).length;
  assert.ok(moved > 0, `the driven breath moved ${moved}/${last.length} icons off the anchor`);
});

ok('snapshot: the breath state rides it, a restore continues byte-identically, old snapshots stay valid', () => {
  const whole = runHashes(createLiveResolver(), 0, FRAMES);
  const head = createLiveResolver();
  runHashes(head, 0, 30);
  const snap = JSON.parse(JSON.stringify(head.snapshotState()));
  assert.ok(Array.isArray(snap.risoBreath) && snap.risoBreath.length === 1, 'the breath state rides the snapshot');
  assert.ok(checkResolverSnapshot(snap), 'the snapshot validates');
  const tail = createLiveResolver();
  tail.restoreState(snap);
  const cont = runHashes(tail, 30, FRAMES);
  assert.deepEqual(cont.hashes, whole.hashes.slice(30), 'the continuation is byte-identical to the uninterrupted run');
  const plain = createLiveResolver();
  plain.resolveLayers(resolverInput({ layoutParams: risoParams({ composition: 'dot-song' }), loopTimeMs: 16 }));
  assert.equal(plain.snapshotState().risoBreath, undefined, 'no riso layer, no risoBreath key in the snapshot');
});

// ── 4. The standing exclusions, re-proven after wiring ──────────────────
ok('dealing decks: no KINETIC scope deck contains the Look; med/koz are the catalogue minus one', () => {
  for (const scope of ['off', 'weak', 'med', 'koz']) {
    const ids = scopeDecks(scope).looks.map((l) => l.id);
    assert.ok(!ids.includes(RISO_FIELD_LOOK_ID), `${scope}: the Riso field Look is not dealable`);
  }
  assert.equal(scopeDecks('med').looks.length, COMPOSITION_PRESETS.length - 1);
  assert.equal(scopeDecks('koz').looks.length, COMPOSITION_PRESETS.length - 1);
});

ok('chapters: no chapter deals the Look at any scope', () => {
  for (const ch of CHAPTERS) {
    for (const scope of ['off', 'weak', 'med', 'koz']) {
      const ids = chapterScopeDeck(ch.id, scope).looks.map((l) => l.id);
      assert.ok(!ids.includes(RISO_FIELD_LOOK_ID), `chapter ${ch.id} @ ${scope}: not dealable`);
    }
  }
});

ok('the KINETIC roll: 300 scoped look passes never land the Riso field Look', () => {
  const dealt = new Set();
  for (const scope of ['med', 'koz']) {
    const deck = scopeDecks(scope);
    // One long-lived stream per scope — how the sweep itself drives the
    // pass (a fresh mkRng per trial would read only its correlated first
    // draw, which is a property of the stream, not of the deck).
    const rng = mkRng(scope === 'koz' ? 777 : 9000);
    for (let t = 0; t < 150; t++) {
      const res = lookPass(
        { layoutParams: { composition: 'default' }, lockedParams: {}, armedMode: null, armedMotion: null },
        rng,
        { looks: deck.looks, records: dealableRecords(ASSETS), pool: deck.pool },
      );
      assert.notEqual(res.lookId, RISO_FIELD_LOOK_ID, `trial ${t} @ ${scope}`);
      dealt.add(res.lookId);
    }
  }
  assert.ok(dealt.size > 30, `the roll still rolls (dealt ${dealt.size} distinct looks)`);
});

ok('the creature dice: assembly defaults and hand mutations never deal the Look', () => {
  const assetId = ASSETS.find((a) => !String(a.id).startsWith('riso_')).id;
  const assembled = new Set();
  for (let s = 0; s < 400; s++) {
    const rec = assembleCreature({ assetId, points: [], seed: s });
    assert.notEqual(rec.look, RISO_FIELD_LOOK_ID, `assemble seed ${s}`);
    assembled.add(rec.look);
  }
  assert.ok(assembled.size > 20, `the assembly dice still roll (dealt ${assembled.size} distinct looks)`);
  const mutated = new Set();
  const record = { id: 'riso-probe' };
  const gene = { family: 'LOOK', id: 'look', value: 'dot-song' };
  for (let s = 0; s < 400; s++) {
    const v = handMutateValue(record, gene, s);
    assert.notEqual(v, RISO_FIELD_LOOK_ID, `mutate seed ${s}`);
    if (v) mutated.add(v);
  }
  assert.ok(mutated.size > 20, `the mutation dice still roll (dealt ${mutated.size} distinct looks)`);
});

ok('the pool: riso assets stay out of the dealable records and the authored catalogue', () => {
  assert.ok(
    dealableRecords(ASSETS).every((a) => !String(a.id).startsWith('riso_')),
    'no riso icon is dealable from the pool',
  );
});

console.log(`risoFieldLook.selfcheck: ${n} probes passed`);
