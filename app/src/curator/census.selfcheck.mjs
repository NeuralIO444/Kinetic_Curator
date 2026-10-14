// node src/curator/census.selfcheck.mjs
//
// Look Explorer E1b (#1505) — the census suite. Spec:
// docs/research/look-explorer-spec-2026-10-13.md §12 (RA3, RA5, RA6,
// PA3). Sibling of E1a's coverage suite: the pure measurement lives
// in censusReport.mjs; the store-level halves (the write-path door
// census, the Evolve/CURATE door disagreement E1a routed here, RA6
// round-trip, PA3 crown integrity) live here, driving the real store
// through the real bus — the deepest level that runs headlessly.
//
// Assertion philosophy (E1a's): the census's FINDINGS are pinned as
// data. If a future change fixes a dead knob or breaks an isolation
// law, this suite fails loudly and the baseline must be re-measured,
// never quietly edited. Production findings are RESULTS here — their
// fixes are separate issues, never this stage.
import assert from 'node:assert';

// localStorage shim BEFORE any store import (davisSlice reads it at
// factory time) — E1a's pattern.
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const {
  paramCensus, dishMatrix, renderReachability, formatCensusReport,
  fingerprintItems, place, assetInk, mulberry32, CENSUS_SEED, CAST, CAST_IDS,
} = await import('./censusReport.mjs');
const { PARAM_SPEC, RANGE_SPEC, DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } = await import('../data/layout-modes.js');
const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');
const { useStore } = await import('../state/store.js');
const { wireEventBus } = await import('../composition/wireEventBus.js');
const { applyAction } = await import('../state/applyAction.js');
const { emit, Events } = await import('../composition/eventBus.js');
const { rollDice } = await import('./dice.js');
const { createPersonaScorer } = await import('./diceScorer.js');
const { captureKeepContext } = await import('./keepContext.js');
const { recordCrown, readCrowns } = await import('./diceCrowns.js');
const { captureFavorite, sanitizeFavorite, KEEPS_KEY } = await import('../state/slices/davisSlice.js');
const { normalizeSeedOffsets } = await import('../engine/kernel/rng.js');
const { generateLayoutTargets, randomizeKey, RANDOMIZABLE_KEYS } = await import('../state/paramUtils.js');

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const storeLines = [];
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── RA3 / RA5 — the pure census ─────────────────────────────────────
const paramRows = paramCensus();
const dishRows = dishMatrix();
const reach = renderReachability();

