// node src/curator/coverage.selfcheck.mjs
//
// #1504 (Explorer E1a) — the coverage census, standing. RA1 (dice tray
// coverage), RA2 (the other random doors), PA1 (tray distinctness), and
// the keeps cut. MEASUREMENT ONLY: this suite runs the repo's own dice,
// randomizeKey, Evolve target generator, morph wiring, and keep ledger
// over seeded streams and counts. It changes no behavior.
//
// Baselines are the 2026-10-13 audit (spec §0), which ran mulberry32(99):
// that exact stream reproduces the audit digit-for-digit in this harness
// (600 rolls -> 86 never-tray, radial 0, crystalline 0, candidates 292).
// An 8-seed sweep shows the audit's exact zeros were seed luck on
// near-zero categories — radial lands 0-2 of 26 across seeds, crystalline
// 0-2 of 12, never-tray total 82-91. The assertions below are therefore
// bands around the funnel's SHAPE (the zeros as near-zero ceilings),
// never tuned to one stream; a funnel repair (spec Q1) is supposed to
// break them, loudly, and force a re-baseline.
import { AUDIO_RIG_KEYS } from '../state/audioRig.js';
import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import { MORPHABLE_KEYS } from '../state/paramUtils.js';
import {
  diceTrayCoverage,
  randomDoorCoverage,
  evolveTargetCoverage,
  keepsCoverage,
  formatCoverageReport,
} from './coverageReport.mjs';

// ---------------------------------------------------------------- RA1 + PA1
const dice = diceTrayCoverage({ rolls: 600, seed: 0x1504 });
const diceReplay = diceTrayCoverage({ rolls: 600, seed: 0x1504 });
assert.deepStrictEqual(diceReplay, dice, 'seeded census is reproducible run-to-run');

const doors = randomDoorCoverage({ draws: 4000, seed: 0x1504 });
const evolve = evolveTargetCoverage({ draws: 2000 });

// ------------------------------------------------- RA2 morph endpoints (slice)
// The interpolation path itself (ease + lerp) lives only in the React
// hook useMorphEvolve.js and cannot be imported headlessly; what the
// slice owns — and what "covers the full span" means at the endpoints —
// is morphFrom/morphTo carrying both states' full, unclamped values.
// Shim first, then import (the favorites.selfcheck pattern).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k),
};
const { createDavisSlice, sanitizeFavorite, captureFavorite } = await import('../state/slices/davisSlice.js');

function boot() {
  let state;
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  state = createDavisSlice(set, () => state);
  return { api: state, get: () => state, call: (name, ...a) => state[name](...a) };
}

const PARAMS_A = {
  count: 100, scale: [0.5, 2.0], rotate: [-90, 90], alpha: [30, 85], jitter: 40,
  density: 60, zTiers: 4, noiseFreq: 0.008, noiseSpeed: 1.0, displacement: 60,
  particleCount: 150, swarmCohesion: 2.0, gravityWells: 1.5, damping: 0.94,
  wind: 1.0, flap: 0.5, breath: 0.4, lifeDrift: 0.5,
};
const PARAMS_B = {
  count: 500, scale: [0.9, 2.9], rotate: [-10, 170], alpha: [55, 95], jitter: 140,
  density: 110, zTiers: 9, noiseFreq: 0.014, noiseSpeed: 1.9, displacement: 140,
  particleCount: 290, swarmCohesion: 3.8, gravityWells: 2.9, damping: 0.97,
  wind: 1.9, flap: 0.85, breath: 0.75, lifeDrift: 0.85,
};

function assertMorphSpan(keepRaw, label) {
  const keep = sanitizeFavorite(keepRaw);
  const m = boot();
  Object.assign(m.get(), { layoutParams: { mode: 'grid', ...PARAMS_A } });
  m.call('morphToFavorite', keep);
  const st = m.get();
  assert.strictEqual(st.morphing, true, `${label}: morph starts`);
  // sanitizeFavorite normalizes the layout (defaults filled), so a keep
  // always presents all 18 morphable keys; the span must carry every one
  // of them, endpoints exact on both sides.
  assert.deepStrictEqual(
    Object.keys(st.morphTo).sort(),
    [...MORPHABLE_KEYS].sort(),
    `${label}: morphTo carries the full 18-key span`,
  );
  for (const key of MORPHABLE_KEYS) {
    assert.deepStrictEqual(st.morphFrom[key], PARAMS_A[key], `${label}: morphFrom.${key} is the live value, unclamped`);
    // the audio setup (FEEL keys) stays live across a recall (audioRig.js, "always live"); the picture keys are the keep's
    const want = AUDIO_RIG_KEYS.includes(key) ? PARAMS_A[key] : keep.config.layout[key];
    assert.deepStrictEqual(st.morphTo[key], want, `${label}: morphTo.${key} is ${AUDIO_RIG_KEYS.includes(key) ? 'the live audio setup' : "the keep's value"}, unclamped`);
  }
}
assertMorphSpan(
  { seed: 42, config: { layout: { mode: 'eden', ...PARAMS_B }, palette: { id: 'hydra' }, assets: ['geo_a'] } },
  'full keep',
);
assertMorphSpan(
  { seed: 43, config: { layout: { mode: 'grid', count: 123 }, palette: { id: 'bone' } } },
  'sparse keep (defaults fill the span)',
);

