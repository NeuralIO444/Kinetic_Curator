// node src/curator/variants.selfcheck.mjs
//
// Look Explorer E5 (#1530) — Davis variants. Pins, at the deepest
// level that runs headlessly:
//   - the engine is a pure function of the recipe: same recipe +
//     same seed = identical svg, forever (regeneration is exact);
//   - every op generates across its declared domain on the REAL
//     library; morph applies ONLY where path structures are
//     identical (signature equality) and interpolates pointwise
//     (t=0 is A, t=1 is B); jitter stays inside its tolerance;
//   - the recipe boundary: sanitize/isRecipe via provenance — a
//     crowned variant keep carries its recipes through the shelf
//     door and the ledger door, bounded and droppable when forged,
//     and a provenance without variants sanitizes exactly as E3
//     left it;
//   - the miner axis: off by default (the E2 stream untouched), on
//     demand a recorded fraction of cast members are variants whose
//     recipes ride the records; quota still passes; every variant
//     renders through the standard bake (re-bake parity);
//   - the doctrine: variant-ness is provenance, not a feature axis —
//     a variant featurizes at its lead parent's coordinates on both
//     sides of the ledger, FEATURES_VERSION is untouched, and the
//     census counts each cast member exactly once, under its lead
//     family;
//   - the tray distinction: the VARIANT tag in the shipped component
//     and the label's trailing 'variant' segment (the label itself
//     follows the house rule — no artist names on product surfaces).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// localStorage shim BEFORE any store import (E1a/E3's pattern).
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => { queueMicrotask(() => fn(performance.now())); return 1; };

const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES, resolvePalette } = await import('../data/palettes.js');
const V = await import('./variants.mjs');
const {
  sanitizeProvenance, isProvenance, provenanceLabel,
} = await import('./provenance.mjs');
const {
  sampleBatch, runMiner, bakeSample, composeStillSvg, recordFor, featuresOfKeep,
} = await import('./miner.mjs');
const { recipeFeatures, FEATURES_VERSION } = await import('./recipeFeatures.js');
const { sanitizeFavorite } = await import('../state/slices/davisSlice.js');
const { ledgerRow, isLedgerRow } = await import('./tasteLedger.js');

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const lines = [];
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── the engine: determinism + record shape ──────────────────────────
{
  const fixtures = [
    { parents: ['org_blob_01'], op: 'symmetry', seed: 11, params: { folds: 5, mirror: true } },
    { parents: ['geo_circle_01'], op: 'tile', seed: 12, params: { count: 4, radius: 18, scale: 0.45 } },
    { parents: ['org_leaf_02'], op: 'restyle', seed: 13, params: { mode: 'outline', dash: 0 } },
    { parents: ['org_blob_02'], op: 'jitter', seed: 14, params: { amount: 2 } },
    { parents: ['org_blob_01', 'dot_field_01'], op: 'superpose', seed: 15, params: { rot: 30, scaleB: 0.8, dx: 5, dy: -5 } },
    { parents: ['org_blob_01', 'line_cross_01'], op: 'mask', seed: 16, params: {} },
    { parents: ['org_leaf_01', 'org_petal_01'], op: 'splice', seed: 17, params: {} },
  ];
  for (const recipe of fixtures) {
    const svg1 = V.generateVariantSvg(recipe, byId);
    const svg2 = V.generateVariantSvg(recipe, byId);
    assert.ok(svg1, `${recipe.op} generates`);
    assert.strictEqual(svg1, svg2, `${recipe.op}: same recipe + seed = identical svg, forever`);
    assert.strictEqual(V.variantIdFor(recipe), V.variantIdFor({ ...recipe }), 'the id is a pure function of the recipe');
    assert.ok(V.isVariantId(V.variantIdFor(recipe)), 'the id carries the variant shape');
  }
  const rec = V.variantRecord(fixtures[0], byId);
  assert.strictEqual(rec.category, 'organic', 'a variant inherits its lead parent’s category');
  assert.ok(rec.tags.includes('variant'), 'the record is tagged variant');
  assert.strictEqual(rec.variant, fixtures[0], 'the record carries its recipe');
  assert.strictEqual(rec.generation.at, 'deal-time', 'generation declares itself: deal-time, never per-frame');
  assert.ok(!('regions' in rec), 'the lead’s baked region mattes are NOT inherited — they describe the lead’s shape, not the variant’s');
  lines.push('engine: every op generates deterministically; ids are recipe hashes; the record inherits lead placement fields, never its mattes');
}