{
  // The standard cast must be whole — a mistyped id must fail here,
  // never silently shrink the company the census measures with.
  assert.strictEqual(CAST.length, CAST_IDS.length, `census cast shrank: ${CAST.length}/${CAST_IDS.length} ids resolved`);
  // Completeness: every key in the universe has exactly one row.
  const expected = Object.keys(PARAM_SPEC).length + Object.keys(RANGE_SPEC).length + 21;
  assert.strictEqual(paramRows.length, expected, `census rows ${paramRows.length} != key universe ${expected}`);
  const seen = new Set(paramRows.map((r) => r.key));
  assert.strictEqual(seen.size, paramRows.length, 'duplicate census rows');
  for (const k of Object.keys(PARAM_SPEC)) assert.ok(seen.has(k), `PARAM_SPEC key ${k} missing a row`);
  for (const k of Object.keys(RANGE_SPEC)) assert.ok(seen.has(k), `range key ${k} missing a row`);

  // Determinism: every swept fixture repeats bit-identically.
  for (const r of paramRows) {
    if (r.repeatIdentical !== undefined) {
      assert.strictEqual(r.repeatIdentical, true, `${r.key}: fixture not deterministic`);
    }
    if (r.class === 'moves') assert.strictEqual(r.delta.equal, false, `${r.key}: classed moves with an empty delta`);
    if (r.class === 'zero-in-context') assert.strictEqual(r.delta.equal, true, `${r.key}: classed zero with a delta`);
  }

  // THE FINDINGS, pinned. Dead knobs: zero delta in the context that
  // honestly exercises the consumer, with the wiring evidence in
  // censusReport.mjs's fixture notes. Re-pinned 2026-10-14 with the
  // #1516 brush fix: brushSize, brushSpacing, fieldScale, trailCount
  // and wobbleAmp now measure as moving (the census re-run on the
  // combined tree is the evidence). Re-pinned again 2026-10-14 with
  // the #1517 colonize fix: colonizeInfluence, colonizeKill,
  // colonizeBranch and colonizeStep now measure as moving (delta probe
  // 48/48 each; defaults parity bit-identical). Re-pinned a third time
  // 2026-10-14 with the #1551 fixture fix: wobbleFreq was never dead —
  // its fixture swept the frequency at wobbleAmp 0, where the kernel
  // gates the wobble term off entirely; swept at a working wobbleAmp
  // 20 through the fixture's own ctx it measures as moving. The dead
  // set is now exactly the two keys with live reasons:
  // kinemeBrushWobble (sourced since #1516, unapplied until #894/#897)
  // and material (its only live reader is an export warning, until
  // M1 #1547 lands GL material shading).
  const dead = paramRows.filter((r) => r.class === 'zero-in-context').map((r) => r.key).sort();
  assert.deepStrictEqual(dead, [
    'kinemeBrushWobble', 'material',
  ], `dead-knob set changed: ${JSON.stringify(dead)}`);

  // Not headless-measurable — consumers exist outside headless reach;
  // these are NOT dead, and the set is pinned so a key can never
  // quietly immigrate here to dodge a zero.
  const notHeadless = paramRows.filter((r) => r.class === 'not-headless').map((r) => r.key).sort();
  assert.deepStrictEqual(notHeadless, [
    'accumulationFade', 'accumulationFlow', 'accumulationOptics', 'accumulationPrism',
    'accumulationTunnel', 'audioAlphaMod', 'audioAttackMs', 'audioDecayMs',
    'audioModDepth', 'audioResponse', 'audioScaleMod', 'audioSwell',
    'blendMode', 'crooked', 'echoes', 'flowFade', 'groundShadow', 'hueRotate',
    'kinemeBoilFps', 'kinemeRate', 'leaveFade', 'parallax', 'prismFade',
    'rotateSpin', 'spectrumColour', 'spectrumDisplace', 'spectrumMap', 'spectrumScale', 'squash', 'trail', 'tunnelFade',
  ], `not-headless set changed: ${JSON.stringify(notHeadless)}`);

  const dishClassed = paramRows.filter((r) => r.class === 'dish-matrix').map((r) => r.key).sort();
  assert.deepStrictEqual(dishClassed, [
    'accumulation', 'accumulationWetness', 'collideMask', 'contactMode',
    'contactRadius', 'contactRepel', 'contactRestitution', 'dish', 'ecology', 'wind',
  ], `dish-matrix set changed: ${JSON.stringify(dishClassed)}`);
}

