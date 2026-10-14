// prospecting.mjs — #1508 (Look Explorer E4): corners, the Queen's
// evidence, and yield that accrues.
//
// Three pure jobs (no clock, no Math.random, no store):
//
// 1. CORNERS AS DATA. A prospecting corner is its render profile read
//    as a place: the profile's palette, its declared bias ranges, its
//    forces (renderProfiles.js — consumed as data, never edited
//    here; profiles change only via their source files on Matt's
//    word). The wilderness corner is the uniform open field: no
//    palette, no biases, no forces. `declaredNumRanges` states each
//    corner's bias box in recipeFeatures' normalized `num` space (the
//    same normalization recipeFeatures applies — PARAM_SPEC for
//    scalars, the dice's own pair bounds for scale/rotate/alpha), so
//    a corner run's finalist centroid can be PROVEN inside the box
//    its profile declares (acceptance, #1508).
//
// 2. THE QUEEN'S EVIDENCE — deliberately NOT here. Her mechanics
//    have exactly one host in the app graph (director.js) and the
//    deniability suite enforces that import graph (DS rule 10), so
//    no explorer module imports queenLean. Her evidence over a run's
//    finalists is computed by the run tool's operator module
//    (scripts/queenEvidence.mjs) from this stage's artifacts — her
//    own functions, her own bounds, reported as run telemetry. The
//    biases steer nothing in the explorer (selection stays
//    farthest-point; spec §3.4 attaches no scores) and write nothing
//    to taste (keeps remain her only anchor, spec §7).
//
// 3. YIELD ACCRUAL (spec §6). Per corner, over any set of runs plus
//    the taste ledgers: candidates mined, finalists, LOIS keeps /
//    passes (the runs' verdicts), crowns and human passes (ledger
//    rows whose provenance names the corner — E3's wiring made them
//    countable). A corner with finalists across two or more runs and
//    zero crowns is FLAGGED FOR RETIREMENT — reported, never widened
//    (acceptance, #1508). Run-vs-run comparison is NOT here: the
//    accrual's per-run rows are the standing comparison surface; a
//    dedicated drift diff is a named gap (staging report).
import { getRenderProfile } from './renderProfiles.js';
import { PARAM_SPEC } from '../data/layout-modes.js';
import { CORNERS } from './miner.mjs';
import { cornerWord } from './provenance.mjs';

export { CORNERS };

// ── corners as data ─────────────────────────────────────────────────
export function cornerDefinition(corner) {
  if (corner === 'wilderness') {
    return {
      id: 'wilderness', kind: 'wilderness', word: 'wilderness',
      paletteId: null, biases: null, forces: null, modes: null,
    };
  }
  const p = getRenderProfile(corner);
  if (!p) return null;
  return {
    id: p.id,
    kind: 'profile',
    word: cornerWord(p.id),
    paletteId: p.paletteId,
    biases: p.modes ? null : p.biases,
    forces: p.modes ? null : p.forces,
    modes: p.modes ?? null,
  };
}

// The pair bounds recipeFeatures.recipeNumerics applies (its
// PAIR_NUMS): rotate spread over 360, alpha mid over 100. Declared
// ranges are mapped through the same arithmetic so the box and the
// centroid share one space.
//
// SCALE IS NOT IN THIS MAP, deliberately: since #1202 the normalized
// params carry scale as { x, y } pairs, and recipeNumerics' scaleMid
// still reads the legacy array shape — it is structurally 0 for
// every normalized recipe in the shipped substrate (verified:
// features.num.scaleMid === 0 on live samples while the features'
// scale BUCKET reads the X pair correctly). A declared range over a
// dead axis would prove nothing. The substrate carries scale
// honestly as the bucket, so scale is proven at bucket granularity
// (declaredScaleBuckets below) and the dead axis is named, not
// papered over. Fixing scaleMid means redefining FEATURES_VERSION 3
// — the taste substrate's call, not this stage's (staging report).
const pairRange = {
  rotate: ([[a, b], [c, d]]) => ['rotateSpread', [(c - b) / 360, (d - a) / 360]],
  alpha: ([[a, b], [c, d]]) => ['alphaMid', [((a + c) / 2) / 100, ((b + d) / 2) / 100]],
};

// recipeFeatures' scale bucket edges over the X pair's mid.
const SCALE_EDGES = [0.8, 1.5];
const SCALE_NAMES = ['small', 'medium', 'large'];

/**
 * The scale buckets a corner's declared scale ranges can land in:
 * the rolled pair's mid spans [(a+c)/2, (b+d)/2] per mode; the
 * envelope across a dual-mode profile's modes. Null for the
 * wilderness and for a profile that declares no scale.
 */
