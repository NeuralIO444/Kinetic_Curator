// node src/curator/census.selfcheck.mjs
//
// Look Explorer E1b (#1505) — the census suite. Spec:
// docs/research/look-explorer-spec-2026-10-13.md §12 (RA3, RA5, RA6,
// PA3). Sibling of E1a's coverage suite: the pure measurement lives
// in censusReport.mjs; the store-level halves (the write-path door
// census, the Evolve/CURATE door question E1a routed here — answered
// by #1550, whose unified table + single door this suite now pins —
// RA6 round-trip, PA3 crown integrity) live here, driving the real store
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
  tasteAgreement, formatTasteAgreement,
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
const { validateTaste, scoreLayout } = await import('./tasteHead.js');
const { FEATURES_VERSION } = await import('./recipeFeatures.js');
const { captureFavorite, sanitizeFavorite, KEEPS_KEY } = await import('../state/slices/davisSlice.js');
const { normalizeSeedOffsets } = await import('../engine/kernel/rng.js');
const { generateLayoutTargets, randomizeKey, RANDOMIZABLE_KEYS, DICE_RANGES, EVOLVE_TARGET_OVERRIDES } = await import('../state/paramUtils.js');

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
  // 48/48 each; defaults parity bit-identical). Re-pinned 2026-10-14
  // twice over: #1551's fixture fix showed wobbleFreq was never dead
  // (its fixture swept frequency at wobbleAmp 0, where the kernel gates
  // the wobble term off; at a working amplitude it moves), and #1547
  // (Materials M1) made material move — the plate↔glass fixture delta
  // is the evidence (glass engages the #1129 machinery in
  // buildPlacements). The dead set is now exactly one key with a live
  // reason: kinemeBrushWobble (sourced since #1516, unapplied until
  // the #894/#897 stage-C consumer lands).
  const dead = paramRows.filter((r) => r.class === 'zero-in-context').map((r) => r.key).sort();
  assert.deepStrictEqual(dead, [
    'kinemeBrushWobble',
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
    'contactRadius', 'contactRepel', 'contactRestitution', 'dish', 'dishTempo', 'ecology', 'wind',
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
  assert.strictEqual(density.identicalInDish, false, 'density must move the dish path (#1538: crowding pressure drives the repel gain — 10 vs 100 can no longer be bit-identical)');
  assert.ok(density.defaultIsIdentity, 'density at its layout default must be the row-absent dish bit for bit (defaults parity: the crowding gain is exactly 1 at the pivot)');
  assert.strictEqual(density.tempoKeyExists, true, 'a tempo/thermal key must exist in PARAM_SPEC (the §4 TEMPO row is built, #1538)');

  const tempo = row('dishTempo (TEMPO)');
  assert.ok(tempo.movesDish, 'TEMPO must move the dish fingerprint (a hot dish is a different dish)');
  assert.ok(tempo.hotterKeepsEnergy, `a hot dish must keep more settle energy than a cold one: ${JSON.stringify(tempo.ke)}`);
  assert.ok(tempo.tempo0IsIdentity, 'TEMPO 0 must be the row-absent dish bit for bit (defaults parity: cold is the pre-#1538 engine)');
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
// the two doors. ANSWERED by #1550 (2026-10-14): one table
// (DICE_RANGES in paramUtils) and one door (validateLayoutParams).
// This section is the re-measured baseline — where it once pinned
// the disagreement, it now pins the unification, so a second table
// or a raw write door fails loudly if it ever returns. ─────────────
{
  const rng = mulberry32(0xE1B);
  const realRandom = Math.random;
  const observed = new Map(); // key -> {min, max} over target draws
  let zeroNoiseTarget = false;
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
        if (k === 'noiseFreq' && v === 0) zeroNoiseTarget = true;
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
  // The 0.00 target is gone at the source: Evolve rolls the shared
  // table, whose noiseFreq floor is the dice floor (0.002). (E1b
  // pinned its occurrence; #1550 re-measures its absence.)
  assert.strictEqual(zeroNoiseTarget, false, 'no 0.00 noiseFreq target may occur — Evolve rolls the shared table since #1550');
  // The shared randInt construction reaches both endpoints: zTiers 10
  // is targetable now. (The old private table floored [1, 10) at 9.)
  assert.strictEqual(observed.get('zTiers').max, 10, 'Evolve targets zTiers 10 through the shared randInt construction (#1550)');

  // The five disagreements E1a found, re-measured as bands from both
  // doors (seeded draws on each side). Four are unified: both bands
  // sit inside — and span — the one declared table range. The fifth
  // (swarmCohesion) is #1550's declared override: the Evolve band sits
  // inside [0.5, 3.5] while the dice band reaches past it on both ends.
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
  for (const k of ['count', 'density', 'noiseFreq', 'gravityWells']) {
    const b = bands[k];
    const decl = DICE_RANGES[k];
    assert.ok(b.evolve.min >= decl.lo && b.evolve.max <= decl.hi, `${k}: Evolve band must sit inside the declared table range [${decl.lo}, ${decl.hi}], got ${JSON.stringify(b.evolve)}`);
    assert.ok(b.dice.min >= decl.lo && b.dice.max <= decl.hi, `${k}: dice band must sit inside the declared table range [${decl.lo}, ${decl.hi}], got ${JSON.stringify(b.dice)}`);
    assert.ok(b.evolve.max - b.evolve.min >= 0.95 * (decl.hi - decl.lo), `${k}: Evolve band must span the declared range, got ${JSON.stringify(b.evolve)}`);
  }
  {
    const b = bands.swarmCohesion;
    const ov = EVOLVE_TARGET_OVERRIDES.swarmCohesion;
    assert.ok(b.evolve.min >= ov.lo && b.evolve.max <= ov.hi, `swarmCohesion: Evolve band must sit inside the declared override [${ov.lo}, ${ov.hi}], got ${JSON.stringify(b.evolve)}`);
    assert.ok(b.dice.min < ov.lo && b.dice.max > ov.hi, 'swarmCohesion: the dice band must reach past the declared override on both ends (a narrowing, not a copy)');
  }
  storeLines.push(`evolve vs dice bands (4000 seeded draws each; #1550 — one table, swarmCohesion the declared override): ${JSON.stringify(bands)}`);

  // THE CLAMP ANSWER, end to end — now a pure door property, measured
  // on a synthetic write: a noiseFreq of exactly 0.00 (which no door
  // can roll any more) fed through the store write path still lands
  // on the normalizer floor — 0.001, the PARAM_SPEC minimum (below
  // the dice floor of 0.002).
  const st = useStore.getState();
  st.setLayoutParams({ noiseFreq: 0 });
  const landed = useStore.getState().layoutParams.noiseFreq;
  assert.strictEqual(landed, 0.001, `a 0.00 noiseFreq write must land on the 0.001 floor, landed ${landed}`);
  storeLines.push(`noiseFreq clamp answer: a synthetic 0.00 write lands at ${landed} through setLayoutParams (the PARAM_SPEC floor; no door rolls 0.00 since #1550)`);
  st.setLayoutParams(normalizeLayoutParams({}));

  // One door now: randomizeParam lands through the same validating
  // door as every other write. Over 400 seeded density draws the raw
  // stream provably rolls past the document cap (101..120 — legal
  // dice output, illegal document value) — and every such roll lands
  // at exactly 100. Nothing sits raw; nothing waits for a later
  // validated write to heal it. (E1b pinned the raw landing; #1550
  // re-measures the clamp.)
  Math.random = mulberry32(0xC07E);
  const landedDensities = [];
  try {
    for (let i = 0; i < 400; i++) {
      useStore.getState().randomizeParam('density');
      landedDensities.push(useStore.getState().layoutParams.density);
    }
  } finally {
    Math.random = realRandom;
  }
  const replay = mulberry32(0xC07E);
  let overCap = 0;
  for (let i = 0; i < 400; i++) {
    const raw = randomizeKey('density', replay);
    if (raw > 100) overCap++;
    assert.strictEqual(landedDensities[i], Math.min(raw, 100), `draw ${i}: a roll of ${raw} must land at ${Math.min(raw, 100)}, landed ${landedDensities[i]}`);
  }
  assert.ok(overCap > 0, 'the seeded stream must roll past the cap at least once (else this section proves nothing)');
  storeLines.push(`one door (#1550): randomizeParam lands through validateLayoutParams — of 400 seeded density draws, ${overCap} rolled past the document cap and every one landed at exactly 100`);
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
// ── XGBoost T2 — taste agreement readout ─────────────────────────────
// The census grades the tree head against the ledger's own verdicts.
// Fixture numbers reproduce by hand: the head pays +1.0 for density
// 'high', else +0.5 when num.count < 0.25, else −0.5, over base 0.25.
const AGR_TASTE = validateTaste({
  kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, model: 'census fixture',
  dims: 1152, labels: { likes: 4, passes: 4 },
  head: {
    kind: 'xgboost-trees', objective: 'binary:logistic', baseScore: 0.25, fidelity: 0.9,
    features: ['density', 'num.count'],
    trees: [{
      f: 0, op: '=', v: 'high', gain: 3, y: { leaf: 1.0 },
      n: { f: 1, op: '<', v: 0.25, gain: 1, y: { leaf: 0.5 }, n: { leaf: -0.5 } },
    }],
  },
}).taste;
const rowA = { recipe: { layoutParams: { density: 90, count: 400 }, paletteId: 'hydra' } }; // sigmoid(1.25)
const rowB = { recipe: { layoutParams: { density: 20, count: 100 }, paletteId: null } }; // sigmoid(0.75)
const rowC = { recipe: { layoutParams: { density: 20, count: 600 }, paletteId: 'bone' } }; // sigmoid(-0.25)
const sA = scoreLayout(AGR_TASTE.head, rowA.recipe.layoutParams);
const sB = scoreLayout(AGR_TASTE.head, rowB.recipe.layoutParams);
const sC = scoreLayout(AGR_TASTE.head, rowC.recipe.layoutParams);
assert.ok(sA > sB && sB > sC, 'fixture head orders the fixture rows as designed');
const agr = tasteAgreement({
  keeps: [rowA, rowB, { recipe: { layoutParams: null, paletteId: null } }],
  passes: [rowC, rowB, {}],
}, AGR_TASTE);
assert.strictEqual(agr.present, true);
assert.strictEqual(agr.headKind, 'xgboost-trees');
assert.strictEqual(agr.tasteVersion, 1);
assert.strictEqual(agr.keeps.n, 2, 'two scorable keeps');
assert.strictEqual(agr.passes.n, 2, 'two scorable passes');
assert.strictEqual(agr.unscored, 2, 'null-params and recipe-less rows are counted, never dropped');
assert.strictEqual(agr.keeps.mean, +(((sA + sB) / 2).toFixed(4)), 'keep mean reproduces by hand');
assert.strictEqual(agr.passes.mean, +(((sC + sB) / 2).toFixed(4)), 'pass mean reproduces by hand');
// AUC by hand: pairs (A,C) win, (A,B) win, (B,C) win, (B,B) tie = 3.5/4.
assert.strictEqual(agr.auc, 0.875, 'rank-sum AUC reproduces by hand, ties counting half');
const agrText = formatTasteAgreement(agr);
assert.ok(agrText.includes('keeps mean 0.728') && agrText.includes('AUC 0.875'), `formatted readout carries the numbers:\n${agrText}`);
// absent, honestly: no taste, a linear taste, a below-bar tree head.
assert.deepStrictEqual(tasteAgreement({ keeps: [], passes: [] }, null), { present: false, reason: 'no taste loaded' });
const LINEAR_TASTE = validateTaste({
  kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, model: 'linear fixture',
  dims: 1152, labels: { likes: 1, passes: 1 },
  probe: { weights: new Array(1152).fill(0), bias: 0 },
  head: { terms: {}, num: {}, bias: 0, fidelity: 0.9, fitOn: 2 },
}).taste;
assert.strictEqual(tasteAgreement({ keeps: [rowA], passes: [] }, LINEAR_TASTE).present, false, 'linear taste: no tree head to grade with');
assert.ok(tasteAgreement({ keeps: [rowA], passes: [] }, LINEAR_TASTE).reason.includes('no tree head'));
const LOWFID_TASTE = validateTaste({
  kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, model: 'low fixture',
  dims: 1152, labels: { likes: 1, passes: 1 },
  head: { ...AGR_TASTE.head, fidelity: 0.1 },
}).taste;
assert.ok(tasteAgreement({ keeps: [rowA], passes: [] }, LOWFID_TASTE).reason.includes('fidelity bar'), 'below-bar head reports itself absent');
assert.ok(formatTasteAgreement(tasteAgreement({ keeps: [], passes: [] }, null)).startsWith('taste agreement: ABSENT'), 'absent formats as absent');
// an empty side is a present readout with nulls, not an absence.
const oneSide = tasteAgreement({ keeps: [], passes: [rowC] }, AGR_TASTE);
assert.strictEqual(oneSide.present, true);
assert.strictEqual(oneSide.keeps.mean, null, 'no keeps: mean is null, not 0');
assert.strictEqual(oneSide.auc, null, 'no keeps: no separation to report');

console.log(formatCensusReport({ paramRows, dishRows, reach, store: storeLines }));
console.log('census.selfcheck: OK (#1505 — RA3 census + dish matrix + write-path doors, RA5 reachability, RA6 round-trip, PA3 crown integrity)');
