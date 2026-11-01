// chapterMemory.selfcheck.mjs — #1858 (BOOK S5): the per-chapter taste
// histogram — trust-boundary validation, the walk's lean inside her
// standing bounds, and the absorption pair (D5's decision made visible).
//
// The fixture (chapterMemory.fixture.json) is SHARED with the Studio
// trainer: studio/curator.py's selfcheck asserts the trainer reproduces
// these exact extensions from the raw ledger rows; here the runtime side
// is pinned — validation accepts the trainer's output verbatim, drops the
// malformed, and derives biases that can aim the walk but never wall it.
//
// Run: node src/curator/chapterMemory.selfcheck.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../data/chapters.js';
import { validateTaste } from './tasteHead.js';
import { FEATURES_VERSION } from './recipeFeatures.js';
import { M1_BIAS, MIN_KEEPS } from './queenLean.mjs'; // selfchecks sit outside the deniability import graph
import {
  CHAPTER_MEMORY_VERSION,
  CHAPTER_LEAN_CAP,
  CHAPTER_MEMORY_MIN_KEEPS,
  validateChapterMemory,
  chapterLeanBiases,
  chapterMemorySummary,
} from './chapterMemory.mjs';
import { chapterWeights, dealLanding, chapterWeight } from '../state/chapterWalk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./chapterMemory.fixture.json', import.meta.url), 'utf8'));
const seasonRecency = fixture.cases.season.expectedRecency;
const seasonCanon = fixture.cases.season.expectedCanon;

// ── 0. Her standing law, cross-pinned by value (the loisCut precedent):
// S5's cap and floor ARE the Queen's — one law, two homes, and a drift in
// either home fails here rather than quietly forking the bounds.
assert.equal(CHAPTER_LEAN_CAP, M1_BIAS, 'the chapter lean cap is her bias cap (0.06)');
assert.equal(CHAPTER_LEAN_CAP, 0.06);
assert.equal(CHAPTER_MEMORY_MIN_KEEPS, MIN_KEEPS, 'the chapter lean floor is her keeps floor (8)');
assert.equal(CHAPTER_MEMORY_MIN_KEEPS, 8);