export function declaredScaleBuckets(corner) {
  const def = cornerDefinition(corner);
  if (!def || def.kind === 'wilderness') return null;
  const mids = [];
  const collect = (biases) => {
    const sc = biases?.scale;
    if (Array.isArray(sc)) mids.push([(sc[0][0] + sc[1][0]) / 2, (sc[0][1] + sc[1][1]) / 2]);
  };
  if (def.modes) for (const mode of Object.values(def.modes)) collect(mode.biases);
  else collect(def.biases);
  if (!mids.length) return null;
  const lo = Math.min(...mids.map((m) => m[0]));
  const hi = Math.max(...mids.map((m) => m[1]));
  const out = [];
  for (let i = 0; i < SCALE_NAMES.length; i++) {
    const bLo = i === 0 ? -Infinity : SCALE_EDGES[i - 1];
    const bHi = i === SCALE_NAMES.length - 1 ? Infinity : SCALE_EDGES[i];
    if (lo < bHi && hi >= bLo) out.push(SCALE_NAMES[i]);
  }
  return out;
}

function rangesFromBiases(biases, into = new Map()) {
  for (const [key, spec] of Object.entries(biases || {})) {
    if (pairRange[key]) {
      const [name, range] = pairRange[key](spec);
      into.set(name, range);
    } else {
      const s = PARAM_SPEC[key];
      if (!s || !(s.max > s.min)) continue;
      into.set(key, [(spec[0] - s.min) / (s.max - s.min), (spec[1] - s.min) / (s.max - s.min)]);
    }
  }
  return into;
}

/**
 * The corner's declared bias box in recipeFeatures `num` space:
 * { numKey: [lo, hi] } with bounds clamped to 0..1 (recipeNumerics
 * clamps the same way). A dual-mode profile (stock) declares the
 * envelope across its modes — a candidate rolls one mode, so the
 * honest box is the union. Null for the wilderness (it declares
 * nothing — that is what makes it the wilderness).
 */
export function declaredNumRanges(corner) {
  const def = cornerDefinition(corner);
  if (!def || def.kind === 'wilderness') return null;
  const into = new Map();
  if (def.modes) {
    for (const mode of Object.values(def.modes)) {
      const sub = rangesFromBiases(mode.biases, new Map());
      for (const [k, [lo, hi]] of sub) {
        const cur = into.get(k);
        into.set(k, cur ? [Math.min(cur[0], lo), Math.max(cur[1], hi)] : [lo, hi]);
      }
    }
  } else {
    rangesFromBiases(def.biases, into);
  }
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return Object.fromEntries([...into].map(([k, [lo, hi]]) => [k, [clamp(lo), clamp(hi)]]));
}

/** Mean of feature `num` maps (the feature-space centroid). */
export function featureCentroid(featuresList) {
  const list = (featuresList || []).filter((f) => f && f.num);
  if (!list.length) return null;
  const keys = Object.keys(list[0].num);
  const out = {};
  for (const k of keys) {
    let s = 0;
    for (const f of list) s += f.num[k] ?? 0;
    out[k] = s / list.length;
  }
  return out;
}

/**
 * Is a centroid inside a corner's declared box? Returns the list of
 * violations ({ key, value, range }) — empty means inside. Only keys
 * the corner declares are judged; a key the centroid lacks is a
 * violation of presence, not a pass.
 */
export function centroidViolations(centroid, ranges, eps = 0.01) {
  if (!centroid || !ranges) return [{ key: '(all)', value: null, range: null }];
  const out = [];
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    const v = centroid[k];
    if (!Number.isFinite(v) || v < lo - eps || v > hi + eps) {
      out.push({ key: k, value: v ?? null, range: [lo, hi] });
    }
  }
  return out;
}

// ── yield accrual (spec §6) ─────────────────────────────────────────
const emptyCornerRow = (corner) => ({
  corner,
  word: cornerWord(corner),
  candidates: 0,
  finalists: 0,
  loisKeeps: 0,
  loisPasses: 0,
  crowns: 0,
  humanPasses: 0,
  runsPresent: 0,
  crownRate: 0,
  loisKeepRate: 0,
  retire: false,
});

/**
 * Accrue yield over runs + ledgers.
 *   runs:    [{ runId, candidates: [{ corner }], finalists: [record] }]
 *            — the run folders' own artifacts (candidates.json /
 *            finalists.json shapes); finalist records carry
 *            provenance + loisVerdict (E4).
 *   ledgers: { keeps: [row], passes: [row] } — taste-ledger rows;
 *            only rows with explorer provenance accrue (a hand keep
 *            is not a corner's crown).
 * Retirement: finalists in ≥2 distinct runs, zero crowns → flagged.
 * The flag is a report, never an action: nothing widens, nothing
 * retires itself.
 */