// ── domains across the real library ─────────────────────────────────
{
  let generated = 0;
  let applicable = 0;
  for (const a of ASSETS) {
    for (const op of ['symmetry', 'tile']) {
      const recipe = { parents: [a.id], op, seed: 5, params: V.drawVariantParams(op, () => 0.42) };
      assert.ok(V.generateVariantSvg(recipe, byId), `${op} applies to every asset (${a.id})`);
      generated++;
    }
    // jitter: paths or leaf geometry — every authored asset has one or the other
    const jr = { parents: [a.id], op: 'jitter', seed: 5, params: { amount: 1.5 } };
    if (V.opApplicable('jitter', a.svg)) { applicable++; assert.ok(V.generateVariantSvg(jr, byId), `jitter generates for ${a.id}`); }
  }
  assert.strictEqual(generated, ASSETS.length * 2, 'symmetry + tile cover the whole library');
  assert.ok(applicable >= 280, `jitter's domain is nearly the whole library (${applicable})`);
  // restyle modes are honestly partial: each mode has assets it cannot touch
  const fillOnly = byId.get('geo_circle_01');
  assert.strictEqual(
    V.generateVariantSvg({ parents: ['geo_circle_01'], op: 'restyle', seed: 1, params: { mode: 'dash', dash: 0 } }, byId),
    null, 'dash on a stroke-less asset is an honest null, not a fake variant',
  );
  assert.ok(fillOnly.svg.includes('var(--ink)'), 'fixture sanity: the circle is painted');
  lines.push('domains: symmetry/tile are universal; jitter covers paths + leaf geometry; restyle modes refuse honestly where they do not apply');
}

// ── morph: the honest subset ────────────────────────────────────────
{
  const sigs = new Map();
  for (const a of ASSETS) {
    const s = V.pathSignature(a.svg);
    if (s) { if (!sigs.has(s)) sigs.set(s, []); sigs.get(s).push(a.id); }
  }
  const group = [...sigs.values()].find((g) => g.length >= 2);
  assert.ok(group, 'the library holds morph-compatible families');
  const [idA, idB] = group;
  assert.strictEqual(V.morphCompatible(byId.get(idA).svg, byId.get(idB).svg), true, 'signature equality is the compatibility rule');
  const at = (t) => V.generateVariantSvg({ parents: [idA, idB], op: 'morph', seed: 3, params: { t } }, byId);
  const pathD = (svg) => V.pathNodesOf(svg).map((p) => p.d);
  assert.deepStrictEqual(pathD(at(0)), pathD(byId.get(idA).svg).map((d) => V.serializePath(V.parsePath(d))),
    'morph at t=0 is the lead’s own geometry (canonicalized)');
  assert.deepStrictEqual(pathD(at(1)), pathD(byId.get(idB).svg).map((d) => V.serializePath(V.parsePath(d))),
    'morph at t=1 is the partner’s geometry');
  assert.notDeepStrictEqual(pathD(at(0.5)), pathD(at(0)), 'morph at t=0.5 is genuinely between');
  const stranger = ASSETS.find((a) => V.pathSignature(a.svg) && V.pathSignature(a.svg) !== V.pathSignature(byId.get(idA).svg));
  assert.strictEqual(
    V.generateVariantSvg({ parents: [idA, stranger.id], op: 'morph', seed: 3, params: { t: 0.5 } }, byId),
    null, 'morph across structures is refused — superpose and mask carry that load',
  );
  lines.push(`morph: compatible families exist (e.g. ${idA} × ${idB}); t interpolates pointwise; incompatible pairs return null`);
}

// ── jitter tolerance + splice/mask structure ────────────────────────
{
  const src = byId.get('org_blob_01');
  const amount = 2;
  const out = V.generateVariantSvg({ parents: ['org_blob_01'], op: 'jitter', seed: 42, params: { amount } }, byId);
  const before = V.parsePath(V.pathNodesOf(src.svg)[0].d);
  const after = V.parsePath(V.pathNodesOf(out)[0].d);
  assert.strictEqual(after.map((s) => s.c).join(''), before.map((s) => s.c).join(''), 'jitter preserves the path structure');
  for (let k = 0; k < before.length; k++) {
    for (let j = 0; j < before[k].p.length; j++) {
      assert.ok(Math.abs(after[k].p[j] - before[k].p[j]) <= amount + 0.001,
        `jitter stays inside its tolerance (segment ${k})`);
    }
  }
  const spliced = V.generateVariantSvg({ parents: ['org_leaf_01', 'org_petal_01'], op: 'splice', seed: 7, params: {} }, byId);
  assert.ok(spliced.includes('M50 6') || spliced.includes('M 50 6'), 'splice carries the second parent’s segments');
  assert.ok(spliced.length > byId.get('org_leaf_01').svg.length * 0.8, 'splice carries both parents’ drawing streams');
  const masked = V.generateVariantSvg({ parents: ['org_blob_01', 'line_cross_01'], op: 'mask', seed: 7, params: {} }, byId);
  assert.ok(masked.includes('<clipPath id="vclip_') && masked.includes('clip-path="url(#vclip_'), 'mask clips by the lead’s silhouette through a recipe-keyed clipPath');
  lines.push('jitter: structure preserved, every coordinate within tolerance · splice interleaves both streams · mask wires a clipPath');
}