// ── RA3 — the dish matrix laws ──────────────────────────────────────
{
  const row = (knob) => dishRows.find((r) => r.knob.startsWith(knob));
  const dish = row('dish (DISH toggle)');
  assert.ok(dish.onOffDiffer, 'DISH on must differ from off in contact range');
  assert.ok(dish.offEqualsSolo, 'DISH off must equal the strata baked alone (A3 isolation)');

  const wet = row('accumulationWetness (WETNESS)');
  assert.ok(wet.ordered, `settle energy must order with wetness: ${JSON.stringify(wet.ke)}`);
  assert.ok(wet.contactsOffIdentical, 'WETNESS with contacts off must be bit-identical (C1 isolation)');

  const seam = row('accumulationWetness (FX-medium seam)');
  assert.strictEqual(seam.seamDry.pearlVx, -4, 'dry seam closed form: elastic rebound -4');
  assert.ok(seam.mediumCrossesSeam, 'a wet neighbour must tax the rebound across the seam (pair medium = the average)');

  const radius = row('contactRadius');
  assert.ok(radius.moves && radius.radius0IsIdentity, 'radius 0 must be identity; radius 20 must displace');
  assert.strictEqual(radius.dispRadius20, 7.5, 'cross-strata depenetration closed form: 7.5px');

  const rest = row('contactRestitution');
  assert.strictEqual(rest.vxRest1, -4, 'restitution 1 closed form: -4');
  assert.strictEqual(rest.vxRest0, -1, 'restitution 0 closed form: mass-weighted common velocity -1');

  const mask = row('collideMask');
  assert.ok(mask.disjointIsolated && mask.sharedMaskMoves, 'disjoint masks must isolate; shared masks must interact');

  const repel = row('contactRepel');
  assert.ok(repel.moves, 'repel must separate a same-group pair at shared velocity');

  const wind = row('wind');
  assert.ok(wind.massSplit, `wind must split travel by mass: light ${wind.travelLight}px vs heavy ${wind.travelHeavy}px`);
  assert.ok(wind.wind0EqualsNoDish, 'wind 0 in the dish must equal no dish at all (C2 identity)');
  assert.ok(wind.windMovesBake, 'wind must move a hype stratum bake');
  assert.strictEqual(wind.cloudStratumBakeMoved, false, 'the currents ride the organism path: a cloud stratum bake is unmoved by wind');

  const accum = row('accumulation (ACCUMULATION)');
  assert.ok(accum.fieldOn > 0 && accum.fieldOff === 0, `ACCUM on must deposit (got ${accum.fieldOn}); off must deposit nothing`);
  assert.ok(accum.readMovesCast, 'the trail read must move the cast (C3)');

  const eco = row('ecology');
  assert.ok(eco.fillsPool && eco.neverExceeds, `ecology on must fill the pooled cap exactly and never exceed it: ${JSON.stringify(eco.on)}`);
  assert.ok(eco.offRosterExact, 'ecology off must leave the dealt roster exact (C4 mode law)');

  const mingle = row('mingling (pigment exchange)');
  assert.ok(mingle.converges, `pigment gap must converge: ${mingle.gapEarly} -> ${mingle.gapLate}`);

  const density = row('density (as dish knob)');
  assert.ok(density.identicalInDish, 'the density layout param must not enter the dish path (measured bit-identical)');
  assert.strictEqual(density.tempoKeyExists, false, 'no tempo/thermal key exists in PARAM_SPEC (the §4 TEMPO row is unbuilt)');
}

// ── RA5 — render reachability ───────────────────────────────────────
{
  assert.strictEqual(reach.assets.length, ASSETS.length, 'every asset measured');
  assert.deepStrictEqual(reach.assetsUnreached, [], `unreached assets: ${JSON.stringify(reach.assetsUnreached.map((a) => a.id))}`);
  assert.deepStrictEqual([...reach.fontContingent].sort(), [
    'stamp_arrow_01', 'stamp_glyph_01', 'stamp_glyph_02', 'stamp_glyph_03',
    'stamp_glyph_04', 'stamp_glyph_05', 'stamp_glyph_06', 'stamp_letter_02',
    'stamp_num_04', 'stamp_num_05',
  ], `font-contingent set changed: ${JSON.stringify(reach.fontContingent)}`);

  // The fast raster is honest: on a fixed sample of path art it agrees
  // with the bake's own default raster to the pixel.
  for (const id of ['org_blob_01', 'geo_tri_01', 'rad_rings_01', 'xsh01', 'dot_field_01', 'line_squiggle_01']) {
    const a = byId.get(id);
    assert.strictEqual(assetInk(a.svg).ink, assetInk(a.svg, {}).ink, `${id}: fast raster disagrees with the bake raster`);
  }

  assert.strictEqual(reach.palettes.distinct, PALETTES.length, 'every palette must produce a distinct still');
  assert.deepStrictEqual(reach.palettes.stillCollisions, [], 'palette still collisions');
  assert.deepStrictEqual(reach.palettes.resolvedCollisions, [], 'palette resolved-colour collisions');

  assert.strictEqual(reach.layouts.distinct, 22, `distinct layout signatures: ${reach.layouts.distinct}`);
  assert.deepStrictEqual(reach.layouts.collisions, [
    ['random', 'ca'], ['grid', 'noise'], ['fibonacci', 'phyllotaxis'], ['swarm', 'hype', 'murmuration'],
  ], `layout signature collisions changed: ${JSON.stringify(reach.layouts.collisions)}`);
  const sep = reach.layouts.separation;
  assert.strictEqual(sep.noiseIsGridAliasAtDisplacement, true, 'noise is the grid sampler\u2019s registered alias — identical placements even at displacement 120 (by design, registry.js)');
  assert.ok(sep.caVsRandomWithGrid, 'ca separates from random once a CA grid exists');
  assert.ok(sep.phylloVsFibonacciAtDivergence, 'phyllotaxis separates from fibonacci once divergence moves');
  assert.strictEqual(sep.liveModeBakesDistinct, 3, 'the three live modes share a placement signature but bake distinctly (cloud, organism, murmuration physics)');
}