export function yieldAccrual({ runs = [], ledgers = {} } = {}) {
  const byCorner = new Map();
  const row = (corner) => {
    const k = typeof corner === 'string' && corner ? corner : 'wilderness';
    if (!byCorner.has(k)) byCorner.set(k, emptyCornerRow(k));
    return byCorner.get(k);
  };
  for (const c of CORNERS) row(c);
  const runRows = [];
  for (const run of runs || []) {
    const present = new Set();
    let rc = 0; let rf = 0; let rk = 0; let rp = 0;
    for (const cand of run?.candidates || []) { row(cand?.corner).candidates++; rc++; }
    for (const f of run?.finalists || []) {
      const r = row(f?.provenance?.corner);
      r.finalists++; rf++;
      present.add(r.corner);
      if (f?.loisVerdict?.verdict === 'keep') { r.loisKeeps++; rk++; }
      if (f?.loisVerdict?.verdict === 'pass') { r.loisPasses++; rp++; }
    }
    for (const k of present) byCorner.get(k).runsPresent++;
    runRows.push({
      runId: run?.runId ?? null, candidates: rc, finalists: rf, loisKeeps: rk, loisPasses: rp,
    });
  }
  for (const k of ledgers?.keeps || []) {
    if (k?.provenance?.source === 'explorer') row(k.provenance.corner).crowns++;
  }
  for (const p of ledgers?.passes || []) {
    if (p?.provenance?.source === 'explorer') row(p.provenance.corner).humanPasses++;
  }
  const corners = [...byCorner.values()].map((r) => ({
    ...r,
    crownRate: r.finalists ? +(r.crowns / r.finalists).toFixed(4) : 0,
    loisKeepRate: (r.loisKeeps + r.loisPasses) ? +(r.loisKeeps / (r.loisKeeps + r.loisPasses)).toFixed(4) : 0,
    retire: r.runsPresent >= 2 && r.finalists > 0 && r.crowns === 0,
  })).sort((a, b) => b.crowns - a.crowns || b.finalists - a.finalists || a.corner.localeCompare(b.corner));
  return {
    runs: runRows,
    corners,
    totals: {
      candidates: corners.reduce((s, r) => s + r.candidates, 0),
      finalists: corners.reduce((s, r) => s + r.finalists, 0),
      loisKeeps: corners.reduce((s, r) => s + r.loisKeeps, 0),
      loisPasses: corners.reduce((s, r) => s + r.loisPasses, 0),
      crowns: corners.reduce((s, r) => s + r.crowns, 0),
      humanPasses: corners.reduce((s, r) => s + r.humanPasses, 0),
      runs: runRows.length,
    },
  };
}

export function formatYieldReport(accrual) {
  const L = [];
  const t = accrual.totals;
  L.push('EXPLORER YIELD BY CORNER — accrued (spec §6)');
  L.push(`runs ${t.runs} · mined ${t.candidates} · finalists ${t.finalists} · LOIS keeps ${t.loisKeeps} · LOIS passes ${t.loisPasses} · crowns ${t.crowns} · human passes ${t.humanPasses}`);
  L.push('crowns and human passes are counted from the taste ledgers’ explorer-provenance rows (E3’s wiring); LOIS keeps/passes from the runs’ own verdicts.');
  L.push('');
  for (const r of accrual.corners) {
    L.push(
      `  ${r.word.padEnd(16)} mined ${String(r.candidates).padStart(4)} · finalists ${String(r.finalists).padStart(3)}`
      + ` · LOIS keep ${r.loisKeeps} / pass ${r.loisPasses} · crowns ${r.crowns} · human passes ${r.humanPasses}`
      + ` · crown rate ${r.crownRate} · runs ${r.runsPresent}${r.retire ? ' · ⚠ RETIREMENT FLAG' : ''}`,
    );
  }
  const flagged = accrual.corners.filter((r) => r.retire);
  L.push('');
  if (flagged.length) {
    L.push('RETIREMENT FLAGS (finalists across ≥2 runs, zero crowns — flagged for retirement, NOT widened):');
    for (const r of flagged) L.push(`  ⚠ ${r.word} (${r.corner}) — ${r.finalists} finalists over ${r.runsPresent} runs, 0 crowns`);
  } else {
    L.push('RETIREMENT FLAGS: none — no corner has finalists across ≥2 runs with zero crowns.');
  }
  return L.join('\n');
}