// ── the recipe boundary (provenance) ────────────────────────────────
{
  const recipe = { parents: ['org_blob_01'], op: 'symmetry', seed: 11, params: { folds: 5, mirror: true } };
  const prov = { source: 'explorer', run: 'xpl-fixture-5', corner: 'wilderness', variants: [recipe] };
  assert.deepStrictEqual(sanitizeProvenance(prov), prov, 'a variant provenance survives sanitizing whole');
  assert.strictEqual(isProvenance(prov), true);
  const forged = { ...prov, variants: [{ parents: ['org_blob_01'], op: 'smelt', seed: 1, params: {} }] };
  const cleaned = sanitizeProvenance(forged);
  assert.ok(cleaned && !('variants' in cleaned), 'a forged recipe is dropped; the provenance itself survives on its real facts');
  assert.strictEqual(isProvenance(forged), false, 'a malformed variants list is off-schema');
  const clamped = V.sanitizeRecipe({ parents: ['org_blob_01'], op: 'symmetry', seed: 1, params: { folds: 99, mirror: true, bogus: 1 } });
  assert.strictEqual(clamped.params.folds, 8, 'params clamp to the declared span');
  assert.ok(!('bogus' in clamped.params), 'unknown params are dropped');
  assert.strictEqual(V.sanitizeRecipe({ parents: ['a', 'b'], op: 'symmetry', seed: 1, params: { folds: 3, mirror: false } }), null,
    'arity is law: a transform takes one parent');
  const e3Fixture = {
    source: 'explorer', run: 'xpl-fixture-1', corner: 'haeckel',
    axes: { layout: 'radial', palette: 'hydra', castSize: 3 },
  };
  assert.deepStrictEqual(sanitizeProvenance(e3Fixture), e3Fixture, 'a provenance without variants sanitizes EXACTLY as E3 left it');
  lines.push('boundary: recipes survive whole when valid, drop when forged, clamp to declared spans; E3 shapes untouched');
}

// ── the shelf + ledger doors carry the recipe ───────────────────────
{
  const recipe = { parents: ['org_blob_01'], op: 'symmetry', seed: 11, params: { folds: 5, mirror: true } };
  const vid = V.variantIdFor(recipe);
  const record = {
    seed: 5150, seedOffsets: {},
    config: { layout: { mode: 'grid', count: 40 }, palette: { id: 'hydra' }, assets: [vid] },
    provenance: { source: 'explorer', run: 'xpl-fixture-5', corner: 'wilderness', variants: [recipe] },
  };
  const kept = sanitizeFavorite({ ...record, timestamp: '2026-10-14T00:00:00.000Z' });
  assert.deepStrictEqual(kept.provenance, record.provenance, 'the shelf record keeps its variant recipes');
  assert.deepStrictEqual(kept.config.assets, [vid], 'the variant id survives the cast sanitizer');
  const row = ledgerRow({ ...record, timestamp: '2026-10-14T00:00:00.000Z', context: null });
  assert.deepStrictEqual(row.provenance, record.provenance, 'the ledger line keeps the recipes');
  assert.strictEqual(isLedgerRow(row), true, 'a variant line is a valid ledger row');
  lines.push('doors: sanitizeFavorite + the taste ledger carry recipes whole; the crowned variant stays reproducible');
}

