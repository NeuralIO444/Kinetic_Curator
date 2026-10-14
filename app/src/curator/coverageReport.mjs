// coverageReport.mjs — #1504 (Explorer E1a): the coverage census.
//
// MEASUREMENT ONLY. Nothing in here changes the behavior of the dice, the
// scorer, CURATE, or the morph — these functions point the repo's own
// machinery at seeded streams and count what comes out. The audit in
// docs/research/look-explorer-spec-2026-10-13.md §0 was a one-off probe;
// this module is that probe made standing, so "I keep seeing the same
// thing" is a number with an alarm line, not a vibe (spec §6).
//
// Determinism law: every stream here is mulberry32-seeded. The one
// exception is evolveTargetCoverage: generateLayoutTargets rolls
// Math.random internally and accepts no stream, so that section asserts
// only per-draw properties (true of every single draw), never
// distribution claims.
import { ASSETS } from '../data/assets/index.js';
import { STUB_VOICES } from '../data/voices.js';
import { PALETTES } from '../data/palettes.js';
import { rollDice } from './dice.js';
import { createPersonaScorer } from './diceScorer.js';
import { RANDOMIZABLE_KEYS, randomizeKey, generateLayoutTargets } from '../state/paramUtils.js';
import { REFINE_RANGES } from './refineMutate.js';

/** The seeded stream every selfcheck in this area uses (see dice.selfcheck). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byId = new Map(ASSETS.map((a) => [a.id, a]));

/** Packs the audit names separately from categories (spec §0: the Haeckel pack). */
const PACKS = [
  { id: 'haeckel', test: (a) => a.id.startsWith('hae') },
];

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

/**
 * RA1 + PA1 — dice tray coverage and tray distinctness.
 * The audit's exact method (spec §0): the repo's rollDice + the interim
 * persona scorer, Davis silent (wildness 0.5), no crowns — crowns are the
 * performer's history, and the census measures the instrument, not the
 * history. One seeded stream deals the whole run.
 */
export function diceTrayCoverage({ rolls = 600, seed = 0x1504 } = {}) {
  const scorer = createPersonaScorer({ assetsById: byId });
  const rng = mulberry32(seed);
  const candidateSeen = new Set();
  const trayCount = new Map(); // assetId -> finalist appearances
  const layoutTray = new Map(); // layoutId -> finalist trios carrying it
  let finalistSlots = 0;
  let jaccardSum = 0;
  let jaccardPairs = 0;
  let hiOverlapTrios = 0;

  for (let i = 0; i < rolls; i++) {
    const r = rollDice({ assets: ASSETS, rng, davisCode: null, scorer, crowns: [] });
    for (const c of r.candidates) for (const id of c.assetIds) candidateSeen.add(id);
    const F = r.finalists;
    const trioLayouts = new Set();
    for (const f of F) {
      trioLayouts.add(f.layoutId);
      for (const id of f.assetIds) {
        trayCount.set(id, (trayCount.get(id) || 0) + 1);
        finalistSlots++;
      }
    }
    for (const id of trioLayouts) layoutTray.set(id, (layoutTray.get(id) || 0) + 1);
    let trioHi = false;
    for (let a = 0; a < F.length; a++) {
      for (let b = a + 1; b < F.length; b++) {
        const j = jaccard(F[a].assetIds, F[b].assetIds);
        jaccardSum += j;
        jaccardPairs++;
        if (j >= 0.5) trioHi = true;
      }
    }
    if (trioHi) hiOverlapTrios++;
  }

  const cut = (list) => list.map((key) => {
    const inLib = ASSETS.filter(key.test);
    return {
      name: key.name,
      inLibrary: inLib.length,
      inCandidates: inLib.filter((a) => candidateSeen.has(a.id)).length,
      inTray: inLib.filter((a) => trayCount.has(a.id)).length,
    };
  });
  const categories = cut(
    [...new Set(ASSETS.map((a) => a.category))].map((c) => ({
      name: c,
      test: (a) => a.category === c,
    })),
  ).sort((x, y) => x.inTray / x.inLibrary - y.inTray / y.inLibrary || x.name.localeCompare(y.name));
  const packs = cut(PACKS.map((p) => ({ name: p.id, test: p.test })));

  const trayIds = new Set(trayCount.keys());
  const topCounts = [...trayCount.values()].sort((a, b) => b - a);
  return {
    rolls,
    seed,
    library: { assets: ASSETS.length, palettes: PALETTES.length, layouts: STUB_VOICES.length },
    candidates: {
      distinct: candidateSeen.size,
      neverIds: ASSETS.filter((a) => !candidateSeen.has(a.id)).map((a) => a.id),
    },
    tray: {
      distinct: trayIds.size,
      neverCount: ASSETS.length - trayIds.size,
      neverIds: ASSETS.filter((a) => !trayIds.has(a.id)).map((a) => a.id),
      finalistSlots,
      top15Share: finalistSlots
        ? topCounts.slice(0, 15).reduce((s, n) => s + n, 0) / finalistSlots
        : 0,
    },
    categories,
    packs,
    layouts: STUB_VOICES.map((v) => ({ layout: v.id, trios: layoutTray.get(v.id) || 0 })),
    layoutsReached: layoutTray.size,
    trios: {
      count: rolls,
      meanPairwiseJaccard: jaccardPairs ? jaccardSum / jaccardPairs : 0,
      hiOverlapTrios,
      hiOverlapPct: rolls ? hiOverlapTrios / rolls : 0,
    },
  };
}

