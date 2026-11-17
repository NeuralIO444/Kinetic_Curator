// node src/state/constructGate.selfcheck.mjs
// #2108 (constructs, slice 5c) — the CONSTRUCTS gate and "constructs lead".
//   1. gate off (absent or false): the look pass deals exactly what it dealt before, over many seeds — and the rng
//      stream after it is identical, so no later roll moves
//   2. gate on: the same pass keeps its size, leads with house constructs of the style in play, draws no extra rng,
//      and is a pure function of (pool, style)
//   3. the lead helper: half the pool (rounded up), one style, distinct, the rest in dealt order
//   4. the gate rides the project: absent = off, serialized only when on, round-trips, is in the watch list
//   5. the placeable pool places a construct only when a pool names it
//   7. the library cut: gate on, KIN/CHAOS/dice deal no complex (4+ shape) library asset
//   6. the Curator's dice: off = the roll as it was; on = every cast led by its lead asset's style's constructs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useStore } from './store.js';
import { lookPass } from './kineticSweep.mjs';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { assetRecords } from '../data/assetStyle.js';
import { ASSETS, ASSETS_CONSTRUCTS } from '../data/assets/index.js';
import { dealableRecords } from './rollPool.mjs';
import { mkRng } from '../engine/prng.js';
import { leadWithConstructs, constructSlots } from '../engine/constructLead.js';
import { serializeProject, parseProject } from './projectDocument.js';
import { PROJECT_STATE_KEYS as WATCHED_KEYS } from './projectWatch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const S = () => useStore.getState();
const records = dealableRecords(ASSETS);
const construct = new Set(ASSETS_CONSTRUCTS.map((a) => a.id));
const styleOf = new Map(ASSETS_CONSTRUCTS.map((a) => [a.id, a.style]));
const base = () => ({ ...S(), layoutParams: { ...S().layoutParams } });

// 1 — off is byte-identical, rng stream included.
{
  for (let seed = 1; seed <= 60; seed++) {
    const a = mkRng(seed);
    const b = mkRng(seed);
    const was = lookPass(base(), a, { looks: COMPOSITION_PRESETS, records });
    const off = lookPass({ ...base(), constructLead: false }, b, { looks: COMPOSITION_PRESETS, records });
    assert.equal(JSON.stringify(off), JSON.stringify(was), `seed ${seed}: gate false = gate absent`);
    assert.equal(a(), b(), `seed ${seed}: the rng stream after is identical`);
    assert.ok(!Object.keys(was.enabledAssets).some((id) => construct.has(id)), 'a dealt pool holds no construct');
  }
  ok('gate off (absent or false): 60 look passes identical, rng stream identical, no construct ever dealt');
}

// 2 — on: led, same size, no extra rng, pure.
{
  // the slice hands the pass the library-cut records when the gate is on; compare like with like
  const { reducedRecords } = await import('./rollPool.mjs');
  const reduced = reducedRecords(records);
  let led = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const a = mkRng(seed);
    const b = mkRng(seed);
    const off = lookPass({ ...base(), constructLead: false }, a, { looks: COMPOSITION_PRESETS, records: reduced });
    const on = lookPass({ ...base(), constructLead: true }, b, { looks: COMPOSITION_PRESETS, records: reduced });
    const offIds = Object.keys(off.enabledAssets);
    const onIds = Object.keys(on.enabledAssets);
    assert.equal(onIds.length, offIds.length, `seed ${seed}: the pool keeps its size`);
    const lead = onIds.filter((id) => construct.has(id));
    assert.equal(lead.length, constructSlots(offIds.length), `seed ${seed}: constructs take half, rounded up`);
    assert.equal(new Set(lead.map((id) => styleOf.get(id))).size, 1, `seed ${seed}: one style`);
    assert.equal(a(), b(), `seed ${seed}: the gate draws nothing from the rng`);
    assert.equal(on.lookId, off.lookId, 'the look is the same');
    led++;
  }
  const again = lookPass({ ...base(), constructLead: true }, mkRng(5), {
    looks: COMPOSITION_PRESETS,
    records: reduced,
  });
  assert.equal(
    JSON.stringify(again),
    JSON.stringify(
      lookPass({ ...base(), constructLead: true }, mkRng(5), { looks: COMPOSITION_PRESETS, records: reduced }),
    ),
  );
  ok(`gate on: ${led} passes led by constructs, size kept, no extra rng, deterministic`);
}