// ---------------------------------------------------------------- keeps cut
// Records are built by the slice's own capture helper from live-state
// fixtures, kept through its own persistence, and read back after a
// reload boot — the real ledger path, exercised end to end. Matt's
// production ledger (kc:keeps:v1 in his browser) is not in this repo;
// keepsCoverage() takes any record list, so the same cut runs on a
// ledger export unchanged. The gap is reported, not papered over.
const firstOf = (cat) => ASSETS.find((a) => a.category === cat).id;
const secondOf = (cat) => ASSETS.filter((a) => a.category === cat)[1].id;
const live = (seed, mode, castIds) => ({
  seed,
  seedOffsets: {},
  layoutParams: { mode, count: 40 },
  enabledAssets: Object.fromEntries(castIds.map((id) => [id, true])),
});
const shelf = boot();
shelf.call('addKeep', captureFavorite(live(11, 'grid', [firstOf('geometric'), secondOf('geometric'), firstOf('stamps')]), 'praystation'));
shelf.call('addKeep', captureFavorite(live(12, 'eden', [firstOf('radial'), firstOf('crystalline'), firstOf('linework')]), 'hydra'));
shelf.call('addKeep', captureFavorite(live(13, 'orbit', [firstOf('floral'), firstOf('biosynthetic'), firstOf('dots')]), 'praystation'));
shelf.call('addKeep', captureFavorite(live(14, 'grid', [firstOf('organic'), 'user:custom_1']), 'kiln-columns'));
shelf.call('addKeep', { seed: 15, timestamp: '', config: { layout: { mode: 'flow' }, palette: { id: 'v01d' } } }); // legacy: no cast
const reloaded = boot();
const keeps = keepsCoverage(reloaded.get().keeps);
const keepsNote = "production ledger is browser-local (kc:keeps:v1) and absent in this environment — the cut above ran on records driven through the slice's own capture/persist path; keepsCoverage() consumes a real ledger export unchanged.";

// ---------------------------------------------------------------- the report
console.log(formatCoverageReport({ dice, doors, evolve, keeps, keepsNote }));

// ---------------------------------------------------------------- assertions
const cat = Object.fromEntries(dice.categories.map((c) => [c.name, c]));
assert.ok(dice.candidates.distinct >= 285, `dealer proposes broadly: ${dice.candidates.distinct}/294 candidates (audit 282-292 by seed)`);
assert.ok(
  dice.tray.neverCount >= 70 && dice.tray.neverCount <= 105,
  `never-tray total in the audit band: ${dice.tray.neverCount} (audit 86; 8-seed sweep 82-91)`,
);
assert.ok(cat.radial.inTray <= 3, `radial near-zero: ${cat.radial.inTray}/26 in tray (audit 0 at seed 99; sweep 0-2)`);
assert.ok(cat.crystalline.inTray <= 3, `crystalline near-zero: ${cat.crystalline.inTray}/12 in tray (audit 0 at seed 99; sweep 0-2)`);
assert.ok(cat.floral.inTray <= 5, `floral near-zero: ${cat.floral.inTray}/15 (audit 2)`);
assert.ok(cat.biosynthetic.inTray <= 5, `biosynthetic near-zero: ${cat.biosynthetic.inTray}/12 (audit 2)`);
const haeckel = dice.packs.find((p) => p.name === 'haeckel');
assert.ok(haeckel.inTray >= 1 && haeckel.inTray <= 12, `haeckel pack partially reachable: ${haeckel.inTray}/20 — its linework half deals, its radial half does not`);
assert.strictEqual(dice.layoutsReached, dice.library.layouts, 'every layout mode reaches the tray');
assert.ok(dice.trios.meanPairwiseJaccard <= 0.1, `PA1: finalist trios stay distinct (mean overlap ${(dice.trios.meanPairwiseJaccard * 100).toFixed(1)}%, audit 1.7%)`);
assert.ok(dice.trios.hiOverlapPct <= 0.02, `PA1: >=50%-overlap trios stay rare (${(dice.trios.hiOverlapPct * 100).toFixed(2)}%, audit 0.3%)`);
assert.ok(dice.tray.top15Share <= 0.35, `concentration bounded: top 15 take ${(dice.tray.top15Share * 100).toFixed(1)}% of slots (audit 21%)`);

assert.ok(doors.allInRange, 'RA2: every randomizeKey roll inside its declared range (REFINE_RANGES mirror holds)');
assert.ok(doors.allQuartiles, 'RA2: every key reaches its top and bottom quartiles — no soft funnel in the CURATE door');
assert.ok(evolve.allPresent, 'RA2: evolve targets carry all 18 keys when nothing is locked');
assert.ok(evolve.allFinite, 'RA2: evolve targets are finite');
assert.ok(evolve.locksRespected, 'RA2: evolve targets respect locks');

assert.strictEqual(keeps.keeps, 5, 'keeps survive the reload boot');
assert.strictEqual(keeps.withCast, 4, 'four keeps carry casts');
assert.strictEqual(keeps.castless, 1, 'the legacy castless keep is counted, not dropped');
assert.strictEqual(keeps.unknownIds, 1, 'the custom (user:) asset id is counted as unknown, not miscategorized');
assert.strictEqual(keeps.distinctCategories, 9, 'the kept world spans 9 categories');
assert.ok(keeps.categories.some((c) => c.name === 'radial'), 'keeps hold radial — the shelf reaches what the tray cannot');
assert.ok(keeps.categories.some((c) => c.name === 'crystalline'), 'keeps hold crystalline');
assert.strictEqual(keeps.distinctPalettes, 4, 'keeps span 4 palettes');
assert.strictEqual(keeps.distinctLayouts, 4, 'keeps span 4 layouts');

console.log('coverage.selfcheck: OK (#1504 — RA1 tray census reproduces the audit band, RA2 doors honest, PA1 distinct, keeps cut on the real ledger path)');