/**
 * RA2 (CURATE door) — distribution honesty of randomizeUnlocked's engine.
 * layoutSlice.randomizeUnlocked rolls every unlocked key through
 * randomizeKey (the rng is injectable, #518); locks only remove keys, so
 * the door's per-key distribution IS randomizeKey's. Declared ranges are
 * REFINE_RANGES — the one mirror of the dice ranges the repo already
 * maintains and self-proves (refineMutate.js); a draw outside the
 * declared range means the mirror and the door have drifted apart.
 * Quartile reach: a uniform door reaches its top and bottom quartiles;
 * a key that never does is a soft funnel (spec §12 RA2).
 */
export function randomDoorCoverage({ draws = 4000, seed = 0x1504 } = {}) {
  const rng = mulberry32(seed);
  const keys = RANDOMIZABLE_KEYS.map((key) => {
    const spec = REFINE_RANGES[key];
    const ranges = spec.pair ? spec.pair : [[spec.lo, spec.hi]];
    const streams = ranges.map(([lo, hi]) => ({ lo, hi, min: Infinity, max: -Infinity }));
    let outOfRange = 0;
    for (let i = 0; i < draws; i++) {
      const v = randomizeKey(key, rng);
      const vals = spec.pair ? v : [v];
      vals.forEach((x, e) => {
        const s = streams[e];
        if (!(typeof x === 'number' && x >= s.lo && x <= s.hi)) outOfRange++;
        if (typeof x === 'number') {
          if (x < s.min) s.min = x;
          if (x > s.max) s.max = x;
        }
      });
    }
    return {
      key,
      pair: !!spec.pair,
      outOfRange,
      streams: streams.map((s) => ({
        lo: s.lo,
        hi: s.hi,
        min: s.min,
        max: s.max,
        reachesLowQuartile: s.min <= s.lo + 0.25 * (s.hi - s.lo),
        reachesHighQuartile: s.max >= s.lo + 0.75 * (s.hi - s.lo),
      })),
    };
  });
  return {
    draws,
    seed,
    keys,
    allInRange: keys.every((k) => k.outOfRange === 0),
    allQuartiles: keys.every((k) => k.streams.every((s) => s.reachesLowQuartile && s.reachesHighQuartile)),
  };
}