// ── the miner axis ──────────────────────────────────────────────────
const SMOKE = { runSeed: 0x1530, batchSize: 36, finalistCount: 6, variantFraction: 0.4 };
{
  const off = sampleBatch({ runSeed: 0x1530, batchSize: 12 });
  assert.ok(off.every((s) => !('variants' in s)), 'default: no sample carries variants — the axis is off');
  assert.ok(off.every((s) => s.cast.every((id) => byId.has(id))), 'default: every cast member is a library asset');

  const run = runMiner(SMOKE);
  const run2 = runMiner(SMOKE);
  assert.deepStrictEqual(
    run2.finalists.map((f) => f.fingerprint), run.finalists.map((f) => f.fingerprint),
    'determinism: the variant run reproduces its finalist bakes',
  );
  assert.deepStrictEqual(
    run2.finalists.map((f) => f.record), run.finalists.map((f) => f.record),
    'determinism: the variant records reproduce exactly',
  );
  const v = run.report.variants;
  assert.ok(v && v.dealt > 0, 'the run dealt variants and says so');
  assert.strictEqual(run.config.variantFraction, 0.4, 'the fraction is recorded in the run config');
  assert.strictEqual(run.runId, 'xpl-1530-36-6-var40', 'the run id names the axis');
  assert.strictEqual(run.quota.pass, true, 'quota still passes — variants count under their lead families');

  // records: recipes ride exactly the casts that carry variants
  for (const f of run.finalists) {
    const variantIds = f.sample.cast.filter((id) => V.isVariantId(id));
    const recipes = f.record.provenance.variants || [];
    assert.deepStrictEqual(
      recipes.map((r) => V.variantIdFor(r)).sort(), [...variantIds].sort(),
      'every variant member has its recipe in provenance; no recipe rides a plain cast',
    );
    for (const id of variantIds) {
      assert.ok(f.record.config.assets.includes(id), 'the variant id is in the record cast');
    }
    // bake parity for variant finalists: re-bake reproduces the still
    const rebake = bakeSample(f.sample);
    assert.strictEqual(rebake.fingerprint, f.fingerprint, `finalist sample ${f.sample.index}: re-bake parity holds with variants in the cast`);
  }

  // census accounting: every cast member resolves, exactly once,
  // under a real family — variants under their leads
  let members = 0;
  let resolved = 0;
  for (const c of run.baked) {
    for (const id of c.sample.cast) {
      members++;
      const rec = recordFor(id, c.sample);
      if (rec && rec.category) resolved++;
      if (V.isVariantId(id)) assert.strictEqual(rec.variant.parents[0], c.sample.variants[id].parents[0], 'resolution agrees with the sample’s recipe');
    }
  }
  assert.strictEqual(resolved, members, `census: all ${members} dealt members resolve exactly once — none lost, none doubled`);

  // the still actually draws the variant (its generated svg is in the composed still)
  const vf = run.finalists.find((f) => f.sample.cast.some((id) => V.isVariantId(id)));
  assert.ok(vf, 'the smoke run surfaces variant finalists');
  const vid = vf.sample.cast.find((id) => V.isVariantId(id));
  const vsvg = recordFor(vid, vf.sample).svg;
  const window = [...vsvg.matchAll(/.{30}/g)].map((m) => m[0]).find((w) => !w.includes('var('));
  const stillSvg = composeStillSvg(vf.items, resolvePalette(vf.sample.paletteId, null, []));
  assert.ok(window && stillSvg.includes(window), 'the composed still embeds the variant’s generated svg (bake → still, no explorer-only path)');
  lines.push(`miner axis: dealt ${v.dealt} variants (${Object.entries(v.byOp).map(([k, n]) => `${k} ×${n}`).join(' · ')}), fallbacks ${v.fallbacks}, finalists carrying ${v.inFinalists} variant members; parity + census accounting hold`);
}

// ── the doctrine: features at lead coordinates ──────────────────────
{
  // #1545: the version literal this pin once held (3) was a proxy for the
  // property below — variant-ness contributes nothing to the feature
  // vector. FEATURES_VERSION legitimately moved to 4 when the scaleMid
  // axis was fixed; the doctrine is the deep-equals, not the number.
  const run = runMiner({ ...SMOKE, batchSize: 24 });
  const vf = run.finalists.find((f) => f.sample.cast.some((id) => V.isVariantId(id)))
    || run.baked.find((c) => c.sample.cast.some((id) => V.isVariantId(id)));
  assert.ok(vf, 'a variant carrier exists at this scale');
  const sample = vf.sample;
  const leadCast = sample.cast.map((id) => sample.variants?.[id]?.parents?.[0] ?? id);
  const direct = recipeFeatures({ layoutParams: sample.layoutParams, paletteId: sample.paletteId, assets: leadCast });
  const bakedOne = run.baked.find((c) => c.sample.index === sample.index);
  assert.strictEqual(bakedOne.features.v, FEATURES_VERSION, 'candidate features carry the current FEATURES_VERSION — variants add no version of their own');
  assert.deepStrictEqual(bakedOne.features.cast, direct.cast, 'candidate features: the cast reads as the lead cast');
  assert.deepStrictEqual(bakedOne.features.castCategories, direct.castCategories, 'candidate features: categories are the lead families — no “unknown”, no variant axis');
  const keepFeat = featuresOfKeep(bakedOne.record);
  assert.deepStrictEqual(keepFeat.castCategories, direct.castCategories, 'keep side agrees: a crowned variant keep featurizes at its leads');
  assert.ok(!keepFeat.castCategories.includes('unknown'), 'no variant ever featurizes as “unknown”');
  lines.push('doctrine: variant-ness is not a feature axis — both sides of the ledger read lead families');
}