// ── RA3 — the write-path door census ────────────────────────────────
// Every key, written through the store action the UI writes through
// (setLayoutParam → validateLayoutParams), at min, at max, and out of
// range on both sides. What lands is what the instrument believes.
{
  const st = useStore.getState();
  const read = (k) => useStore.getState().layoutParams[k];
  const clampExp = (spec, v) => {
    const c = Math.min(spec.max, Math.max(spec.min, v));
    return spec.int ? Math.round(c) : c;
  };
  let doorBad = [];
  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    const step = (spec.max - spec.min) / 4 || 1;
    st.setLayoutParam(key, spec.min);
    if (!Object.is(read(key), clampExp(spec, spec.min))) doorBad.push(`${key}@min landed ${read(key)}`);
    st.setLayoutParam(key, spec.max);
    if (!Object.is(read(key), clampExp(spec, spec.max))) doorBad.push(`${key}@max landed ${read(key)}`);
    st.setLayoutParam(key, spec.min - step);
    if (!Object.is(read(key), clampExp(spec, spec.min))) doorBad.push(`${key}@below landed ${read(key)}`);
    st.setLayoutParam(key, spec.max + step);
    if (!Object.is(read(key), clampExp(spec, spec.max))) doorBad.push(`${key}@above landed ${read(key)}`);
  }
  assert.deepStrictEqual(doorBad, [], `door census failures: ${doorBad.join('; ')}`);
  storeLines.push(`door: all ${Object.keys(PARAM_SPEC).length} PARAM_SPEC keys land exactly at clamp(spec) for min / max / below / above writes through setLayoutParam`);

  // The behave* overrides: null is a legitimate write (clear), junk
  // is a rejection that keeps the previous value.
  st.setLayoutParam('behaveSep', 3.3);
  assert.strictEqual(read('behaveSep'), 3.3);
  st.setLayoutParam('behaveSep', null);
  assert.strictEqual(read('behaveSep'), null, 'null clears a behave override (it is the field\u2019s own default)');
  st.setLayoutParam('behaveSep', 2.2);
  st.setLayoutParam('behaveSep', 'gale');
  assert.strictEqual(read('behaveSep'), 2.2, 'junk on a nullable key is rejected, previous kept');

  // Junk on a plain numeric key: rejected, previous kept — never a
  // silent default, never a NaN in the document.
  st.setLayoutParam('density', 55);
  st.setLayoutParam('density', 'gale');
  assert.strictEqual(read('density'), 55, 'junk string rejected at the door');
  st.setLayoutParam('density', NaN);
  assert.strictEqual(read('density'), 55, 'NaN rejected at the door');
  st.setLayoutParam('count', null);
  assert.ok(Number.isFinite(read('count')), 'null on a non-nullable key rejected');

  // Pairs: written as [lo, hi], land as the linked {x, y} object,
  // clamped to the HARD range (wider than the slider range by design).
  st.setLayoutParam('scale', [0.5, 0.5]);
  assert.deepStrictEqual(read('scale'), { x: [0.5, 0.5], y: [0.5, 0.5] });
  st.setLayoutParam('scale', [99, 99]);
  assert.deepStrictEqual(read('scale'), { x: [6, 6], y: [6, 6] }, 'scale pair clamps to the hard range 6.0, not the slider range 3.0');
  st.setLayoutParam('rotate', [-999, 999]);
  assert.deepStrictEqual(read('rotate'), [-720, 720], 'rotate pair clamps to the hard range ±720');
  storeLines.push('door: pairs land as linked {x, y} and clamp to RANGE_HARD (scale 6.0, rotate ±720) — wider than the slider ranges, by design');

  // Enums: a valid value lands; an invalid one is rejected at the
  // door and the previous value stands.
  st.setLayoutParam('mode', 'ca');
  assert.strictEqual(read('mode'), 'ca');
  st.setLayoutParam('mode', 'bogus');
  assert.strictEqual(read('mode'), 'ca', 'invalid enum rejected, previous kept');
  st.setLayoutParams(normalizeLayoutParams({}));
}