/**
 * RA2 (Evolve door) — generateLayoutTargets property census.
 * The generator rolls Math.random internally (no stream to seed), so
 * this asserts only what is true of EVERY draw: all 18 keys present
 * when nothing is locked, locked keys absent, values finite. Observed
 * spans are reported as observations, not distribution claims.
 */
export function evolveTargetCoverage({ draws = 2000 } = {}) {
  const spans = new Map(); // key -> {min, max} over numeric leaves
  let allPresent = true;
  let allFinite = true;
  const track = (key, v) => {
    const leaves = Array.isArray(v) ? v : [v];
    for (const x of leaves) {
      if (typeof x !== 'number' || !Number.isFinite(x)) { allFinite = false; continue; }
      const s = spans.get(key) || { min: Infinity, max: -Infinity };
      if (x < s.min) s.min = x;
      if (x > s.max) s.max = x;
      spans.set(key, s);
    }
  };
  for (let i = 0; i < draws; i++) {
    const t = generateLayoutTargets({ lockedParams: {} });
    for (const key of RANDOMIZABLE_KEYS) {
      if (!(key in t)) allPresent = false;
      else track(key, t[key]);
    }
  }
  const lockedKeys = ['count', 'wind', 'scale'];
  const lockedSample = generateLayoutTargets({
    lockedParams: Object.fromEntries(lockedKeys.map((k) => [k, true])),
  });
  return {
    draws,
    allPresent,
    allFinite,
    lockedKeys,
    locksRespected: lockedKeys.every((k) => !(k in lockedSample)),
    spans: RANDOMIZABLE_KEYS.map((key) => ({ key, ...(spans.get(key) || { min: null, max: null }) })),
  };
}

/**
 * Keeps coverage — the same category / palette / layout cut over keep
 * records (the #1140 shape, as sanitizeFavorite returns them). Pure:
 * the caller supplies records from whatever ledger it honestly has.
 * A keep spans a category when at least one cast member belongs to it;
 * castless (legacy) keeps count in the totals and are reported, never
 * silently dropped from the denominator.
 */