// 3 — the lead helper.
{
  const ids = ['geo_square_01', 'geo_circle_01', 'org_blob_01', 'dot_single_01', 'line_solid_01', 'rad_orbit_01'];
  for (const style of ['swiss', 'memphis', 'bauhaus', null]) {
    const out = leadWithConstructs(ids, style);
    assert.equal(out.length, ids.length);
    assert.equal(new Set(out).size, out.length, 'distinct');
    const lead = out.slice(0, constructSlots(ids.length));
    assert.ok(
      lead.every((id) => construct.has(id)),
      `${style}: the leading slots are constructs`,
    );
    if (style)
      assert.ok(
        lead.every((id) => styleOf.get(id) === style),
        `${style}: of the style in play`,
      );
    assert.deepEqual(
      out.slice(lead.length),
      ids.slice(0, ids.length - lead.length),
      `${style}: the rest are the dealt ids in order`,
    );
  }
  assert.deepEqual(leadWithConstructs([]), [], 'an empty deal with no name stays empty');
  const alone = leadWithConstructs([], 'engraved', 'look-x');
  assert.equal(alone.length, 3, 'an empty deal named by its look is three constructs alone');
  assert.ok(alone.every((id) => construct.has(id) && styleOf.get(id) === 'engraved'));
  assert.deepEqual(alone, leadWithConstructs([], 'engraved', 'look-x'), 'deterministic');
  assert.deepEqual(
    leadWithConstructs(ids, 'nonsense')
      .slice(0, 3)
      .every((id) => construct.has(id)),
    true,
  );
  ok('lead helper: half the pool, one style, distinct, the rest in dealt order; junk style falls back');
}

// 4 — the project.
{
  const st = { ...S() };
  const off = serializeProject({ ...st, constructLead: false });
  assert.ok(!('constructLead' in off), 'off serializes as before');
  const on = serializeProject({ ...st, constructLead: true });
  assert.equal(on.constructLead, true);
  assert.equal(parseProject(JSON.parse(JSON.stringify(on))).doc.constructLead, true);
  assert.equal(parseProject(JSON.parse(JSON.stringify(off))).doc.constructLead, false);
  assert.ok(WATCHED_KEYS.includes('constructLead'));
  assert.equal(S().constructLead, false, 'default off');
  S().setConstructLead(true);
  assert.equal(S().constructLead, true);
  S().setConstructLead(false);
  ok('the gate rides the project: default off, serialized only when on, round-trips, watched');
}

// 5 — the placeable pool.
{
  const src = readFileSync(join(here, '../gl/liveResolve.mjs'), 'utf8');
  assert.match(src, /CONSTRUCT_IDS\.has\(a\.id\)\s*\?\s*!!\(src\.enabledAssets && src\.enabledAssets\[a\.id\]\)/);
  ok('the resolver places a construct only when a pool names it (an all-era null pool never does)');
}