// ── E1a's routed question — the Evolve table, the dice table, and
// the two doors ─────────────────────────────────────────────────────
{
  const rng = mulberry32(0xE1B);
  const realRandom = Math.random;
  const observed = new Map(); // key -> {min, max} over target draws
  let zeroNoiseTarget = null;
  Math.random = rng;
  try {
    // generateLayoutTargets takes the store-state shape (it reads
    // lockedParams); nothing locked, current params the defaults.
    const base = { layoutParams: normalizeLayoutParams({}), lockedParams: {} };
    for (let i = 0; i < 4000; i++) {
      const t = generateLayoutTargets(base);
      for (const k of RANDOMIZABLE_KEYS) {
        const v = t[k];
        if (v === undefined) continue;
        const vals = Array.isArray(v) ? v : [v];
        if (k === 'noiseFreq' && v === 0 && !zeroNoiseTarget) zeroNoiseTarget = t;
        for (const x of vals) {
          const cur = observed.get(k) || { min: Infinity, max: -Infinity };
          cur.min = Math.min(cur.min, x); cur.max = Math.max(cur.max, x);
          observed.set(k, cur);
        }
      }
    }
  } finally {
    Math.random = realRandom;
  }
  assert.ok(zeroNoiseTarget, 'a 0.00 noiseFreq target must occur within 4000 seeded Evolve draws');
  assert.strictEqual(observed.get('zTiers').max, 9, 'Evolve can never target zTiers 10 (floor of [1, 10))');

  // The five disagreements E1a found, re-measured as bands from both
  // tables (seeded draws on each side).
  const diceBands = {};
  for (const k of ['count', 'density', 'noiseFreq', 'gravityWells', 'swarmCohesion']) {
    const r = mulberry32(0xD1CE);
    let min = Infinity; let max = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const v = randomizeKey(k, r);
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) { min = Math.min(min, x); max = Math.max(max, x); }
    }
    diceBands[k] = { min: +min.toFixed(4), max: +max.toFixed(4) };
  }
  const bands = {};
  for (const k of Object.keys(diceBands)) {
    const o = observed.get(k);
    bands[k] = { evolve: { min: +o.min.toFixed(4), max: +o.max.toFixed(4) }, dice: diceBands[k] };
  }
  storeLines.push(`evolve vs dice bands (4000 seeded draws each): ${JSON.stringify(bands)}`);

  // THE CLAMP ANSWER, end to end: the 0.00 noiseFreq target, fed
  // through the store write path exactly as a finished morph feeds
  // its targets, lands on the normalizer floor — 0.001, the
  // PARAM_SPEC minimum (below the dice floor of 0.002).
  const st = useStore.getState();
  st.setLayoutParams(zeroNoiseTarget);
  const landed = useStore.getState().layoutParams.noiseFreq;
  assert.strictEqual(landed, 0.001, `0.00 noiseFreq target must land on the 0.001 floor, landed ${landed}`);
  storeLines.push(`noiseFreq clamp answer: an Evolve target of exactly 0.00 lands at ${landed} through setLayoutParams (the PARAM_SPEC floor; the dice floor is 0.002)`);
  st.setLayoutParams(normalizeLayoutParams({}));

  // The second door: CURATE's randomizeParam writes WITHOUT the
  // validating door — a density of 101..120 (legal dice output,
  // illegal document value) lands in layoutParams raw, until any
  // validated write re-normalizes the document and clamps it.
  Math.random = mulberry32(0xC07E);
  let rawDensity = null;
  try {
    for (let i = 0; i < 400; i++) {
      useStore.getState().randomizeParam('density');
      const d = useStore.getState().layoutParams.density;
      if (d > 100) { rawDensity = d; break; }
    }
  } finally {
    Math.random = realRandom;
  }
  assert.ok(rawDensity !== null, 'randomizeParam must be able to land density > 100 within 400 seeded draws');
  // A validated write of a different out-of-range value re-normalizes
  // the whole document — the smuggled value is clamped along with it.
  // (Writing the identical value back would be a no-op by design:
  // setLayoutParam returns early when nothing would change.)
  useStore.getState().setLayoutParam('density', rawDensity + 1);
  assert.strictEqual(useStore.getState().layoutParams.density, 100, 'the validated door clamps an out-of-range density to 100');
  storeLines.push(`two doors: CURATE randomizeParam landed density ${rawDensity} unvalidated; a validated write re-normalizes the document and clamps it to 100`);
  useStore.getState().setLayoutParams(normalizeLayoutParams({}));
}