export function keepsCoverage(records) {
  const catKeeps = new Map();
  const palKeeps = new Map();
  const layKeeps = new Map();
  let withCast = 0;
  let unknownIds = 0;
  for (const r of records || []) {
    const cast = r?.config?.assets;
    if (Array.isArray(cast) && cast.length) {
      withCast++;
      const seen = new Set();
      for (const id of cast) {
        const a = byId.get(id);
        if (!a) { unknownIds++; continue; }
        seen.add(a.category);
      }
      for (const c of seen) catKeeps.set(c, (catKeeps.get(c) || 0) + 1);
    }
    const pid = r?.config?.palette?.id;
    if (pid) palKeeps.set(pid, (palKeeps.get(pid) || 0) + 1);
    const mode = r?.config?.layout?.mode;
    if (mode) layKeeps.set(mode, (layKeeps.get(mode) || 0) + 1);
  }
  const rows = (m) => [...m.entries()].map(([name, keeps]) => ({ name, keeps })).sort((a, b) => b.keeps - a.keeps || a.name.localeCompare(b.name));
  return {
    keeps: (records || []).length,
    withCast,
    castless: (records || []).length - withCast,
    unknownIds,
    categories: rows(catKeeps),
    distinctCategories: catKeeps.size,
    palettes: rows(palKeeps),
    distinctPalettes: palKeeps.size,
    layouts: rows(layKeeps),
    distinctLayouts: layKeeps.size,
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const frac = (n, d) => `${n}/${d}`;

/** The readable report (spec §6: reported per run, in the open). */
export function formatCoverageReport({ dice, doors, evolve, keeps, keepsNote }) {
  const L = [];
  L.push(`COVERAGE REPORT (#1504) — seeded headless census; dice: ${dice.rolls} rolls, Davis silent, no crowns, seed 0x${dice.seed.toString(16)}`);
  L.push(`library: ${dice.library.assets} assets · ${dice.library.palettes} palettes · ${dice.library.layouts} layouts`);
  L.push(`dealer: ${frac(dice.candidates.distinct, dice.library.assets)} assets proposed among candidates (${pct(dice.candidates.distinct / dice.library.assets)})`);
  if (dice.candidates.neverIds.length) {
    L.push(`  never proposed: ${dice.candidates.neverIds.join(', ')}`);
  }
  L.push(`tray: ${frac(dice.tray.distinct, dice.library.assets)} assets reached the finalist tray (${pct(dice.tray.distinct / dice.library.assets)}) · ${dice.tray.neverCount} never`);
  // Alarm rule: an exact zero is a hard alarm; <=10% of the family is a
  // near-zero alarm. The audit's zeros were seed luck (see the suite's
  // multi-seed note); the standing fact is the near-zero itself.
  const alarmFor = (inTray, inLibrary) => {
    if (inTray === 0) return '  ALARM — zero tray coverage';
    if (inTray / inLibrary <= 0.1) return '  ALARM — near-zero tray coverage';
    return '';
  };
  L.push('category (tray / library):');
  for (const c of dice.categories) {
    L.push(`  ${c.name.padEnd(14)} ${frac(c.inTray, c.inLibrary)}${alarmFor(c.inTray, c.inLibrary)}`);
  }
  for (const p of dice.packs) {
    L.push(`pack ${p.name.padEnd(10)} ${frac(p.inTray, p.inLibrary)}${alarmFor(p.inTray, p.inLibrary)}`);
  }
  L.push(`layouts: ${frac(dice.layoutsReached, dice.library.layouts)} modes reached the tray`);
  L.push(`palette: the tray carries no palette — 0/${dice.library.palettes} palettes reachable via the dice (frozen axis, spec §0)`);
  L.push(`trio distinctness (PA1): mean pairwise cast overlap ${pct(dice.trios.meanPairwiseJaccard)} · trios with a >=50%-overlap pair ${pct(dice.trios.hiOverlapPct)}`);
  L.push(`concentration: top 15 assets take ${pct(dice.tray.top15Share)} of finalist slots`);
  L.push(`random doors (RA2): ${doors.keys.length} keys x ${doors.draws} seeded rolls — in declared ranges: ${doors.allInRange ? 'all' : 'VIOLATIONS'} · quartile reach: ${doors.allQuartiles ? 'all keys' : 'SOFT FUNNEL (see below)'}`);
  for (const k of doors.keys) {
    for (const [e, s] of k.streams.entries()) {
      const flag = s.reachesLowQuartile && s.reachesHighQuartile ? '' : '  SOFT FUNNEL — quartile unreached';
      if (flag || k.outOfRange) {
        L.push(`  ${k.key}${k.pair ? `[${e}]` : ''}: rolled [${s.min}, ${s.max}] of declared [${s.lo}, ${s.hi}]${flag}${k.outOfRange ? ` · ${k.outOfRange} out-of-range draws` : ''}`);
      }
    }
  }
  L.push(`evolve targets: ${evolve.draws} draws — all 18 keys present: ${evolve.allPresent} · finite: ${evolve.allFinite} · locks respected: ${evolve.locksRespected}`);
  if (keeps) {
    L.push(`keeps: ${keeps.keeps} records (${keeps.withCast} with cast, ${keeps.castless} castless legacy) · categories spanned ${frac(keeps.distinctCategories, dice.categories.length)} · palettes ${keeps.distinctPalettes} · layouts ${keeps.distinctLayouts}${keeps.unknownIds ? ` · ${keeps.unknownIds} unknown (custom) asset ids` : ''}`);
  }
  if (keepsNote) L.push(`keeps note: ${keepsNote}`);
  return L.join('\n');
}