// ── crown a variant keep through the real door (E3's pattern) ───────
{
  const { useStore } = await import('../state/store.js');
  const { wireEventBus } = await import('../composition/wireEventBus.js');
  const { applyAction } = await import('../state/applyAction.js');
  const { emit, Events } = await import('../composition/eventBus.js');
  const { captureKeepContext } = await import('./keepContext.js');
  const { crownGate, MINED_SLOT_COST } = await import('./candidateTray.mjs');
  const { stageRecords, stageSlotsUsed } = await import('./shelf.mjs');
  wireEventBus(applyAction);
  const run = runMiner({ ...SMOKE, batchSize: 24 });
  const vf = run.finalists.find((f) => f.sample.cast.some((id) => V.isVariantId(id)));
  assert.ok(vf, 'a variant finalist to crown');
  const rec = vf.record;
  const used0 = stageSlotsUsed(useStore.getState().keeps, useStore.getState().keepStage);
  const gate = crownGate(stageRecords(useStore.getState().keeps, useStore.getState().keepStage), rec);
  assert.strictEqual(gate.ok, true, 'the variant crown fits the stage');
  emit(Events.KEEP_ADD, {
    keep: {
      seed: rec.seed, seedOffsets: { ...rec.seedOffsets },
      timestamp: new Date().toISOString(), context: captureKeepContext(useStore.getState().paletteId),
      config: rec.config, provenance: rec.provenance,
    },
  });
  await tick(); await tick();
  const st = useStore.getState();
  assert.strictEqual(stageSlotsUsed(st.keeps, st.keepStage), used0 + MINED_SLOT_COST, 'the variant crown takes a stage slot at mined cost');
  const keep = st.keeps[st.keeps.length - 1];
  assert.deepStrictEqual(keep.provenance, rec.provenance, 'the shelf keep carries the recipes (E3 door, E5 payload)');
  assert.doesNotThrow(() => st.recallFavorite(keep), 'recalling a variant keep does not throw at the store level');
  const enabled = Object.keys(useStore.getState().enabledAssets).filter((k) => useStore.getState().enabledAssets[k]);
  assert.ok(enabled.some((id) => V.isVariantId(id)), 'recall enables the variant member by id (live-pool materialization is the promotion act — staging report)');
  lines.push('crown: a variant finalist crowns through KEEP_ADD with recipes intact and recalls without error');
}

// ── the tray distinction ────────────────────────────────────────────
{
  const tray = readFileSync(new URL('../panels/davis/CandidateTray.jsx', import.meta.url), 'utf8');
  assert.ok(tray.includes('cand-tag-variant'), 'candidate cards carry the VARIANT tag for variant casts');
  assert.ok(tray.includes('provenance?.variants'), 'the tag is driven by the record’s provenance, not a guess');
  const leadId = ASSETS.find((a) => a.category === 'radial').id;
  const recipe2 = { parents: [leadId], op: 'symmetry', seed: 2, params: { folds: 4, mirror: false } };
  const vid = V.variantIdFor(recipe2);
  const rec = {
    config: { assets: [vid], palette: { id: 'hydra' } },
    provenance: { source: 'explorer', run: 'xpl-t', corner: 'wilderness', variants: [recipe2] },
  };
  const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
  const palettesById = new Map(PALETTES.map((p) => [p.id, p]));
  const label = provenanceLabel(rec, { assetsById, palettesById });
  assert.ok(label.startsWith('radial cast'), `the label counts the variant under its lead family, got: ${label}`);
  assert.ok(label.endsWith('· variant'), 'the label ends with the plain variant segment');
  assert.ok(!/davis|haeckel|reas/i.test(label), 'no artist name reaches the label (house display rule)');
  lines.push(`tray: VARIANT tag on variant cards · label "${label}"`);
}

console.log('variants.selfcheck:');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('variants.selfcheck: PASS');