// ── RA6 — persistence round-trip, per axis ──────────────────────────
{
  const st = useStore.getState();
  const enabledIds = () => Object.keys(useStore.getState().enabledAssets).filter((k) => useStore.getState().enabledAssets[k]).sort();
  const scenes = [
    {
      name: 'dish scene',
      seed: 54321, offsets: { spatial: 11, color: 22, asset: 33, noise: 44 },
      palette: 'petri-bloom',
      params: {
        mode: 'ca', count: 123, dish: true, ecology: true, contactRadius: 33,
        contactRestitution: 0.7, contactRepel: 2.5, accumulationWetness: 0.6,
        accumulation: true, scale: [0.5, 2.5], symmetry: 'radial-6', paletteShift: 'split',
      },
      cast: ['rad_rings_01', 'xsh01', 'geo_tri_01', 'stamp_glyph_01', 'org_blob_04'],
    },
    {
      name: 'plain scene',
      seed: 777, offsets: { spatial: 0, color: 0, asset: 0, noise: 0 },
      palette: 'v01d', params: { mode: 'grid', count: 30 },
      cast: ['geo_tri_01', 'org_blob_04', 'dot_field_01'],
    },
    {
      name: 'organism scene',
      seed: 0x0B105, offsets: { spatial: 5, color: 0, asset: 9, noise: 0 },
      palette: 'hydra',
      params: { mode: 'hype', behave: 'flock', behaveSep: 2.5, wind: 1.5, gravityWells: 2.5 },
      cast: ['line_squiggle_01', 'flora_flower_01'],
    },
  ];
  for (const scene of scenes) {
    st.setSeed(scene.seed);
    useStore.setState({ seedOffsets: { ...scene.offsets } });
    st.setLayoutParams(normalizeLayoutParams(scene.params));
    st.setPaletteId(scene.palette);
    st.loadDiceCast(scene.cast);
    const live = useStore.getState();
    const record = captureFavorite(live, scene.palette);
    assert.ok(record, `${scene.name}: capture produced a record`);
    const keepsBefore = useStore.getState().keeps.length;
    st.addKeep(record);
    assert.strictEqual(useStore.getState().keeps.length, keepsBefore + 1, `${scene.name}: keep appended`);
    // addKeep re-ids at the door (sanitizeFavorite({...keep, id})) —
    // the stored record is the appended one.
    const stored = useStore.getState().keeps[keepsBefore];
    // Capture fidelity: the stored record's layout is the live
    // layout, at the fixed point of the normalizer.
    assert.deepStrictEqual(stored.config.layout, normalizeLayoutParams(live.layoutParams), `${scene.name}: capture layout fidelity`);
    // Persist: the ledger on disk carries the record.
    const persisted = JSON.parse(lsData.get(KEEPS_KEY));
    const onDisk = persisted.find((k) => k.id === stored.id);
    assert.ok(onDisk, `${scene.name}: record persisted under ${KEEPS_KEY}`);
    // Reload: the reader's own path (parse + sanitize) reproduces
    // the record exactly — the fixed point.
    const entry = sanitizeFavorite(onDisk);
    assert.deepStrictEqual(entry, onDisk, `${scene.name}: sanitize fixed point on reload`);
    // Scramble every axis, then recall.
    st.setSeed(999);
    useStore.setState({ seedOffsets: { spatial: 1, color: 1, asset: 1, noise: 1 } });
    st.setLayoutParams(normalizeLayoutParams({ mode: 'orbit', count: 55 }));
    st.setPaletteId('dirty');
    st.loadDiceCast(['geo_tri_01']);
    st.recallFavorite(entry);
    const after = useStore.getState();
    assert.strictEqual(after.seed, entry.seed, `${scene.name}: seed axis`);
    assert.deepStrictEqual(after.seedOffsets, normalizeSeedOffsets(entry.seedOffsets), `${scene.name}: seedOffsets axis`);
    assert.deepStrictEqual(after.layoutParams, entry.config.layout, `${scene.name}: layout axis`);
    assert.strictEqual(after.paletteId, entry.config.palette.id, `${scene.name}: palette axis`);
    assert.deepStrictEqual(enabledIds(), [...entry.config.assets].sort(), `${scene.name}: cast axis`);
  }
  storeLines.push('RA6 round-trip: 3 scenes x 5 axes (seed, seedOffsets, layout, palette, cast) — capture, persist, reload, recall all exact; sanitize is a fixed point on the persisted record');
}