// ── 0b. The trainer's chapter vocabulary mirrors the book, in spine order
// (the Python side cannot import the JS table; a drift fails here and in
// curator.py's selfcheck pin of the same fixture extension ids).
{
  const py = readFileSync(`${here}/../../../studio/curator.py`, 'utf8');
  const m = py.match(/CHAPTER_IDS = \[([^\]]+)\]/);
  assert.ok(m, 'curator.py declares CHAPTER_IDS');
  const ids = [...m[1].matchAll(/["']([a-z-]+)["']/g)].map((x) => x[1]);
  assert.deepEqual(ids, CHAPTERS.map((c) => c.id), 'trainer CHAPTER_IDS mirror the book spine order');
}

// ── 1. The trainer's own extensions validate clean, verbatim.
for (const [name, ext] of [
  ['decay recency', fixture.cases.decay.expected],
  ['season recency', seasonRecency],
  ['season canon', seasonCanon],
]) {
  assert.deepEqual(validateChapterMemory(ext), ext, `${name}: the fixture extension validates verbatim`);
}

// ── 2. Through the trust boundary (validateTaste): extension carried when
// sound, DROPPED (never a refusal) when not; old files unchanged.
const head = { terms: {}, num: {}, bias: 0, fidelity: 0.9, fitOn: 12 };
const tasteWith = (chapters) => ({ kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, head, chapters });
{
  const r = validateTaste(tasteWith(seasonRecency));
  assert.equal(r.ok, true);
  assert.deepEqual(r.taste.chapters, seasonRecency, 'a sound extension rides the validated taste');
}
{
  const r = validateTaste({ kind: 'kc-taste', version: 1, featuresVersion: FEATURES_VERSION, head });
  assert.equal(r.ok, true, 'an old file (no extension) still validates');
  assert.equal('chapters' in r.taste, false, 'an old file stays exactly the taste it was');
}
const dropped = {
  'wrong version': { ...seasonRecency, version: 2 },
  'unknown chapter': { ...seasonRecency, byChapter: { ...seasonRecency.byChapter, atlantis: { keeps: 1, passes: 0 } } },
  'negative weight': { ...seasonRecency, byChapter: { grunge: { keeps: -1, passes: 0 } } },
  'chapters outweigh totals': {
    ...seasonRecency,
    byChapter: { ...seasonRecency.byChapter, grunge: { keeps: seasonRecency.totals.keeps + 1, passes: 0 } },
  },
  'notch outweighs chapter': {
    ...seasonRecency,
    byNotch: { grunge: { 0: { keeps: seasonRecency.byChapter.grunge.keeps + 1, passes: 0 } } },
  },
  'bad notch level': { ...seasonRecency, byNotch: { grunge: { 3: { keeps: 1, passes: 0 } } } },
  'recency without a half-life': { ...seasonRecency, memory: { kind: 'recency', halfLifeDays: null } },
  'half-life of zero': { ...seasonRecency, memory: { kind: 'recency', halfLifeDays: 0 } },
  'fractional totals': { ...seasonRecency, totals: { keeps: 20.5, passes: 16 } },
};
for (const [name, bad] of Object.entries(dropped)) {
  const r = validateTaste(tasteWith(bad));
  assert.equal(r.ok, true, `${name}: the file still validates`);
  assert.equal('chapters' in r.taste, false, `${name}: the extension is dropped, the heads untouched`);
  assert.equal(validateChapterMemory(bad), null, `${name}: validator says null`);
}
assert.equal(validateChapterMemory(null), null);
assert.equal(validateChapterMemory('chapters'), null);
assert.equal(CHAPTER_MEMORY_VERSION, 1);

// ── 3. The derivation: floor, shrinkage, cap, direction.
{
  // The floor: fewer counted keeps than her floor → identity (null), even
  // with a lopsided histogram.
  const shy = {
    version: 1,
    memory: { kind: 'canon', halfLifeDays: null },
    totals: { keeps: 7, passes: 0 },
    byChapter: { grunge: { keeps: 7, passes: 0 } },
    byNotch: {},
  };
  assert.equal(chapterLeanBiases(shy), null, 'below the 8-keeps floor the lean is identity');
  assert.equal(chapterLeanBiases(null), null);
  assert.equal(chapterLeanBiases(undefined), null);

  // Saturation: a chapter that took every keep, at scale, earns exactly
  // the cap and never a hair past it.
  const saturated = {
    version: 1,
    memory: { kind: 'canon', halfLifeDays: null },
    totals: { keeps: 1_000_000, passes: 0 },
    byChapter: { now: { keeps: 1_000_000, passes: 0 } },
    byNotch: {},
  };
  const satBias = chapterLeanBiases(saturated).now;
  assert.ok(satBias <= CHAPTER_LEAN_CAP && satBias > 0.059, `the cap binds at scale (got ${satBias})`);

  // Shrinkage: the same raw rate earns LESS lean on thin evidence than on
  // thick — the prior pulls small samples toward the book's own rate.
  const thin = {
    version: 1,
    memory: { kind: 'canon', halfLifeDays: null },
    totals: { keeps: 8, passes: 8 },
    byChapter: { grunge: { keeps: 8, passes: 0 }, swiss: { keeps: 0, passes: 8 } },
    byNotch: {},
  };
  const thick = {
    ...thin,
    totals: { keeps: 800, passes: 800 },
    byChapter: { grunge: { keeps: 800, passes: 0 }, swiss: { keeps: 0, passes: 800 } },
  };
  assert.ok(
    chapterLeanBiases(thin).grunge < chapterLeanBiases(thick).grunge,
    'thin evidence leans less than thick at the same rate (prior shrinkage)',
  );

  // Direction on the season: engraving (the performer's current season)
  // leans harder than grunge (the distant era) under recency; every bias
  // sits inside [0, cap]; a chapter the histogram never saw gets none.
  const lean = chapterLeanBiases(seasonRecency);
  assert.ok(lean.engraving > lean.grunge, 'recency leans toward the current season');
  for (const [id, b] of Object.entries(lean)) assert.ok(b >= 0 && b <= CHAPTER_LEAN_CAP, `${id} inside the cap`);
  assert.equal('memphis' in lean, false, 'an unobserved chapter earns no lean entry');
  assert.ok(Object.isFrozen(lean), 'the lean map is frozen — derivation output, not a scratchpad');
}

// ── 4. Walk consumption: shape honesty, clamping, novelty dominance.
{
  const plain = chapterWeights({ marks: 2 });
  assert.equal(plain.find((r) => r.id === 'marks').lean, undefined, 'no lean in, no lean field out (S2 shape)');
  const leaned = chapterWeights({ marks: 2 }, { marks: 5, grunge: 0.02 });
  const marks = leaned.find((r) => r.id === 'marks');
  assert.equal(marks.lean, CHAPTER_LEAN_CAP, 'an over-cap lean is clamped at the point of application');
  assert.equal(marks.weight, chapterWeight(2) + CHAPTER_LEAN_CAP);
  assert.equal(leaned.find((r) => r.id === 'grunge').lean, 0.02);

  // Novelty dominance, the structural law: the heaviest a VISITED chapter
  // can ever get (1 visit + full cap) still loses to the lightest
  // UNVISITED chapter — taste aims the walk, it never walls off the book.
  assert.ok(chapterWeight(1) + CHAPTER_LEAN_CAP < chapterWeight(0), 'unvisited always outweighs visited+cap');
}

// ── 5. Direction in the deal: with novelty spent evenly, the leaned
// chapter lands more than its unleaned twin chapter; without a lean the
// same seed deals them evenly.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simulate(lean, { burns = 40, deals = 3000, seed = 1858 } = {}) {
  const rng = mulberry32(seed);
  const visits = Object.fromEntries(CHAPTERS.map((c) => [c.id, burns]));
  const landed = Object.fromEntries(CHAPTERS.map((c) => [c.id, 0]));
  let from = null;
  for (let i = 0; i < deals; i++) {
    const d = dealLanding(rng, { fromId: from, visits, lean });
    landed[d.chapterId] += 1;
    visits[d.chapterId] += 1;
    from = d.chapterId;
  }
  return Object.fromEntries(Object.entries(landed).map(([k, v]) => [k, v / deals]));
}
{
  const ext = {
    version: 1,
    memory: { kind: 'canon', halfLifeDays: null },
    totals: { keeps: 30, passes: 20 },
    byChapter: { engraving: { keeps: 18, passes: 2 }, marks: { keeps: 0, passes: 10 } },
    byNotch: {},
  };
  const lean = chapterLeanBiases(ext);
  const withLean = simulate(lean);
  const without = simulate(null);
  assert.ok(
    withLean.engraving > without.engraving,
    `the lean raises the kept chapter's landings (${withLean.engraving.toFixed(3)} vs ${without.engraving.toFixed(3)})`,
  );
  assert.ok(withLean.engraving > withLean.marks, 'the kept chapter out-lands the passed one under the lean');
}

// ── 6. THE ABSORPTION PAIR — D5 made visible (spec §6). The season: a
// grunge era, then an engraving season, 84 days apart = exactly 6 of the
// fixture's half-lives. Same ledger, two memories:
//   canon   — the trap is real: the dead era's lean never fades, and the
//             walk (past a novelty burn-in) lands in it at a trapped rate.
//   recency — the ruled horizon: era-1 evidence is worth ≤ 1/32 by
//             construction, the lean re-opens, and the CURRENT season
//             out-lands the dead era. This is the test D5's ruling arms:
//             whichever memory the trainer is told to play, the walk
//             behaves as that memory says.
{
  // The trap is a LONG-RUN property: it deepens as session novelty spends
  // (measured: grunge share 0.27 at 40-visit burn-in, 0.40 at 500, still
  // climbing) — so the pair runs deep in the lean's regime, where the only
  // thing left speaking is the memory itself.
  const longRun = { burns: 500, deals: 10000 };
  const canon = simulate(chapterLeanBiases(seasonCanon), longRun);
  assert.ok(
    canon.grunge >= 0.35,
    `canon traps: grunge takes ${(canon.grunge * 100).toFixed(1)}% of landings long-run (≥35% expected)`,
  );
  // The horizon arithmetic itself, asserted on the extension (not on a
  // vibe): six half-lives leave at most 1/32 of the era's weight.
  assert.ok(
    seasonRecency.byChapter.grunge.keeps <= seasonCanon.byChapter.grunge.keeps / 32 + 1e-9,
    'at the ruled horizon (6 half-lives), era-1 keeps weigh ≤ 1/32 of canon',
  );
  const recency = simulate(chapterLeanBiases(seasonRecency), longRun);
  assert.ok(
    recency.grunge < 0.3,
    `recency re-opens: grunge falls to ${(recency.grunge * 100).toFixed(1)}% of landings (<30%)`,
  );
  assert.ok(
    recency.engraving > recency.grunge,
    'recency re-opens: the current season out-lands the dead era',
  );
}

// ── 7. The backstage line says which memory, in the file's own words.
{
  assert.equal(chapterMemorySummary(null), 'book memory · none — chapter landings run on novelty alone');
  assert.equal(chapterMemorySummary({}), 'book memory · none — chapter landings run on novelty alone');
  const rec = chapterMemorySummary({ chapters: seasonRecency });
  assert.match(rec, /recency/, 'the line names the recency memory');
  assert.match(rec, /half-life 14d/, 'the line carries the declared half-life');
  assert.match(rec, /Engraving/, 'the line names the chapter leaned hardest');
  const can = chapterMemorySummary({ chapters: seasonCanon });
  assert.match(can, /canon/, 'the line names the canon memory');
  const shy = chapterMemorySummary({
    chapters: {
      version: 1,
      memory: { kind: 'canon', halfLifeDays: null },
      totals: { keeps: 3, passes: 1 },
      byChapter: { grunge: { keeps: 3, passes: 1 } },
      byNotch: {},
    },
  });
  assert.match(shy, /no lean yet/, 'below the floor the line says there is no lean');
}

console.log(
  'chapterMemory.selfcheck: ok (#1858 — extension validates at the boundary, lean inside her bounds, canon traps / recency re-opens)',
);