// 6 — the Curator's dice.
{
  const { rollDice } = await import('../curator/dice.js');
  const { createPersonaScorer } = await import('../curator/diceScorer.js');
  const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
  const scorer = createPersonaScorer({ assetsById });
  let casts = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const was = rollDice({ assets: ASSETS, rng: mkRng(seed), scorer });
    const off = rollDice({ assets: ASSETS, rng: mkRng(seed), scorer, constructLead: false });
    assert.equal(JSON.stringify(off), JSON.stringify(was), `seed ${seed}: dice gate false = absent`);
    assert.ok(
      was.candidates.every((c) => !c.assetIds.some((id) => construct.has(id))),
      'dealt casts hold no construct',
    );
    const r = mkRng(seed);
    const on = rollDice({ assets: ASSETS, rng: r, scorer, constructLead: true });
    const r2 = mkRng(seed);
    rollDice({ assets: ASSETS, rng: r2, scorer });
    assert.equal(r(), r2(), `seed ${seed}: the gate draws nothing from the rng`);
    assert.equal(on.candidates.length, was.candidates.length);
    for (const c of on.candidates) {
      const lead = c.assetIds.filter((id) => construct.has(id));
      assert.equal(lead.length, constructSlots(c.assetIds.length), 'constructs take the lead slots');
      assert.equal(new Set(lead.map((id) => styleOf.get(id))).size, 1, 'one style per cast');
      assert.ok(c.assetIds.slice(0, lead.length).every((id) => construct.has(id)));
      casts++;
    }
  }
  ok(`dice: gate off = the roll as it was (25 seeds); on: ${casts} casts led by one style's constructs, no extra rng`);
}

// 7 — the library cut, through the real store taps.
{
  const { isComplexAsset, reducedRecords, COMPLEX_SHAPES } = await import('./rollPool.mjs');
  assert.equal(COMPLEX_SHAPES, 4);
  const dealableNow = dealableRecords(ASSETS);
  const complexAll = ASSETS.filter((a) => isComplexAsset(a.id) && dealableNow.some((r) => r.id === a.id));
  assert.equal(complexAll.length, 130, 'the 130 complex (4+ shape) dealable assets Matt cut');
  const reduced = reducedRecords(dealableRecords(ASSETS));
  assert.equal(
    reduced.length + complexAll.filter((a) => dealableRecords(ASSETS).some((r) => r.id === a.id)).length,
    dealableRecords(ASSETS).length,
  );
  assert.ok(reduced.every((r) => !isComplexAsset(r.id)));
  // an artist's own import is never cut
  const imp = { id: 'user:mine', category: 'geometric', svg: '<g>' + '<rect/>'.repeat(9) + '</g>', source: 'import' };
  assert.ok(
    reducedRecords(dealableRecords(ASSETS, [imp])).some((r) => r.id === 'user:mine'),
    'imports are never cut',
  );
  const kept = (ids) => ids.filter((id) => isComplexAsset(id));
  let off = 0;
  let on = 0;
  for (let i = 0; i < 40; i++) {
    useStore.setState({ constructLead: false, seed: 1000 + i });
    S().kineticLookPass();
    off += kept(Object.keys(S().enabledAssets || {})).length;
    useStore.setState({ constructLead: true, seed: 1000 + i });
    S().kineticLookPass();
    const ids = Object.keys(S().enabledAssets || {});
    assert.ok(ids.length >= 2, `seed ${i}: a pool is dealt`);
    on += kept(ids).length;
  }
  assert.ok(off > 0, 'with the gate off, complex assets still deal (the deal as it was)');
  assert.equal(on, 0, 'with the gate on, no complex library asset is dealt by KIN');
  for (let i = 0; i < 20; i++) {
    useStore.setState({ constructLead: true, seed: 2000 + i });
    S().kineticRoll();
    const ids = Object.keys(S().enabledAssets || {});
    assert.equal(kept(ids).length, 0, 'CHAOS deals no complex asset');
  }
  const { rollDice } = await import('../curator/dice.js');
  const { createPersonaScorer } = await import('../curator/diceScorer.js');
  const sc = createPersonaScorer({ assetsById: new Map(ASSETS.map((a) => [a.id, a])) });
  const r = rollDice({ assets: ASSETS, rng: mkRng(9), scorer: sc, constructLead: true });
  assert.ok(
    r.candidates.every((c) => kept(c.assetIds).length === 0),
    'casts hold no complex asset',
  );
  useStore.setState({ constructLead: false });
  ok(
    `library cut: ${complexAll.length} complex assets undealt with the gate on (KIN, CHAOS, casts); imports never cut; gate off still deals them (${off} seen)`,
  );
}

console.log(`constructGate.selfcheck: OK (${checks} checks)`);