// ── PA3 — crown integrity ───────────────────────────────────────────
// The tray still premise, honestly: the shipped tray renders the
// finalist's layout glyph + per-asset thumbnails — there is no
// composed tray still to reproduce. What a crown PROMISES is a
// composition: this layout mode, this cast, on your current scene
// (params, palette, seed). PA3 is measured at that level: crown
// through the real bus (useDiceRoll.crown's exact emissions), commit
// the voice mix, and the resulting state must equal the promised
// composition — in the store, and in the placement bake (the still
// pipeline's own input), and in the keep the crown writes.
{
  wireEventBus(applyAction);
  const scorer = createPersonaScorer({ assetsById: byId });
  const scenes = [
    { name: 'A', seed: 0xC0FFEE, palette: 'hydra', params: { count: 64, density: 55, contactRadius: 12, dish: true }, cast: ['geo_tri_01', 'org_blob_04', 'dot_field_01'] },
    { name: 'B', seed: 777, palette: 'strata', params: { mode: 'grid', count: 30, jitter: 40 }, cast: ['line_squiggle_01'] },
  ];
  let crownsChecked = 0;
  for (const scene of scenes) {
    const roll = rollDice({ assets: ASSETS, rng: mulberry32(CENSUS_SEED), davisCode: null, scorer, crowns: [] });
    const finalists = scene.name === 'A' ? roll.finalists : roll.finalists.slice(0, 1);
    for (const f of finalists) {
      const st = useStore.getState();
      st.setSeed(scene.seed);
      useStore.setState({ seedOffsets: { spatial: 3, color: 1, asset: 4, noise: 1 } });
      st.setLayoutParams(normalizeLayoutParams(scene.params));
      st.setPaletteId(scene.palette);
      st.loadDiceCast(scene.cast);
      const pre = useStore.getState();
      const preParams = structuredClone(pre.layoutParams);
      const preOffsets = { ...pre.seedOffsets };
      const keepsBefore = pre.keeps.length;
      // useDiceRoll.crown's exact emissions, in order, with its
      // exact payload construction.
      const s = useStore.getState();
      emit(Events.MODE_LOAD, { id: f.layoutId });
      emit(Events.DICE_CAST, { assetIds: f.assetIds });
      emit(Events.KEEP_ADD, {
        keep: {
          seed: s.seed, seedOffsets: { ...s.seedOffsets }, timestamp: new Date().toISOString(),
          context: captureKeepContext(s.paletteId),
          config: {
            layout: { ...s.layoutParams, mode: f.layoutId },
            palette: { id: s.paletteId },
            assets: [...f.assetIds],
          },
        },
      });
      recordCrown({ layoutId: f.layoutId, assetIds: f.assetIds, davisCode: null });
      await tick(); await tick();
      const mid = useStore.getState();
      assert.ok(mid.voiceMix, `scene ${scene.name}/${f.layoutId}: MODE_LOAD opened a voice mix`);
      assert.deepStrictEqual(
        Object.keys(mid.enabledAssets).filter((k) => mid.enabledAssets[k]).sort(),
        [...f.assetIds].sort(),
        `scene ${scene.name}/${f.layoutId}: cast applied at DICE_CAST, before the mix commits`,
      );
      mid.advanceVoiceMix(1);
      useStore.getState().commitVoiceMix();
      const post = useStore.getState();
      const promised = normalizeLayoutParams({ ...preParams, mode: f.layoutId });
      assert.deepStrictEqual(post.layoutParams, promised, `scene ${scene.name}/${f.layoutId}: committed params = pre-crown params + crowned mode`);
      assert.deepStrictEqual(
        Object.keys(post.enabledAssets).filter((k) => post.enabledAssets[k]).sort(),
        [...f.assetIds].sort(),
        `scene ${scene.name}/${f.layoutId}: the mix commit must not revert the crowned cast`,
      );
      assert.strictEqual(post.seed, scene.seed, 'crown leaves the seed alone');
      assert.deepStrictEqual(post.seedOffsets, preOffsets, 'crown leaves the seed offsets alone');
      assert.strictEqual(post.paletteId, scene.palette, 'crown leaves the palette alone');
      // Bake equality: the post-crown state bakes the promised still.
      const castRecords = f.assetIds.map((id) => byId.get(id));
      const fpPost = fingerprintItems(place(post.layoutParams, {
        seed: post.seed, seedOffsets: post.seedOffsets, cast: castRecords, paletteId: post.paletteId,
      }), ['assetId', 'x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier']);
      const fpPromise = fingerprintItems(place(promised, {
        seed: scene.seed, seedOffsets: preOffsets, cast: castRecords, paletteId: scene.palette,
      }), ['assetId', 'x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier']);
      assert.strictEqual(fpPost, fpPromise, `scene ${scene.name}/${f.layoutId}: post-crown bake != promised composition bake`);
      // The keep the crown wrote carries the same promise.
      const keeps = useStore.getState().keeps;
      assert.strictEqual(keeps.length, keepsBefore + 1, 'crown wrote exactly one keep');
      const keep = keeps[keeps.length - 1];
      assert.strictEqual(keep.seed, scene.seed);
      assert.deepStrictEqual(keep.config.layout, promised, 'crown keep layout = promised composition');
      assert.deepStrictEqual([...keep.config.assets].sort(), [...f.assetIds].sort(), 'crown keep cast');
      assert.strictEqual(keep.config.palette.id, scene.palette, 'crown keep palette');
      crownsChecked++;
    }
  }
  const crownLog = readCrowns();
  assert.ok(crownLog.length >= crownsChecked, 'crown log recorded the crowns');
  storeLines.push(`PA3 crown integrity: ${crownsChecked} crowns across 2 scenes — store state, placement bake, and the written keep all equal the promised composition (pre-crown params + crowned mode + crowned cast, seed/palette untouched); measured at the store + placement-bake level (the tray renders thumbnails, not a composed still)`);
}

// ── The morph contract (E1a's gap, bounded) ─────────────────────────
// The eased interpolation lives only in the React hook
// useMorphEvolve.js and cannot run headlessly; this stage does NOT
// extract it (see the staging report for the reasoning). What CAN be
// pinned headlessly is the slice-level contract the hook consumes:
// morphToFavorite spans exactly the morphable keys, applies the
// discrete keys (mode included) at the press, and defers seed and
// palette to the morph's end.
{
  const st = useStore.getState();
  st.setSeed(4242);
  st.setLayoutParams(normalizeLayoutParams({ mode: 'grid', count: 40 }));
  st.setPaletteId('hydra');
  const target = normalizeLayoutParams({ mode: 'orbit', count: 200, density: 80, jitter: 90 });
  const fav = {
    seed: 31337, seedOffsets: { spatial: 8, color: 8, asset: 8, noise: 8 },
    config: { layout: target, palette: { id: 'strata' }, assets: ['geo_tri_01'] },
  };
  st.morphToFavorite(fav);
  const s = useStore.getState();
  assert.strictEqual(s.morphing, true, 'morph armed');
  assert.strictEqual(s.morphTo.count, 200, 'morph spans the morphable keys toward the target');
  assert.strictEqual(s.morphFrom.count, 40, 'morph starts from the live values');
  assert.strictEqual(s.layoutParams.mode, 'orbit', 'discrete keys (mode) apply at the press');
  assert.strictEqual(s.seed, 4242, 'seed is deferred to the morph\u2019s end (morphPendingSeed)');
  assert.strictEqual(s.morphPendingSeed, 31337);
  assert.strictEqual(s.morphPendingPalette, 'strata');
  storeLines.push('morph contract: morphToFavorite spans the morphable keys, applies discrete keys at the press, defers seed/palette to the hook — the eased traversal itself remains unmeasured (hook-only code; extraction declined, see staging report)');
}

// ── report ──────────────────────────────────────────────────────────
console.log(formatCensusReport({ paramRows, dishRows, reach, store: storeLines }));
console.log('census.selfcheck: OK (#1505 — RA3 census + dish matrix + write-path doors, RA5 reachability, RA6 round-trip, PA3 crown integrity)');
